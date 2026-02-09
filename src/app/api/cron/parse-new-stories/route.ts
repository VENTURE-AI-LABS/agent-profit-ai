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
import { buildClaudeSystemPrompt, buildClaudeUserPrompt, buildDefaultScoutQuery, SCOUT_CONFIG_VERSION } from "@/lib/scoutConfig";
import type { StageSource } from "@/lib/blobScoutAsync";

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

// ============================================================================
// Tiered Social Media Policy
// ============================================================================

/** Tier 1: Always allowed (primary/trusted platforms) */
const TIER1_ALLOWED_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "github.com",
  "indiehackers.com",
  "devpost.com",
  "kaggle.com",
]);

/** Tier 2: Allowed WITH corroboration (indie maker platforms) */
const TIER2_CORROBORATION_HOSTS = new Set([
  "twitter.com",
  "x.com",
  "reddit.com",
  "linkedin.com",
]);

/** Tier 3: Always blocked */
const TIER3_BLOCKED_HOSTS = new Set([
  "facebook.com",
  "tiktok.com",
  "instagram.com",
  "discord.com",
  "t.me",
  "telegram.me",
]);

function getUrlHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function hostMatches(host: string, hostSet: Set<string>): boolean {
  if (hostSet.has(host)) return true;
  for (const h of hostSet) {
    if (host.endsWith(`.${h}`)) return true;
  }
  return false;
}

function isTier1Url(url: string): boolean {
  return hostMatches(getUrlHost(url), TIER1_ALLOWED_HOSTS);
}

function isTier2Url(url: string): boolean {
  return hostMatches(getUrlHost(url), TIER2_CORROBORATION_HOSTS);
}

function isTier3Url(url: string): boolean {
  return hostMatches(getUrlHost(url), TIER3_BLOCKED_HOSTS);
}

function isXTwitterUrl(url: string): boolean {
  const host = getUrlHost(url);
  return host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com");
}


function hasDollarAmount(s: string) {
  // Support $1,234.56 and shorthand like $5k / $1.2M.
  return /\$\s?\d[\d,]*(\.\d+)?\s?(?:[kKmMbB])?/g.test(s);
}

function extractFirstDollarToken(s: string) {
  const m = s.match(/\$\s?\d[\d,]*(\.\d+)?\s?(?:[kKmMbB])?/);
  if (!m) return "";
  return m[0].replace(/\s+/g, " ").trim();
}

function extractFirstShorthandMoneyToken(s: string) {
  // Matches "100k", "1.2m", "2B" (optionally with $ prefix).
  const m = s.match(/\$?\s?\d+(?:\.\d+)?\s?(?:[kKmMbB])\b/);
  if (!m) return "";
  const raw = m[0].replace(/\s+/g, " ").trim();
  return raw.startsWith("$") ? raw : `$${raw.replace(/^\$?\s?/, "")}`;
}

const MONEY_CONTEXT_DENY = [
  "funding",
  "raised",
  "valuation",
  "capex",
  "market cap",
  "secondary market",
  "secondary markets",
  "venture",
  "series a",
  "series b",
  "series c",
  "seed round",
];

function looksLikeFundingOrValuationContext(s: string) {
  const t = s.toLowerCase();
  return MONEY_CONTEXT_DENY.some((w) => t.includes(w));
}

function isAllowedPlatformUrl(url: string) {
  return isTier1Url(url);
}

function likelySelfBlogUrl(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    if (host === "medium.com" || host.endsWith(".medium.com")) return true;
    if (host === "substack.com" || host.endsWith(".substack.com")) return true;
    if (host.startsWith("blog.")) return true;
    if (path.includes("/blog")) return true;
    return false;
  } catch {
    return false;
  }
}

function registrableDomain(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;

  // Tiny eTLD+1 approximation for common multi-part TLDs we'll see.
  const last2 = parts.slice(-2).join(".");
  const last3 = parts.slice(-3).join(".");
  const multi = new Set([
    "co.uk",
    "org.uk",
    "gov.uk",
    "ac.uk",
    "com.au",
    "net.au",
    "org.au",
    "edu.au",
    "gov.au",
    "co.nz",
    "org.nz",
    "gov.nz",
    "ac.nz",
  ]);
  if (multi.has(last2) && parts.length >= 3) return last3;
  return last2;
}

