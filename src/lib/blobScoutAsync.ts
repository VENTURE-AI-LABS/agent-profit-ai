import { list, put } from "@vercel/blob";
import type { ResearchProvider } from "./scoutConfig";

/**
 * V1 schema (legacy): Single Perplexity async job.
 */
type PendingPerplexityAsyncJobV1 = {
  version: 1;
  createdAt: string; // ISO
  lastFinalizeAt?: string; // ISO
  finalizeAttempts?: number; // number of finalize calls (max 2)
  runId: string;
  requestId: string;
  query: string;
  withinDays: number;
  find: number;
  searchLimit: number;
  // Optional metadata for debugging / versioning.
  scoutConfigVersion?: number;
  mode?: "strict" | "speculation";
};

/**
 * Source from a research stage.
 */
export type StageSource = {
  title: string;
  url: string;
  date?: string;
  snippet?: string;
  /** Which stage this source came from */
  stageId: string;
};

/**
 * Status of a single research stage.
 */
export type StageStatus = "pending" | "in_progress" | "completed" | "failed";

/**
 * A single research stage in the multi-stage job.
 */
export type PendingStage = {
  stageId: string;
  provider: ResearchProvider;
  /** Perplexity async request ID (only for perplexity provider) */
  requestId?: string;
  status: StageStatus;
  query: string;
  /** Sources returned by this stage (populated when completed) */
  sources?: StageSource[];
  /** Summary/content from this stage */
  summary?: string;
  /** Error message if failed */
  error?: string;
  /** When this stage completed */
  completedAt?: string;
};

/**
 * V2 schema: Multi-stage research job with support for multiple providers.
 */
export type PendingScoutJobV2 = {
  version: 2;
  createdAt: string; // ISO
  lastFinalizeAt?: string; // ISO
  finalizeAttempts?: number;
  runId: string;
  withinDays: number;
  find: number;
  searchLimit: number;
  scoutConfigVersion?: number;
  mode?: "strict" | "speculation";
  /** All research stages in this job */
  stages: PendingStage[];
};

/**
 * Union type for reading either V1 or V2 jobs.
 */
export type PendingScoutJob = PendingPerplexityAsyncJobV1 | PendingScoutJobV2;

const PREFIX = "weekly-scout/perplexity-async/";
const LATEST_PATH = `${PREFIX}latest.json`;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/**
 * Check if a job is V2 format.
 */
export function isV2Job(job: PendingScoutJob): job is PendingScoutJobV2 {
  return job.version === 2;
}

/**
 * Check if a job is V1 format.
 */
export function isV1Job(job: PendingScoutJob): job is PendingPerplexityAsyncJobV1 {
  return job.version === 1;
}

/**
 * Write a new V2 scout job (creates both run-specific and latest files).
 */
export async function writeLatestScoutJob(job: PendingScoutJobV2) {
  const runPath = `${PREFIX}${encodeURIComponent(job.runId)}.json`;
  const runBlob = await put(runPath, JSON.stringify(job), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: false,
  });

  const latestBlob = await put(LATEST_PATH, JSON.stringify(job), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return { runUrl: runBlob.url, latestUrl: latestBlob.url };
}

/**
 * Update the latest scout job (V2).
 */
export async function updateLatestScoutJob(job: PendingScoutJobV2) {
  const latestBlob = await put(LATEST_PATH, JSON.stringify(job), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { latestUrl: latestBlob.url };
}

/**
 * Read the latest scout job (supports both V1 and V2).
 */
export async function readLatestScoutJob(): Promise<PendingScoutJob | null> {
  const base = (process.env.VERCEL_BLOB_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (base) {
    try {
      return await fetchJson<PendingScoutJob>(`${base}/${LATEST_PATH}`, { cache: "no-store" });
    } catch {
      // fall through
    }
  }

  try {
    const res = await list({ prefix: PREFIX, limit: 1000 });
    const blobs = Array.isArray(res.blobs) ? res.blobs : [];
    const latest = blobs.find((b) => String((b as any)?.pathname ?? "") === LATEST_PATH);
    const url = String((latest as any)?.url ?? "");
    if (!url) return null;
    return await fetchJson<PendingScoutJob>(url, { cache: "no-store" });
  } catch {
    return null;
  }
}

// ============================================================================
// Legacy V1 compatibility functions (for existing jobs during migration)
// ============================================================================

/**
 * @deprecated Use writeLatestScoutJob for new jobs
 */
export async function writeLatestPerplexityAsyncJob(job: PendingPerplexityAsyncJobV1) {
  const runPath = `${PREFIX}${encodeURIComponent(job.runId)}.json`;
  const runBlob = await put(runPath, JSON.stringify(job), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: false,
  });

  const latestBlob = await put(LATEST_PATH, JSON.stringify(job), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return { runUrl: runBlob.url, latestUrl: latestBlob.url };
}

/**
 * @deprecated Use updateLatestScoutJob for new jobs
 */
export async function updateLatestPerplexityAsyncJob(job: PendingPerplexityAsyncJobV1) {
  const latestBlob = await put(LATEST_PATH, JSON.stringify(job), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { latestUrl: latestBlob.url };
}

/**
 * @deprecated Use readLatestScoutJob
 */
export async function readLatestPerplexityAsyncJob(): Promise<PendingPerplexityAsyncJobV1 | null> {
  const job = await readLatestScoutJob();
  if (!job) return null;
  // Only return if it's actually a V1 job
  if (isV1Job(job)) return job;
  return null;
}

/**
 * Convert a V1 job to V2 format for unified handling.
 */
export function convertV1ToV2(v1: PendingPerplexityAsyncJobV1): PendingScoutJobV2 {
  return {
    version: 2,
    createdAt: v1.createdAt,
    lastFinalizeAt: v1.lastFinalizeAt,
    finalizeAttempts: v1.finalizeAttempts,
    runId: v1.runId,
    withinDays: v1.withinDays,
    find: v1.find,
    searchLimit: v1.searchLimit,
    scoutConfigVersion: v1.scoutConfigVersion,
    mode: v1.mode,
    stages: [
      {
        stageId: "perplexity-legacy",
        provider: "perplexity",
        requestId: v1.requestId,
        status: "pending",
        query: v1.query,
      },
    ],
  };
}

/**
 * Get all sources from all completed stages, deduplicated by URL.
 */
export function aggregateStageSources(stages: PendingStage[]): StageSource[] {
  const seenUrls = new Set<string>();
  const sources: StageSource[] = [];

  // Sort by stage priority (stageId order in DEFAULT_RESEARCH_STAGES)
  const sortedStages = [...stages].sort((a, b) => {
    const order = ["grok-x-search", "youtube-podcasts", "hackathon", "indie-revenue", "youtube-case-study", "news-roundup"];
    const aIdx = order.indexOf(a.stageId);
    const bIdx = order.indexOf(b.stageId);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  for (const stage of sortedStages) {
    if (stage.status !== "completed" || !stage.sources) continue;
    for (const source of stage.sources) {
      if (seenUrls.has(source.url)) continue;
      seenUrls.add(source.url);
      sources.push(source);
    }
  }

  return sources;
}

/**
 * Combine summaries from all completed stages.
 */
export function aggregateStageSummaries(stages: PendingStage[]): string {
  const summaries: string[] = [];
  for (const stage of stages) {
    if (stage.status !== "completed" || !stage.summary) continue;
    summaries.push(`--- ${stage.stageId} ---\n${stage.summary}`);
  }
  return summaries.join("\n\n");
}

export type { PendingPerplexityAsyncJobV1 };
