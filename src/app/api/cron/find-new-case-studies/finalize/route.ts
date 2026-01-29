import { NextResponse } from "next/server";
import { readLatestPerplexityAsyncJob, updateLatestPerplexityAsyncJob } from "@/lib/blobPerplexityAsync";
import { runWeeklyUpdate } from "@/app/api/cron/weekly-update/route";

export const runtime = "nodejs";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const latest = await readLatestPerplexityAsyncJob();
  if (!latest) return NextResponse.json({ error: "No pending Perplexity async job found." }, { status: 404 });

  const attempts = Math.max(0, Number(latest.finalizeAttempts ?? 0) || 0);
  // Allow only 1 retry to avoid accidental looping. That means:
  // - First finalize call: attempts becomes 1
  // - Second finalize call: attempts becomes 2
  // - Further calls: blocked unless you start a new job
  if (attempts >= 2) {
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        reason: "Max finalize attempts reached. Start a new deep research job.",
        requestId: latest.requestId,
        runId: latest.runId,
        finalizeAttempts: attempts,
      },
      { status: 409 },
    );
  }

  // Record the attempt before doing any work (so repeated calls don't loop).
  await updateLatestPerplexityAsyncJob({
    ...latest,
    finalizeAttempts: attempts + 1,
    lastFinalizeAt: new Date().toISOString(),
  });

  const url = new URL(req.url);
  url.searchParams.set("pplxAsyncRequestId", latest.requestId);
  // Preserve/override withinDays/find defaults for cron runs; callers can still pass overrides.
  if (!url.searchParams.get("withinDays") && latest.withinDays) url.searchParams.set("withinDays", String(latest.withinDays));
  if (!url.searchParams.get("find") && latest.find) url.searchParams.set("find", String(latest.find));
  if (!url.searchParams.get("searchLimit") && latest.searchLimit) url.searchParams.set("searchLimit", String(latest.searchLimit));

  // Run the normal pipeline, but using the completed async research results instead of starting a new search.
  // If the Perplexity job is still running, weekly-update will return 202.
  const forwarded = new Request(url.toString(), req);
  let out = await runWeeklyUpdate(forwarded, { disableSend: true, defaultWithinDays: 7 });

  // One retry: wait a bit then try once more.
  if (out.status === 202) {
    await sleep(12_000);
    out = await runWeeklyUpdate(new Request(url.toString(), req), { disableSend: true, defaultWithinDays: 7 });
  }

  return out;
}

export async function POST(req: Request) {
  return GET(req);
}