/**
 * Check if a Tier 2 social source has corroboration from Tier 1 or non-social sources.
 */
function hasTier2Corroboration(
  tier2Url: string,
  allProofSources: ProofSource[],
  grokStageUrls: Set<string>
): boolean {
  // X/Twitter URLs from Grok stage are auto-corroborated (native source)
  if (isXTwitterUrl(tier2Url) && grokStageUrls.has(tier2Url)) {
    return true;
  }

  // Check if there's at least one Tier 1 or non-social source
  for (const source of allProofSources) {
    if (source.url === tier2Url) continue;
    if (isTier1Url(source.url)) return true;
    if (!isTier2Url(source.url) && !isTier3Url(source.url)) return true;
  }

  return false;
}

function normalizeCaseStudyCandidate({
  cs,
  allowedUrls,
  fallbackDate,
  existingIds,
  mode,
  urlSnippetByUrl,
  grokStageUrls,
}: {
  cs: unknown;
  allowedUrls: Set<string>;
  fallbackDate: string;
  existingIds: Set<string>;
  mode: "strict" | "speculation";
  urlSnippetByUrl: Map<string, string>;
  grokStageUrls: Set<string>;
}): CaseStudy | null {
  if (!cs || typeof cs !== "object") return null;
  const obj = cs as Partial<CaseStudy>;

  const date = coerceIsoDate(obj.date, fallbackDate);
  let title = typeof obj.title === "string" ? obj.title.trim() : "";
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
    .filter((s) => {
      if (!s.label || !s.url || !isHttpUrl(s.url)) return false;
      // Always allow URLs from the provided sources
      if (allowedUrls.has(s.url)) return true;
      // Allow product URLs (non-social) that Claude extracted from context
      // These are typically the actual product websites mentioned in tweets
      if (s.kind === "website") return true;
      // Allow any non-social URL as potential product link
      if (!isTier2Url(s.url) && !isTier3Url(s.url) && !isXTwitterUrl(s.url)) return true;
      return false;
    });

  let status = obj.status === "verified" || obj.status === "speculation" ? obj.status : "speculation";
  const isSpeculationMode = mode === "speculation";
  // In speculation mode, don't allow the model to "upgrade" items to verified unless they pass strict checks below.
  if (isSpeculationMode) status = "speculation";

  if (!title || !summary || !description) return null;
  // Allow 1-source speculation, but require 2+ sources for verified.
  if (status === "verified" && proofSources.length < 2) status = "speculation";
  if (proofSources.length < 1) return null;

  // Apply tiered social policy:
  // - Tier 3 (blocked) sources are filtered out
  // - Tier 2 sources require corroboration
  // - Tier 1 sources are always allowed
  const filteredSources = proofSources.filter((s) => {
    // Block Tier 3
    if (isTier3Url(s.url)) return false;

    // Tier 2 requires corroboration
    if (isTier2Url(s.url)) {
      return hasTier2Corroboration(s.url, proofSources, grokStageUrls);
    }

    return true;
  });

  // Need at least one non-Tier3 source
  if (filteredSources.length < 1) return null;

  // Require at least one Tier 1 or non-social source (unless all sources are corroborated Grok X sources)
  const hasTier1OrNonSocial = filteredSources.some((s) => {
    if (isTier1Url(s.url)) return true;
    if (!isTier2Url(s.url) && !isTier3Url(s.url)) return true;
    // Grok X sources are auto-allowed
    if (isXTwitterUrl(s.url) && grokStageUrls.has(s.url)) return true;
    return false;
  });
  if (!hasTier1OrNonSocial) return null;

  // Use filtered sources going forward
  const finalSources = filteredSources;

  // If Claude didn't include an excerpt, backfill it from Perplexity's search snippet (same URL).
  // This is especially important for speculation runs where Claude often omits `$` in excerpts.
  for (const s of finalSources) {
    if (s.excerpt && s.excerpt.trim()) continue;
    const snippet = urlSnippetByUrl.get(s.url) ?? "";
    if (snippet.trim()) s.excerpt = snippet.trim();
  }

  // Money evidence:
  // - Strict/verified: require a verbatim excerpt containing "$"
  // - Speculation mode: allow missing excerpt-$, but still require some money-like token in
  //   title/summary/description OR a $ excerpt, and stronger corroboration when needed.
  const excerptWithDollar = finalSources.find((s) => (s.excerpt ? hasDollarAmount(s.excerpt) : false));
  const excerptDollarToken = excerptWithDollar?.excerpt ? extractFirstDollarToken(excerptWithDollar.excerpt) : "";
  const textMoneyToken = extractFirstShorthandMoneyToken(`${title} ${summary} ${description}`);

  // Exclude common "money-but-not-money-made" contexts (funding/valuation/capex, etc) when the money token
  // is coming from an excerpt.
  if (excerptWithDollar?.excerpt && looksLikeFundingOrValuationContext(excerptWithDollar.excerpt)) return null;

  if (!isSpeculationMode) {
    // strict mode
    if (!excerptWithDollar?.excerpt) return null;
  } else {
    // speculation mode
    const hasAnyMoneySignal = Boolean(excerptDollarToken || textMoneyToken);
    if (!hasAnyMoneySignal) return null;
    // If we don't have a verbatim $ excerpt, require stronger corroboration:
    // either an allowed platform source OR 2+ distinct domains.
    if (!excerptWithDollar?.excerpt) {
      const domains = finalSources
        .map((s) => {
          try {
            return registrableDomain(new URL(s.url).hostname);
          } catch {
            return "";
          }
        })
        .filter(Boolean);
      const uniqueDomains = new Set(domains);
      const hasAllowedPlatform = finalSources.some((s) => isAllowedPlatformUrl(s.url));
      // Also allow Grok X sources as corroboration
      const hasGrokXSource = finalSources.some((s) => isXTwitterUrl(s.url) && grokStageUrls.has(s.url));
      if (!hasAllowedPlatform && !hasGrokXSource && uniqueDomains.size < 2) return null;
    }
  }

  // Auto-inject a $ amount into the title if missing.
  if (!title.includes("$")) {
    const token = excerptDollarToken || textMoneyToken;
    if (token) title = `${title} — ${token}`;
  }
  if (!title.includes("$")) return null;

  // If we DO have strong signals for verified, allow upgrading back to verified.
  // (Keeps the dataset consistent with the original quality bar.)
  if (isSpeculationMode) {
    const canVerify = finalSources.length >= 2 && Boolean(excerptWithDollar?.excerpt);
    if (canVerify) status = "verified";
  }

  // Self-blog policy: allow self blogs only when corroborated by an additional distinct-domain source.
  // (IndieHackers / YouTube / GitHub count; otherwise any other non-social domain counts.)
  const hasSelfBlog = finalSources.some((s) => likelySelfBlogUrl(s.url));
  if (hasSelfBlog) {
    const domains = finalSources
      .map((s) => {
        try {
          return registrableDomain(new URL(s.url).hostname);
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    const uniqueDomains = new Set(domains);
    if (uniqueDomains.size < 2) return null;
    // Additionally require corroboration by either an allowed platform OR another distinct domain (already ensured).
    const corroborated = finalSources.some((s) => isAllowedPlatformUrl(s.url)) || uniqueDomains.size >= 2;
    if (!corroborated) return null;
  }

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
    proofSources: finalSources,
    status,
  };
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
    snippet: string; // verbatim excerpt containing $ amount
  }>;
};

type PerplexityAsyncJob = {
  id: string;
  model: string;
  status: "CREATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  created_at?: number;
  started_at?: number | null;
  completed_at?: number | null;
  failed_at?: number | null;
  error_message?: string | null;
  response?: {
    id?: string;
    model?: string;
    created?: number;
    citations?: string[];
    search_results?: Array<{ title?: string; url?: string; date?: string; snippet?: string; source?: string }>;
    choices?: Array<{ message?: { content?: string; role?: string } }>;
  } | null;
};

async function fetchPerplexityAsyncJob({ apiKey, requestId }: { apiKey: string; requestId: string }): Promise<PerplexityAsyncJob> {
  const res = await fetch(`https://api.perplexity.ai/async/chat/completions/${encodeURIComponent(requestId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Perplexity async failed: ${res.status} ${body.slice(0, 1500)}`);
  }
  return (await res.json()) as PerplexityAsyncJob;
}

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
  const socialDeny = Array.from(TIER3_BLOCKED_HOSTS).map((d) => `-${d}`);
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
    "Avoid social media sources (Facebook/TikTok/Instagram/Discord/Telegram). YouTube and X/Twitter indie maker posts are allowed.",
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
  } else {
    toolFilters.search_recency_filter = recency;
  }

  async function callChatCompletions() {
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
        messages: [
          {
            role: "user",
            content: [
              "Find publicly verifiable examples of AI agents/agentic workflows that made money with explicit $ amounts.",
              "Exclude fundraising/valuations/grants.",
              "Avoid social media sources as proof (Facebook/TikTok/Instagram/Discord/Telegram). YouTube and X/Twitter indie maker posts are allowed.",
              `Return at most ${Math.max(5, Math.min(25, numSearchResults))} sources.`,
              "",
              `Query: ${query}`,
            ].join("\n"),
          },
        ],
        web_search_options: {
          search_context_size: "low",
          ...toolFilters,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Perplexity chat/completions failed: ${res.status} ${body.slice(0, 1500)}`);
    }

    const json = (await res.json()) as any;
    const content =
      typeof json?.choices?.[0]?.message?.content === "string" ? (json.choices[0].message.content as string) : "";
    const citations = Array.isArray(json?.citations) ? (json.citations as any[]).map(String).filter(Boolean) : [];
    const searchResults = Array.isArray(json?.search_results) ? (json.search_results as any[]) : [];
    return { model: String(json?.model ?? model), content, citations, searchResults, raw: json };
  }

  // Optional attempt: Agentic Research deep-research (can be slow). If it fails/timeouts, fall back to chat/completions.
  const preset = (process.env.PERPLEXITY_PRESET ?? "").trim();
  if (preset) {
    const timeoutMs = Math.max(
      10_000,
      Math.min(120_000, Number(process.env.PERPLEXITY_TIMEOUT_MS ?? "35000") || 35_000),
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.perplexity.ai/v1/responses", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          preset,
          input: query,
          instructions,
          max_steps: 4,
          max_output_tokens: 1500,
          tools: [
            {
              type: "web_search",
              filters: toolFilters,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "agentprofit_deep_research", schema, strict: true },
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Perplexity responses failed: ${res.status} ${body.slice(0, 1500)}`);
      }

      const json = (await res.json()) as any;
      const text = extractPerplexityResponseText(json);
      const parsed = JSON.parse(text) as PerplexityDeepResearchJson;
      const citations = Array.isArray(parsed?.sources) ? parsed.sources.map((s) => s.url).filter(Boolean) : [];
      const searchResults = Array.isArray(parsed?.sources) ? parsed.sources : [];
      return { model: String(json?.model ?? preset), content: parsed?.report ?? "", citations, searchResults, raw: json };
    } catch {
      // Fall back below.
    } finally {
      clearTimeout(timeout);
    }
  }

  return callChatCompletions();
}

