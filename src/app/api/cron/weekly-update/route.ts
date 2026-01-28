import { NextResponse } from "next/server";
import rawCaseStudies from "@/data/case-studies.json";
import type { CaseStudy, ProofSource } from "@/lib/types";
import { renderWeeklyDigestEmail } from "@/lib/newsletterDigest";
import {
  resendCreateBroadcast,
  resendGetOrCreateSegmentId,
  resendSendBroadcast,
} from "@/lib/resendBroadcast";
import { readLiveCaseStudiesFromBlob, writeLiveCaseStudiesToBlob } from "@/lib/blobCaseStudies";

export const runtime = "nodejs";

function isAuthorized(req: Request) {
  // Vercel Cron sets this header automatically.
  if ((req.headers.get("x-vercel-cron") ?? "") === "1") return true;

  // Fallback for manual triggering (local/dev): Authorization: Bearer <token> OR ?token=<token>
  const token = process.env.CRON_TOKEN ?? "";
  if (!token) return false;

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token") ?? "";
  if (queryToken && queryToken === token) return true;

  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7) === token) return true;

  return false;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/\$/g, " dollars ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function coerceIsoDate(input: unknown, fallback: string) {
  const s = typeof input === "string" ? input.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

function extractJsonArray(text: string) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) throw new Error("Claude did not return a JSON array.");
  return text.slice(start, end + 1);
}

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

const SOCIAL_HOSTS = new Set([
  "facebook.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "reddit.com",
  "tiktok.com",
  "instagram.com",
  "discord.com",
  "t.me",
  "telegram.me",
]);

function isSocialUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (SOCIAL_HOSTS.has(host)) return true;
    for (const h of SOCIAL_HOSTS) {
      if (host.endsWith(`.${h}`)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function hasDollarAmount(s: string) {
  return /\$\s?\d[\d,]*(\.\d+)?/g.test(s);
}

function normalizeCaseStudyCandidate({
  cs,
  allowedUrls,
  fallbackDate,
  existingIds,
}: {
  cs: unknown;
  allowedUrls: Set<string>;
  fallbackDate: string;
  existingIds: Set<string>;
}): CaseStudy | null {
  if (!cs || typeof cs !== "object") return null;
  const obj = cs as Partial<CaseStudy>;

  const date = coerceIsoDate(obj.date, fallbackDate);
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  const description = typeof obj.description === "string" ? obj.description.trim() : "";
  const profitMechanisms = Array.isArray(obj.profitMechanisms)
    ? obj.profitMechanisms.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim())
    : [];
  const tags = Array.isArray(obj.tags) ? obj.tags.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];

  const rawSources = Array.isArray(obj.proofSources) ? (obj.proofSources as ProofSource[]) : [];
  const proofSources = rawSources
    .filter((s) => s && typeof s.label === "string" && typeof s.url === "string")
    .map((s) => ({
      label: s.label.trim(),
      url: s.url.trim(),
      kind: s.kind,
      excerpt: typeof s.excerpt === "string" ? s.excerpt.trim() : undefined,
    }))
    .filter((s) => s.label && s.url && isHttpUrl(s.url) && allowedUrls.has(s.url));

  let status = obj.status === "verified" || obj.status === "speculation" ? obj.status : "speculation";

  if (!title || !summary || !description) return null;
  if (!title.includes("$")) return null;
  // Allow 1-source speculation, but require 2+ sources for verified.
  if (status === "verified" && proofSources.length < 2) status = "speculation";
  if (proofSources.length < 1) return null;
  // Disallow social-only sources (speculation still needs a non-social URL).
  const nonSocial = proofSources.filter((s) => !isSocialUrl(s.url));
  if (nonSocial.length < 1) return null;
  if (!proofSources.some((s) => (s.excerpt ? hasDollarAmount(s.excerpt) : false))) return null;

  let id = typeof obj.id === "string" ? obj.id.trim() : "";
  if (!id) id = `${date}-${slugify(title)}`;
  if (!/^[a-z0-9-]+$/.test(id)) id = `${date}-${slugify(id || title)}`;
  if (!id) id = `${date}-${Math.random().toString(16).slice(2, 10)}`;

  let uniqueId = id;
  let n = 2;
  while (existingIds.has(uniqueId)) {
    uniqueId = `${id}-${n}`;
    n += 1;
  }
  existingIds.add(uniqueId);

  return {
    id: uniqueId,
    date,
    title,
    summary,
    description,
    profitMechanisms: profitMechanisms.length ? profitMechanisms : ["Unspecified (see proof sources)"],
    tags,
    proofSources,
    status,
  };
}

