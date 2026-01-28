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

  const status = obj.status === "verified" || obj.status === "speculation" ? obj.status : "speculation";

  if (!title || !summary || !description) return null;
  if (!title.includes("$")) return null;
  if (proofSources.length < 2) return null;
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

async function callPerplexity({
  apiKey,
  query,
}: {
  apiKey: string;
  query: string;
}): Promise<{
  model?: string;
  content: string;
  citations: string[];
  searchResults: Array<{ title?: string; url?: string; date?: string; snippet?: string }>;
  raw: unknown;
}> {
  const model = process.env.PERPLEXITY_MODEL ?? "sonar-pro";
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1400,
      web_search_options: {
        search_recency_filter: "week",
        num_search_results: 20,
        safe_search: true,
      },
      messages: [
        {
          role: "system",
          content:
            "You are a research assistant. Find *publicly verifiable* examples of AI agents making money in the last 7 days. Exclude fundraising/valuations/grants. Prefer official pages, winners lists, public dashboards, or reputable reporting. Prioritize items with explicit $ amounts.",
        },
        {
          role: "user",
          content: query,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Perplexity failed: ${res.status} ${body.slice(0, 1500)}`);
  }

  const json = (await res.json()) as any;
  const content = String(json?.choices?.[0]?.message?.content ?? "");
  const citations = Array.isArray(json?.citations) ? (json.citations as string[]) : [];
  const searchResults = Array.isArray(json?.search_results) ? (json.search_results as any[]) : [];

  return { model, content, citations, searchResults, raw: json };
}

async function callClaudeHaiku({
  apiKey,
  sources,
  perplexitySummary,
}: {
  apiKey: string;
  sources: Array<{ title: string; url: string; date?: string; snippet?: string }>;
  perplexitySummary: string;
}): Promise<unknown[]> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

  const system = [
    "You are an editor for AgentProfit.ai.",
    "",
    "STRICT RULES:",
    "- Output must be a single JSON array ONLY (no markdown, no prose).",
    "- Each entry MUST describe an AI agent or agentic workflow making money/profit with a specific $ amount.",
    "- EXCLUDE fundraising/valuations/grants; those do NOT count as 'making money'.",
    "- Each entry MUST have 2+ proofSources.",
    "- Every proofSources.url MUST be taken EXACTLY from the provided sources list (do not invent links).",
    "- At least one proofSources.excerpt MUST contain the $ amount and MUST be copied verbatim from a provided snippet (no paraphrasing in excerpts).",
    "- Title MUST include a $ amount (include '$' character).",
    "- If the sources/snippets are too thin to be confident, set status to 'speculation' and explicitly state the proof gap in the description.",
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
    "- Produce up to 10 CaseStudy JSON objects that meet the strict rules.",
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

export async function GET(req: Request) {
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

  const resendApiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM ?? "";
  if (!resendApiKey) return NextResponse.json({ error: "RESEND_API_KEY is missing." }, { status: 500 });
  if (!from) return NextResponse.json({ error: "RESEND_FROM is missing." }, { status: 500 });

  const siteUrl = process.env.SITE_URL ?? "https://agentprofit.ai";
  const segmentIdEnv = process.env.RESEND_NEWSLETTER_SEGMENT_ID ?? "";
  const segmentName = process.env.RESEND_NEWSLETTER_SEGMENT_NAME ?? "AgentProfit Newsletter";
  const url = new URL(req.url);
  const sendParam = (url.searchParams.get("send") ?? "").toLowerCase();
  const sendEnabled =
    (process.env.WEEKLY_DIGEST_ENABLED ?? "true").toLowerCase() === "true" &&
    ((process.env.NODE_ENV === "production" && sendParam !== "0") || sendParam === "1");

  const force = (url.searchParams.get("force") ?? "") === "1";
  const limit = Math.max(1, Math.min(25, Number(url.searchParams.get("searchLimit") ?? "20") || 20));

  const runDate = todayIso();
  const runId = `${runDate}T${new Date().toISOString().slice(11, 19).replaceAll(":", "-")}Z`;

  try {
    const query =
      "Find AI agents or agentic workflows that made money in the last 7 days. Only include items with explicit dollar amounts (e.g., prizes, bounties, revenue/MRR) and public sources.";

    const p = await callPerplexity({ apiKey: perplexityKey, query });

    const sources = (Array.isArray(p.searchResults) ? p.searchResults : [])
      .map((r) => ({
        title: String(r?.title ?? "").trim(),
        url: String(r?.url ?? "").trim(),
        date: typeof r?.date === "string" ? r.date : undefined,
        snippet: typeof r?.snippet === "string" ? r.snippet : undefined,
      }))
      .filter((r) => r.title && r.url && isHttpUrl(r.url))
      .slice(0, limit);

    const allowedUrls = new Set(sources.map((s) => s.url));

    const claudeCandidates = await callClaudeHaiku({
      apiKey: anthropicKey,
      sources,
      perplexitySummary: p.content,
    });

    const fromBlob = await readLiveCaseStudiesFromBlob();
    const seed = rawCaseStudies as unknown as CaseStudy[];
    const existing = (fromBlob ?? seed).slice().sort((a, b) => b.date.localeCompare(a.date));
    const existingIds = new Set(existing.map((x) => x.id));
    const existingUrls = new Set(existing.flatMap((x) => (x.proofSources ?? []).map((s) => s.url)));

    const added: CaseStudy[] = [];
    for (const cand of claudeCandidates) {
      const cs = normalizeCaseStudyCandidate({
        cs: cand,
        allowedUrls,
        fallbackDate: runDate,
        existingIds,
      });
      if (!cs) continue;
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

export async function POST(req: Request) {
  return GET(req);
}

