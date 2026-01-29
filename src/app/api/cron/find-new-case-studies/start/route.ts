import { NextResponse } from "next/server";
import {
  writeLatestScoutJob,
  type PendingScoutJobV2,
  type PendingStage,
  type StageSource,
} from "@/lib/blobScoutAsync";
import {
  buildDefaultScoutQuery,
  buildGrokXSearchQuery,
  SCOUT_CONFIG_VERSION,
  DEFAULT_RESEARCH_STAGES,
  type ResearchStage,
} from "@/lib/scoutConfig";
import { callGrokXSearch } from "@/lib/grokSearch";

export const runtime = "nodejs";

function isAuthorized(req: Request) {
  if ((req.headers.get("x-vercel-cron") ?? "") === "1") return true;
  const token = process.env.CRON_TOKEN ?? "";
  if (!token) return false;

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token") ?? "";
  if (queryToken && queryToken === token) return true;

  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7) === token) return true;

  return false;
}

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Start a Perplexity async deep-research job for a stage.
 */
async function startPerplexityStage({
  perplexityKey,
  stage,
  withinDays,
  searchLimit,
}: {
  perplexityKey: string;
  stage: ResearchStage;
  withinDays: number;
  searchLimit: number;
}): Promise<{ requestId: string; status: string; query: string }> {
  const query = buildDefaultScoutQuery({ windowDays: withinDays, stageId: stage.stageId });

  const res = await fetch("https://api.perplexity.ai/async/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${perplexityKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      request: {
        model: "sonar-deep-research",
        search_mode: "web",
        reasoning_effort: "low",
        temperature: 0.2,
        max_tokens: 2400,
        search_recency_filter: "week",
        messages: [
          {
            role: "system",
            content: [
              "You are a research agent. Prefer primary sources and reputable reporting.",
              "Avoid social media sources (Facebook, LinkedIn, TikTok, Instagram, Discord, Telegram).",
              "YouTube and X/Twitter indie maker posts are allowed.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              "Find publicly verifiable examples of AI agents/agentic workflows that made money with explicit $ amounts.",
              "Exclude fundraising/valuations/grants.",
              `Focus: ${stage.queryFocus}`,
              `Return up to ${Math.max(5, Math.min(25, searchLimit))} sources with title, url, date, snippet (include a verbatim quote containing the $ amount when possible).`,
              "",
              `Query: ${query}`,
            ].join("\n"),
          },
        ],
        web_search_options: { search_context_size: "high" },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Perplexity async start failed for ${stage.stageId}: ${res.status} ${body}`);
  }

  const json = (await res.json()) as any;
  const requestId = String(json?.id ?? "").trim();
  const status = String(json?.status ?? "").trim();

  if (!requestId) {
    throw new Error(`Perplexity async start returned no request id for ${stage.stageId}`);
  }

  return { requestId, status, query };
}

/**
 * Run Grok X Search synchronously (fast) and return sources.
 */
async function runGrokStage({
  stage,
  withinDays,
  searchLimit,
}: {
  stage: ResearchStage;
  withinDays: number;
  searchLimit: number;
}): Promise<{ sources: StageSource[]; summary: string; query: string }> {
  const query = buildGrokXSearchQuery({ windowDays: withinDays });
  const fromDate = daysAgoIso(withinDays || 7);
  const toDate = todayIsoUtc();

  const result = await callGrokXSearch({
    query,
    fromDate,
    toDate,
    maxResults: searchLimit,
  });

  const sources: StageSource[] = result.sources.map((s) => ({
    title: s.title,
    url: s.url,
    date: s.date,
    snippet: s.snippet,
    stageId: stage.stageId,
  }));

  return { sources, summary: result.summary, query };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enabled = (process.env.WEEKLY_UPDATE_ENABLED ?? "true").toLowerCase() === "true";
  if (!enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });

  const url = new URL(req.url);
  const isCron = (req.headers.get("x-vercel-cron") ?? "") === "1";

  // Parse parameters
  const withinDaysParam = url.searchParams.get("withinDays") ?? url.searchParams.get("days") ?? "";
  const withinDays =
    withinDaysParam.trim() !== ""
      ? Math.max(0, Math.min(60, Number(withinDaysParam) || 0))
      : Math.max(0, Math.min(60, isCron ? 7 : 7));
  const searchLimit = Math.max(1, Math.min(25, Number(url.searchParams.get("searchLimit") ?? "20") || 20));
  const find = Math.max(1, Math.min(10, Number(url.searchParams.get("find") ?? "10") || 10));
  const modeParam = (url.searchParams.get("mode") ?? "").trim().toLowerCase();
  const mode: "strict" | "speculation" = modeParam === "strict" ? "strict" : "speculation";

  // Stage selection: ?stages=grok-x-search,hackathon or ?provider=grok for single provider test
  const stagesParam = (url.searchParams.get("stages") ?? "").trim();
  const providerParam = (url.searchParams.get("provider") ?? "").trim().toLowerCase();

  let selectedStages: ResearchStage[];
  if (stagesParam) {
    // Specific stages requested
    const stageIds = stagesParam.split(",").map((s) => s.trim()).filter(Boolean);
    selectedStages = DEFAULT_RESEARCH_STAGES.filter((s) => stageIds.includes(s.stageId));
  } else if (providerParam === "grok") {
    // Grok-only mode for testing
    selectedStages = DEFAULT_RESEARCH_STAGES.filter((s) => s.provider === "grok");
  } else if (providerParam === "perplexity") {
    // Perplexity-only mode (legacy behavior)
    selectedStages = DEFAULT_RESEARCH_STAGES.filter((s) => s.provider === "perplexity");
  } else {
    // Default: all enabled stages
    selectedStages = DEFAULT_RESEARCH_STAGES.filter((s) => s.enabled);
  }

  if (selectedStages.length === 0) {
    return NextResponse.json({ error: "No stages selected or enabled" }, { status: 400 });
  }

  // Check required API keys
  const perplexityKey = process.env.PERPLEXITY_API_KEY ?? "";
  const grokKey = process.env.GROK_API_KEY ?? "";
  const hasPerplexityStages = selectedStages.some((s) => s.provider === "perplexity");
  const hasGrokStages = selectedStages.some((s) => s.provider === "grok");

  if (hasPerplexityStages && !perplexityKey) {
    return NextResponse.json({ error: "PERPLEXITY_API_KEY is missing." }, { status: 500 });
  }
  if (hasGrokStages && !grokKey) {
    return NextResponse.json({ error: "GROK_API_KEY is missing." }, { status: 500 });
  }

  const runId = `${todayIsoUtc()}T${new Date().toISOString().slice(11, 19).replaceAll(":", "-")}Z`;
  const pendingStages: PendingStage[] = [];
  const errors: Array<{ stageId: string; error: string }> = [];

  // Process Grok stages first (synchronous)
  for (const stage of selectedStages.filter((s) => s.provider === "grok")) {
    try {
      const result = await runGrokStage({ stage, withinDays, searchLimit });
      pendingStages.push({
        stageId: stage.stageId,
        provider: "grok",
        status: "completed",
        query: result.query,
        sources: result.sources,
        summary: result.summary,
        completedAt: new Date().toISOString(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push({ stageId: stage.stageId, error: msg });
      pendingStages.push({
        stageId: stage.stageId,
        provider: "grok",
        status: "failed",
        query: buildGrokXSearchQuery({ windowDays: withinDays }),
        error: msg,
      });
    }
  }

  // Process Perplexity stages (async)
  for (const stage of selectedStages.filter((s) => s.provider === "perplexity")) {
    try {
      const result = await startPerplexityStage({ perplexityKey, stage, withinDays, searchLimit });
      pendingStages.push({
        stageId: stage.stageId,
        provider: "perplexity",
        requestId: result.requestId,
        status: "pending",
        query: result.query,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      errors.push({ stageId: stage.stageId, error: msg });
      pendingStages.push({
        stageId: stage.stageId,
        provider: "perplexity",
        status: "failed",
        query: buildDefaultScoutQuery({ windowDays: withinDays, stageId: stage.stageId }),
        error: msg,
      });
    }
  }

  // Check if any stages are pending (need finalize)
  const hasPendingStages = pendingStages.some((s) => s.status === "pending");
  const allCompleted = pendingStages.every((s) => s.status === "completed" || s.status === "failed");

  // Handle Grok-only mode (no async stages)
  if (!hasPerplexityStages && allCompleted) {
    // For Grok-only, we can return immediately with the sources
    const grokSources = pendingStages
      .filter((s) => s.status === "completed" && s.sources)
      .flatMap((s) => s.sources ?? []);

    const job: PendingScoutJobV2 = {
      version: 2,
      createdAt: new Date().toISOString(),
      finalizeAttempts: 0,
      runId,
      withinDays,
      find,
      searchLimit,
      scoutConfigVersion: SCOUT_CONFIG_VERSION,
      mode,
      stages: pendingStages,
    };

    const blobWrite = await writeLatestScoutJob(job);

    return NextResponse.json({
      ok: true,
      pending: false,
      runId,
      stages: pendingStages.map((s) => ({
        stageId: s.stageId,
        provider: s.provider,
        status: s.status,
        sourceCount: s.sources?.length ?? 0,
      })),
      grokSources: grokSources.length,
      errors: errors.length ? errors : undefined,
      blob: blobWrite,
      note: "Grok-only run completed. Use finalize to pass sources to weekly-update.",
    });
  }

  // Create V2 job with all stages
  const job: PendingScoutJobV2 = {
    version: 2,
    createdAt: new Date().toISOString(),
    finalizeAttempts: 0,
    runId,
    withinDays,
    find,
    searchLimit,
    scoutConfigVersion: SCOUT_CONFIG_VERSION,
    mode,
    stages: pendingStages,
  };

  const blobWrite = await writeLatestScoutJob(job);

  const finalizeUrl = new URL(url.toString());
  finalizeUrl.pathname = "/api/cron/find-new-case-studies/finalize";

  return NextResponse.json({
    ok: true,
    pending: hasPendingStages,
    runId,
    stages: pendingStages.map((s) => ({
      stageId: s.stageId,
      provider: s.provider,
      status: s.status,
      requestId: s.requestId,
      sourceCount: s.sources?.length ?? 0,
    })),
    errors: errors.length ? errors : undefined,
    blob: blobWrite,
    finalize: finalizeUrl.toString(),
    note: hasPendingStages
      ? "Wait ~5 minutes then call finalize (it will return 202 until all stages are COMPLETED)."
      : "All stages completed. Call finalize to aggregate sources.",
  });
}

export async function POST(req: Request) {
  return GET(req);
}