async function ensureDir(p: string) {
  // No-op in Blob mode (kept for backwards compatibility if needed).
  void p;
}

async function writeJsonFile(p: string, value: unknown) {
  // No-op in Blob mode (kept for backwards compatibility if needed).
  void p;
  void value;
}

function formatMmDdYyyyUTC(d: Date) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function extractPerplexityResponseText(json: any) {
  const output = Array.isArray(json?.output) ? (json.output as any[]) : [];
  const texts: string[] = [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    const parts = Array.isArray(item?.content) ? (item.content as any[]) : [];
    for (const part of parts) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        texts.push(part.text);
      }
    }
  }
  return texts.join("");
}

type PerplexityDeepResearchJson = {
  report: string;
  sources: Array<{
    title: string;
    url: string;
    date: string; // YYYY-MM-DD
    last_updated?: string; // YYYY-MM-DD
    snippet: string; // verbatim excerpt containing $ amount
  }>;
};

async function callPerplexity({
  apiKey,
  query,
  recency,
  numSearchResults,
  withinDays,
  todayUtc,
}: {
  apiKey: string;
  query: string;
  recency: "day" | "week" | "month" | "year";
  numSearchResults: number;
  withinDays: number;
  todayUtc: Date;
}): Promise<{
  model?: string;
  content: string;
  citations: string[];
  searchResults: Array<{ title?: string; url?: string; date?: string; snippet?: string }>;
  raw: unknown;
}> {
  const preset = process.env.PERPLEXITY_PRESET ?? "deep-research";
  const socialDeny = Array.from(SOCIAL_HOSTS)
    .filter((d) => !d.includes("."))
    .map((d) => `-${d}`);
  const cutoffUtc = withinDays ? new Date(todayUtc.getTime() - withinDays * 86_400_000) : null;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["report", "sources"],
    properties: {
      report: { type: "string" },
      sources: {
        type: "array",
        maxItems: 25,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "url", "date", "snippet"],
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            date: { type: "string", description: "YYYY-MM-DD" },
            last_updated: { type: "string", description: "YYYY-MM-DD" },
            snippet: { type: "string", description: "Verbatim excerpt containing the $ amount." },
          },
        },
      },
    },
  };

  const instructions = [
    "You are a research agent for AgentProfit.ai.",
    "Goal: find publicly verifiable examples of AI agents/agentic workflows that made money with explicit $ amounts.",
    "Exclude fundraising/valuations/grants.",
    "Prefer official pages, winners lists, public dashboards, or reputable reporting.",
    "Output MUST be valid JSON matching the provided schema.",
    "In sources[].snippet, include a VERBATIM quote that contains the $ amount.",
    "Avoid social media sources (Facebook/X/Twitter/LinkedIn/Reddit/TikTok/Instagram/Discord/Telegram).",
    `Return at most ${Math.max(5, Math.min(25, numSearchResults))} sources.`,
  ].join("\n");

  const toolFilters: any = {
    search_domain_filter: socialDeny.slice(0, 20),
  };
  // Prefer explicit published + last-updated windows when we have a cutoff.
  // (Docs note recency can't be combined with explicit date filters.)
  if (cutoffUtc) {
    toolFilters.search_after_date_filter = formatMmDdYyyyUTC(cutoffUtc);
    toolFilters.search_before_date_filter = formatMmDdYyyyUTC(todayUtc);
    toolFilters.last_updated_after_filter = formatMmDdYyyyUTC(cutoffUtc);
    toolFilters.last_updated_before_filter = formatMmDdYyyyUTC(todayUtc);
  } else {
    toolFilters.search_recency_filter = recency;
  }

  const res = await fetch("https://api.perplexity.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      preset,
      input: query,
      instructions,
      max_steps: 10,
      max_output_tokens: 2500,
      tools: [
        {
          type: "web_search",
          filters: toolFilters,
          max_tokens_per_page: 2048,
          max_tokens: 25000,
        },
        { type: "fetch_url", max_urls: 5 },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "agentprofit_deep_research", schema, strict: true },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Perplexity failed: ${res.status} ${body.slice(0, 1500)}`);
  }

  const json = (await res.json()) as any;
  const text = extractPerplexityResponseText(json);
  const parsed = JSON.parse(text) as PerplexityDeepResearchJson;
  const citations = Array.isArray(parsed?.sources) ? parsed.sources.map((s) => s.url).filter(Boolean) : [];
  const searchResults = Array.isArray(parsed?.sources) ? parsed.sources : [];
  return { model: json?.model ?? preset, content: parsed?.report ?? "", citations, searchResults, raw: json };
}

async function callClaudeHaiku({
  apiKey,
  sources,
  perplexitySummary,
  maxItems,
}: {
  apiKey: string;
  sources: Array<{ title: string; url: string; date?: string; snippet?: string }>;
  perplexitySummary: string;
  maxItems: number;
}): Promise<unknown[]> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

  const system = [
    "You are an editor for AgentProfit.ai.",
    "",
    "STRICT RULES:",
    "- Output must be a single JSON array ONLY (no markdown, no prose).",
    "- Each entry MUST describe an AI agent or agentic workflow making money/profit with a specific $ amount.",
    "- EXCLUDE fundraising/valuations/grants; those do NOT count as 'making money'.",
    "- Prefer VERIFIED entries with 2+ proofSources.",
    "- Speculation entries may have 1 proofSource (only if you cannot find a second credible source).",
    "- Every proofSources.url MUST be taken EXACTLY from the provided sources list (do not invent links).",
    "- At least one proofSources.excerpt MUST contain the $ amount and MUST be copied verbatim from a provided snippet (no paraphrasing in excerpts).",
    "- Title MUST include a $ amount (include '$' character).",
    "- If the sources/snippets are too thin to be confident, set status to 'speculation' and explicitly state the proof gap in the description.",
    "- Do NOT use social media links (e.g. X/Twitter, Facebook, LinkedIn, Reddit, TikTok, Instagram, Discord, Telegram) as the only proof source.",
    "",
    "CaseStudy schema:",
    "{ id, date(YYYY-MM-DD), title, summary, description, profitMechanisms[], tags[], proofSources[{label,url,kind?,excerpt?}], status('verified'|'speculation') }",
    "",
    "Use short, neutral writing. Don't fabricate details not present in sources/snippets.",
  ].join("\n");

  const user = [
    "Perplexity summary (may contain extra context; treat as secondary):",
    perplexitySummary.slice(0, 6000),
    "",
    "Allowed sources (ONLY use these URLs):",
    JSON.stringify(sources, null, 2),
    "",
    "Task:",
    `- Produce up to ${maxItems} CaseStudy JSON objects that meet the strict rules.`,
    "- Ensure each has 2+ proofSources from the allowed sources.",
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic failed: ${res.status} ${body.slice(0, 1500)}`);
  }

  const json = (await res.json()) as any;
  const text = Array.isArray(json?.content)
    ? (json.content as any[]).filter((b) => b?.type === "text").map((b) => String(b.text ?? "")).join("")
    : "";

  const arr = JSON.parse(extractJsonArray(text)) as unknown;
  if (!Array.isArray(arr)) throw new Error("Claude output JSON was not an array.");
  return arr as unknown[];
}

