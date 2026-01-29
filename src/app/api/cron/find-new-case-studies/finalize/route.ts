import { NextResponse } from "next/server";
import {
  readLatestScoutJob,
  updateLatestScoutJob,
  isV1Job,
  isV2Job,
  convertV1ToV2,
  aggregateStageSources,
  aggregateStageSummaries,
  type PendingScoutJobV2,
  type PendingStage,
  type StageSource,
} from "@/lib/blobScoutAsync";
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

type PerplexityAsyncJob = {
  id: string;
  model: string;
  status: "CREATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  error_message?: string | null;
  response?: {
    id?: string;
    model?: string;
    citations?: string[];
    search_results?: Array<{ title?: string; url?: string; date?: string; snippet?: string }>;
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

/**
 * Poll a Perplexity stage and update its status/sources.
 */
async function pollPerplexityStage(
  stage: PendingStage,
  perplexityKey: string
): Promise<PendingStage> {
  if (stage.provider !== "perplexity" || !stage.requestId) {
    return stage;
  }

  if (stage.status === "completed" || stage.status === "failed") {
    return stage;
  }

  try {
    const job = await fetchPerplexityAsyncJob({ apiKey: perplexityKey, requestId: stage.requestId });

    if (job.status === "FAILED") {
      return {
        ...stage,
        status: "failed",
        error: job.error_message ?? "Unknown error",
        completedAt: new Date().toISOString(),
      };
    }

    if (job.status !== "COMPLETED") {
      return {
        ...stage,
        status: "in_progress",
      };
    }

    // Extract sources from completed job
    const resp = job.response ?? {};
    const content = String(resp?.choices?.[0]?.message?.content ?? "");
    const searchResults = Array.isArray(resp?.search_results) ? resp.search_results : [];

    const sources: StageSource[] = searchResults
      .filter((r: any) => r?.url)
      .map((r: any) => ({
        title: String(r?.title ?? "").trim(),
        url: String(r?.url ?? "").trim(),
        date: r?.date ? String(r.date).trim() : undefined,
        snippet: r?.snippet ? String(r.snippet).trim() : undefined,
        stageId: stage.stageId,
      }));

    return {
      ...stage,
      status: "completed",
      sources,
      summary: content,
      completedAt: new Date().toISOString(),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return {
      ...stage,
      status: "failed",
      error: msg,
      completedAt: new Date().toISOString(),
    };
  }
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perplexityKey = process.env.PERPLEXITY_API_KEY ?? "";

  // Read the latest job (could be V1 or V2)
  const rawJob = await readLatestScoutJob();
  if (!rawJob) return NextResponse.json({ error: "No pending scout job found." }, { status: 404 });

  // Convert V1 to V2 for unified handling
  let job: PendingScoutJobV2;
  if (isV1Job(rawJob)) {
    job = convertV1ToV2(rawJob);
  } else if (isV2Job(rawJob)) {
    job = rawJob;
  } else {
    return NextResponse.json({ error: "Unknown job version" }, { status: 500 });
  }

  const attempts = Math.max(0, Number(job.finalizeAttempts ?? 0) || 0);
  if (attempts >= 2) {
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        reason: "Max finalize attempts reached. Start a new research job.",
        runId: job.runId,
        finalizeAttempts: attempts,
      },
      { status: 409 },
    );
  }

  // Record the attempt before doing any work
  job.finalizeAttempts = attempts + 1;
  job.lastFinalizeAt = new Date().toISOString();

  // Poll all pending Perplexity stages
  const updatedStages: PendingStage[] = [];
  for (const stage of job.stages) {
    if (stage.provider === "perplexity" && stage.status === "pending") {
      const updated = await pollPerplexityStage(stage, perplexityKey);
      updatedStages.push(updated);
    } else {
      updatedStages.push(stage);
    }
  }
  job.stages = updatedStages;

  // Save updated job state
  await updateLatestScoutJob(job);

  // Check if all stages are done (completed or failed)
  const pendingStages = job.stages.filter((s) => s.status === "pending" || s.status === "in_progress");

  if (pendingStages.length > 0) {
    // Not all done yet - retry once after delay
    await sleep(12_000);

    // Poll again
    const retriedStages: PendingStage[] = [];
    for (const stage of job.stages) {
      if (stage.provider === "perplexity" && (stage.status === "pending" || stage.status === "in_progress")) {
        const updated = await pollPerplexityStage(stage, perplexityKey);
        retriedStages.push(updated);
      } else {
        retriedStages.push(stage);
      }
    }
    job.stages = retriedStages;
    await updateLatestScoutJob(job);

    // Check again
    const stillPending = job.stages.filter((s) => s.status === "pending" || s.status === "in_progress");
    if (stillPending.length > 0) {
      return NextResponse.json(
        {
          ok: true,
          pending: true,
          runId: job.runId,
          stages: job.stages.map((s) => ({
            stageId: s.stageId,
            provider: s.provider,
            status: s.status,
            sourceCount: s.sources?.length ?? 0,
          })),
          note: "Some stages still in progress. Try finalize again in a few minutes.",
        },
        { status: 202 },
      );
    }
  }

  // All stages are done - aggregate sources
  const allSources = aggregateStageSources(job.stages);
  const combinedSummary = aggregateStageSummaries(job.stages);

  // Build URL for weekly-update with aggregated sources
  const url = new URL(req.url);
  url.pathname = "/api/cron/weekly-update";

  // Pass source data via query params (for small datasets) or let weekly-update read from blob
  url.searchParams.set("scoutJobId", job.runId);
  if (!url.searchParams.get("withinDays") && job.withinDays) {
    url.searchParams.set("withinDays", String(job.withinDays));
  }
  if (!url.searchParams.get("find") && job.find) {
    url.searchParams.set("find", String(job.find));
  }
  if (!url.searchParams.get("searchLimit") && job.searchLimit) {
    url.searchParams.set("searchLimit", String(job.searchLimit));
  }
  if (job.mode) {
    url.searchParams.set("mode", job.mode);
  }

  // Run weekly-update with aggregated sources
  const forwarded = new Request(url.toString(), req);
  const out = await runWeeklyUpdate(forwarded, {
    disableSend: true,
    defaultWithinDays: job.withinDays || 7,
    preAggregatedSources: allSources,
    preAggregatedSummary: combinedSummary,
  });

  return out;
}

export async function POST(req: Request) {
  return GET(req);
}