async function callClaudeHaiku({
  apiKey,
  sources,
  perplexitySummary,
  maxItems,
  mode,
}: {
  apiKey: string;
  sources: Array<{ title: string; url: string; date?: string; snippet?: string; stageId?: string }>;
  perplexitySummary: string;
  maxItems: number;
  mode: "strict" | "speculation";
}): Promise<unknown[]> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

  const system = buildClaudeSystemPrompt({ mode });
  const user = buildClaudeUserPrompt({ sources, perplexitySummary, maxItems, mode });

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
  /** Pre-aggregated sources from multi-stage pipeline (skips Perplexity call). */
  preAggregatedSources?: StageSource[];
  /** Pre-aggregated summary from multi-stage pipeline. */
  preAggregatedSummary?: string;
};

export async function runStoryParser(req: Request, opts: WeeklyUpdateOptions = {}) {
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
  // Only require Perplexity key if we don't have pre-aggregated sources
  if (!perplexityKey && !opts.preAggregatedSources) {
    return NextResponse.json({ error: "PERPLEXITY_API_KEY is missing." }, { status: 500 });
  }
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
  const modeParam = (url.searchParams.get("mode") ?? "").trim().toLowerCase();
  const mode: "strict" | "speculation" = modeParam === "strict" ? "strict" : "speculation";
  const withinDaysParam = url.searchParams.get("withinDays") ?? url.searchParams.get("days") ?? "";
  const withinDays =
    withinDaysParam.trim() !== ""
      ? Math.max(0, Math.min(60, Number(withinDaysParam) || 0))
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
      buildDefaultScoutQuery({ windowDays: withinDays || (isCron ? 7 : 7) });

    let sources: Array<{ title: string; url: string; date?: string; snippet?: string; stageId?: string }>;
    let pContent: string;
    let pModel: string;
    let pCitations: string[];
    let pRaw: unknown;

    // Use pre-aggregated sources if provided (from multi-stage pipeline)
    if (opts.preAggregatedSources && opts.preAggregatedSources.length > 0) {
      sources = opts.preAggregatedSources
        .filter((r) => r.title && r.url && isHttpUrl(r.url))
        .filter((r) => {
          if (!withinDays) return true;
          if (!r.date) return true;
          const t = new Date(`${r.date}T00:00:00Z`).getTime();
          return Number.isFinite(t) ? t >= cutoffMs : true;
        })
        .slice(0, limit);
      pContent = opts.preAggregatedSummary ?? "";
      pModel = "multi-stage";
      pCitations = sources.map((s) => s.url);
      pRaw = { preAggregated: true, sourceCount: opts.preAggregatedSources.length };
    } else {
      // Legacy: use Perplexity async or direct call
      const pplxAsyncRequestId = (url.searchParams.get("pplxAsyncRequestId") ?? "").trim();
      let p: Awaited<ReturnType<typeof callPerplexity>>;
      if (pplxAsyncRequestId) {
        const job = await fetchPerplexityAsyncJob({ apiKey: perplexityKey, requestId: pplxAsyncRequestId });
        if (job.status !== "COMPLETED") {
          if (job.status === "FAILED") {
            return NextResponse.json(
              {
                error: "Perplexity async job failed.",
                requestId: pplxAsyncRequestId,
                status: job.status,
                details: (job.error_message ?? "").trim() || "unknown error",
              },
              { status: 502 },
            );
          }
          return NextResponse.json(
            { ok: true, pending: true, requestId: pplxAsyncRequestId, status: job.status, runId },
            { status: 202 },
          );
        }

        const resp = job.response ?? {};
        const content = String(resp?.choices?.[0]?.message?.content ?? "");
        let searchResults = Array.isArray(resp?.search_results) ? (resp.search_results as any[]) : [];
        const citations = Array.isArray(resp?.citations)
          ? (resp.citations as any[]).map(String).filter(Boolean)
          : searchResults.map((s) => String((s as any)?.url ?? "")).filter(Boolean);
        // Deep-research returns citations but not search_results — build sources from citations.
        if (searchResults.length === 0 && citations.length > 0) {
          searchResults = citations.filter((u) => isHttpUrl(u)).map((u) => ({ title: u, url: u }));
        }
        p = {
          model: String(resp?.model ?? job.model ?? "sonar-deep-research"),
          content,
          citations,
          searchResults,
          raw: job,
        };
      } else {
        p = await callPerplexity({
          apiKey: perplexityKey,
          query,
          recency,
          numSearchResults: Math.max(10, limit),
          withinDays,
          todayUtc,
        });
      }

      sources = (Array.isArray(p.searchResults) ? p.searchResults : [])
        .map((r) => ({
          title: String(r?.title ?? "").trim(),
          url: String(r?.url ?? "").trim(),
          date: typeof r?.date === "string" ? r.date : undefined,
          snippet: typeof r?.snippet === "string" ? r.snippet : undefined,
          stageId: undefined,
        }))
        .filter((r) => r.title && r.url && isHttpUrl(r.url))
        .filter((r) => {
          if (!withinDays) return true;
          if (!r.date) return true;
          const t = new Date(`${r.date}T00:00:00Z`).getTime();
          return Number.isFinite(t) ? t >= cutoffMs : true;
        })
        .slice(0, limit);
      pContent = p.content;
      pModel = p.model ?? "";
      pCitations = p.citations;
      pRaw = p.raw;
    }

    const allowedUrls = new Set(sources.map((s) => s.url));
    const urlSnippetByUrl = new Map(
      sources
        .map((s) => [s.url, (s.snippet ?? "").trim()] as const)
        .filter(([, snippet]) => Boolean(snippet)),
    );

    // Track which URLs came from Grok X Search stage (auto-allowed X/Twitter)
    const grokStageUrls = new Set(
      sources.filter((s) => s.stageId === "grok-x-search").map((s) => s.url)
    );

    const claudeCandidates = await callClaudeHaiku({
      apiKey: anthropicKey,
      sources,
      perplexitySummary: pContent,
      maxItems: find,
      mode,
    });

    const fromBlob = await readLiveCaseStudiesFromBlob();
    const seed = rawCaseStudies as unknown as CaseStudy[];
    const existing = (fromBlob ?? seed).slice().sort((a, b) => b.date.localeCompare(a.date));
    const existingIds = new Set(existing.map((x) => x.id));
    const existingUrls = new Set(existing.flatMap((x) => (x.proofSources ?? []).map((s) => s.url)));

    // Extract product names from titles for deduplication
    // Handles formats like "ProductName: $X..." or "ProductName Reaches $X..." or "ProductName Hits $X..."
    const extractProductName = (title: string): string => {
      // First try: extract text before colon
      const colonMatch = title.match(/^([^:]+):/);
      if (colonMatch) return colonMatch[1].trim().toLowerCase();
      // Second try: extract text before common verbs + $
      const verbMatch = title.match(/^(.+?)\s+(?:Reaches|Hits|Makes|Earns|Generates|Gets)\s+\$/i);
      if (verbMatch) return verbMatch[1].trim().toLowerCase();
      // Fallback: first 2-3 words before $
      const wordsMatch = title.match(/^((?:\w+\s+){1,3})/);
      if (wordsMatch) return wordsMatch[1].trim().toLowerCase();
      return title.toLowerCase().slice(0, 30);
    };
    const existingProductNames = new Set(existing.map((x) => extractProductName(x.title)));

    // Rank candidates: prioritize verified, then by stage priority
    const candidateRank = (x: unknown) => {
      const s = (x as any)?.status;
      const verified = s === "verified" ? 0 : 1;
      // Could add stage weight here if needed
      return verified;
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
        mode,
        urlSnippetByUrl,
        grokStageUrls,
      });
      if (!cs) continue;
      if (withinDays) {
        const t = new Date(`${cs.date}T00:00:00Z`).getTime();
        if (!Number.isFinite(t) || t < cutoffMs) continue;
      }
      // Deduplicate by any existing proof URL.
      if (cs.proofSources.some((s) => existingUrls.has(s.url))) continue;
      // Deduplicate by product name (avoid same product appearing twice)
      const productName = extractProductName(cs.title);
      if (existingProductNames.has(productName)) continue;
      added.push(cs);
      cs.proofSources.forEach((s) => existingUrls.add(s.url));
      existingProductNames.add(productName);
    }

    const merged = [...existing, ...added].sort((a, b) => b.date.localeCompare(a.date));

    const runLog = {
      runDate,
      runId,
      forced: force,
      scout: {
        configVersion: SCOUT_CONFIG_VERSION,
        mode,
        withinDays,
        searchLimit: limit,
        find,
        recency,
        multiStage: Boolean(opts.preAggregatedSources),
      },
      perplexity: {
        model: pModel,
        citations: pCitations,
        searchResults: sources,
        content: pContent,
      },
      generated: {
        candidateCount: claudeCandidates.length,
        addedCount: added.length,
        added: added.map((x) => ({ id: x.id, date: x.date, title: x.title, proofSources: x.proofSources })),
      },
    };

    // Persist "live" dataset to Blob (snapshot + stable manifest).
    const blobWrite = await writeLiveCaseStudiesToBlob({
      runId,
      all: merged,
      added,
      perplexityRaw: pRaw,
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
        name: `story-parser-${runDate}-${name}`,
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
  return runStoryParser(req);
}

export async function POST(req: Request) {
  return runStoryParser(req);
}
