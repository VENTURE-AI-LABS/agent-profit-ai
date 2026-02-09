import { NextResponse } from "next/server";
import { writeLatestPerplexityAsyncJob } from "@/lib/blobPerplexityAsync";
import { buildDefaultScoutQuery, SCOUT_CONFIG_VERSION } from "@/lib/scoutConfig";

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

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enabled = (process.env.WEEKLY_UPDATE_ENABLED ?? "true").toLowerCase() === "true";
  if (!enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });

  const perplexityKey = process.env.PERPLEXITY_API_KEY ?? "";
  if (!perplexityKey) return NextResponse.json({ error: "PERPLEXITY_API_KEY is missing." }, { status: 500 });

  const url = new URL(req.url);
  const isCron = (req.headers.get("x-vercel-cron") ?? "") === "1";
  const withinDaysParam = url.searchParams.get("withinDays") ?? url.searchParams.get("days") ?? "";
  const withinDays =
    withinDaysParam.trim() !== ""
      ? Math.max(0, Math.min(60, Number(withinDaysParam) || 0))
      : Math.max(0, Math.min(60, isCron ? 7 : 0));
  const searchLimit = Math.max(1, Math.min(25, Number(url.searchParams.get("searchLimit") ?? "20") || 20));
  const find = Math.max(1, Math.min(10, Number(url.searchParams.get("find") ?? "10") || 10));
  const queryParam = url.searchParams.get("query") ?? url.searchParams.get("q") ?? "";
  const modeParam = (url.searchParams.get("mode") ?? "").trim().toLowerCase();
  const mode: "strict" | "speculation" = modeParam === "strict" ? "strict" : "speculation";
  const query =
    (queryParam || "").trim().slice(0, 600) ||
    buildDefaultScoutQuery({ windowDays: withinDays || (isCron ? 7 : 7) });

  const runId = `${todayIsoUtc()}T${new Date().toISOString().slice(11, 19).replaceAll(":", "-")}Z`;

  // Create an async deep-research job (Perplexity will run it in the background).
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
        // Use recency for robustness; we still hard-filter results by withinDays in finalize.
        search_recency_filter: withinDays ? "week" : "week",
        messages: [
          {
            role: "system",
            content:
              "You are a research agent. Prefer primary sources and reputable reporting. Avoid Facebook, TikTok, Instagram, Discord, Telegram. YouTube, X/Twitter indie maker posts, IndieHackers, HackerNews, and ProductHunt are allowed.",
          },
          {
            role: "user",
            content: [
              "Find publicly verifiable examples of AI agents, AI tools, AI SaaS, or AI-powered products that made money with explicit $ amounts.",
              "Exclude fundraising/valuations/grants.",
              "Include: revenue, MRR, ARR, profit, prize payouts, bounties, sale prices, freelance/consulting income using AI.",
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
    return NextResponse.json({ error: "Perplexity async start failed.", details: `${res.status} ${body}` }, { status: 502 });
  }

  const json = (await res.json()) as any;
  const requestId = String(json?.id ?? "").trim();
  const status = String(json?.status ?? "").trim();
  if (!requestId) {
    return NextResponse.json({ error: "Perplexity async start returned no request id.", raw: json }, { status: 502 });
  }

  const blobWrite = await writeLatestPerplexityAsyncJob({
    version: 1,
    createdAt: new Date().toISOString(),
    finalizeAttempts: 0,
    runId,
    requestId,
    query,
    withinDays,
    find,
    searchLimit,
    scoutConfigVersion: SCOUT_CONFIG_VERSION,
    mode,
  });

  const finalizeUrl = new URL(url.toString());
  finalizeUrl.pathname = "/api/cron/find-new-case-studies/finalize";

  return NextResponse.json({
    ok: true,
    pending: true,
    runId,
    requestId,
    status,
    blob: blobWrite,
    finalize: finalizeUrl.toString(),
    note: "Wait ~5 minutes then call finalize (it will return 202 until COMPLETED).",
  });
}

export async function POST(req: Request) {
  return GET(req);
}