export type WeeklyUpdateOptions = {
  /** Force-disable Resend sending (scout-only runs). */
  disableSend?: boolean;
  /** Default time window for accepting new case studies (used when query param is absent). */
  defaultWithinDays?: number;
};

export async function runWeeklyUpdate(req: Request, opts: WeeklyUpdateOptions = {}) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enabled = (process.env.WEEKLY_UPDATE_ENABLED ?? "true").toLowerCase() === "true";
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  if (!blobToken) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is missing. Connect Vercel Blob to this project." },
      { status: 500 },
    );
  }

  const perplexityKey = process.env.PERPLEXITY_API_KEY ?? "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!perplexityKey) return NextResponse.json({ error: "PERPLEXITY_API_KEY is missing." }, { status: 500 });
  if (!anthropicKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY is missing." }, { status: 500 });

  const siteUrl = process.env.SITE_URL ?? "https://agentprofit.ai";
  const segmentIdEnv = process.env.RESEND_NEWSLETTER_SEGMENT_ID ?? "";
  const segmentName = process.env.RESEND_NEWSLETTER_SEGMENT_NAME ?? "AgentProfit Newsletter";
  const url = new URL(req.url);
  const isCron = (req.headers.get("x-vercel-cron") ?? "") === "1";
  const sendParam = (url.searchParams.get("send") ?? "").toLowerCase();
  const sendEnabled =
    !opts.disableSend &&
    (process.env.WEEKLY_DIGEST_ENABLED ?? "true").toLowerCase() === "true" &&
    ((process.env.NODE_ENV === "production" && sendParam !== "0") || sendParam === "1");

  const resendApiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM ?? "";
  if (sendEnabled) {
    if (!resendApiKey) return NextResponse.json({ error: "RESEND_API_KEY is missing." }, { status: 500 });
    if (!from) return NextResponse.json({ error: "RESEND_FROM is missing." }, { status: 500 });
  }

  const force = (url.searchParams.get("force") ?? "") === "1";
  const limit = Math.max(1, Math.min(25, Number(url.searchParams.get("searchLimit") ?? "20") || 20));
  const find = Math.max(1, Math.min(10, Number(url.searchParams.get("find") ?? url.searchParams.get("maxNew") ?? "10") || 10));
  const recencyParam = (url.searchParams.get("recency") ?? "week").toLowerCase();
  const recency = (["day", "week", "month", "year"] as const).includes(recencyParam as any)
    ? (recencyParam as "day" | "week" | "month" | "year")
    : "week";
  const queryParam = url.searchParams.get("query") ?? url.searchParams.get("q") ?? "";
  const withinDaysParam = url.searchParams.get("withinDays") ?? url.searchParams.get("days") ?? "";
  const withinDays =
    withinDaysParam.trim() !== ""
      ? Math.max(1, Math.min(60, Number(withinDaysParam) || 0))
      : Math.max(0, Math.min(60, opts.defaultWithinDays ?? (isCron ? 7 : 0)));
  const todayUtc = (() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  })();
  const cutoffMs = withinDays ? todayUtc.getTime() - withinDays * 86_400_000 : 0;

  const runDate = todayIso();
  const runId = `${runDate}T${new Date().toISOString().slice(11, 19).replaceAll(":", "-")}Z`;

  try {
    const query =
      (queryParam || "").trim().slice(0, 600) ||
      "Find AI agents or agentic workflows that made money in the last 7 days. Only include items with explicit dollar amounts (e.g., prizes, bounties, revenue/MRR) and public sources.";

    const p = await callPerplexity({
      apiKey: perplexityKey,
      query,
      recency,
      numSearchResults: Math.max(10, limit),
      withinDays,
      todayUtc,
    });

    const sources = (Array.isArray(p.searchResults) ? p.searchResults : [])
      .map((r) => ({
        title: String(r?.title ?? "").trim(),
        url: String(r?.url ?? "").trim(),
        date: typeof r?.date === "string" ? r.date : undefined,
        snippet: typeof r?.snippet === "string" ? r.snippet : undefined,
      }))
      .filter((r) => r.title && r.url && isHttpUrl(r.url))
      .filter((r) => {
        if (!withinDays) return true;
        if (!r.date) return true;
        const t = new Date(`${r.date}T00:00:00Z`).getTime();
        return Number.isFinite(t) ? t >= cutoffMs : true;
      })
      .slice(0, limit);

    const allowedUrls = new Set(sources.map((s) => s.url));

    const claudeCandidates = await callClaudeHaiku({
      apiKey: anthropicKey,
      sources,
      perplexitySummary: p.content,
      maxItems: find,
    });

    const fromBlob = await readLiveCaseStudiesFromBlob();
    const seed = rawCaseStudies as unknown as CaseStudy[];
    const existing = (fromBlob ?? seed).slice().sort((a, b) => b.date.localeCompare(a.date));
    const existingIds = new Set(existing.map((x) => x.id));
    const existingUrls = new Set(existing.flatMap((x) => (x.proofSources ?? []).map((s) => s.url)));

    const candidateRank = (x: unknown) => {
      const s = (x as any)?.status;
      return s === "verified" ? 0 : 1;
    };
    const orderedCandidates = claudeCandidates.slice().sort((a, b) => candidateRank(a) - candidateRank(b));

    const added: CaseStudy[] = [];
    for (const cand of orderedCandidates) {
      if (added.length >= find) break;
      const cs = normalizeCaseStudyCandidate({
        cs: cand,
        allowedUrls,
        fallbackDate: runDate,
        existingIds,
      });
      if (!cs) continue;
      if (withinDays) {
        const t = new Date(`${cs.date}T00:00:00Z`).getTime();
        if (!Number.isFinite(t) || t < cutoffMs) continue;
      }
      // Deduplicate by any existing proof URL.
      if (cs.proofSources.some((s) => existingUrls.has(s.url))) continue;
      added.push(cs);
      cs.proofSources.forEach((s) => existingUrls.add(s.url));
    }

    const merged = [...existing, ...added].sort((a, b) => b.date.localeCompare(a.date));

    const runLog = {
      runDate,
      runId,
      forced: force,
      perplexity: {
        model: p.model,
        citations: p.citations,
        searchResults: sources,
        content: p.content,
      },
      generated: {
        candidateCount: claudeCandidates.length,
        addedCount: added.length,
        added: added.map((x) => ({ id: x.id, date: x.date, title: x.title, proofSources: x.proofSources })),
      },
    };

    // Persist “live” dataset to Blob (snapshot + stable manifest).
    const blobWrite = await writeLiveCaseStudiesToBlob({
      runId,
      all: merged,
      added,
      perplexityRaw: p.raw,
      claudeRaw: claudeCandidates,
      runLog,
    });

    let resend: unknown = { skipped: true, reason: "sending-disabled" };
    if (sendEnabled && added.length) {
      const segmentId = segmentIdEnv
        ? segmentIdEnv
        : await resendGetOrCreateSegmentId({
            apiKey: resendApiKey,
            segmentName,
          });

      const items = added.slice().sort((a, b) => b.date.localeCompare(a.date));
      const { name, subject, html, text } = renderWeeklyDigestEmail({
        siteUrl,
        items,
        title: "Weekly email digest — new case studies this week",
      });

      const broadcastId = await resendCreateBroadcast({
        apiKey: resendApiKey,
        segmentId,
        from,
        subject,
        html,
        text,
        name: `weekly-update-${runDate}-${name}`,
      });
      const sendResult = await resendSendBroadcast({ apiKey: resendApiKey, broadcastId });
      resend = { segmentId, broadcastId, send: sendResult };
    }

    return NextResponse.json({
      ok: true,
      runDate,
      runId,
      blob: blobWrite,
      added: added.map((x) => ({ id: x.id, date: x.date, title: x.title })),
      resend,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("restricted_api_key")) {
      return NextResponse.json(
        {
          error:
            "Your RESEND_API_KEY is restricted to sending-only. Weekly broadcasts require a full-access Resend API key (Segments/Broadcasts).",
          providerStatus: 401,
          providerBody: msg,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "Weekly update failed.", details: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runWeeklyUpdate(req);
}

export async function POST(req: Request) {
  return runWeeklyUpdate(req);
}

