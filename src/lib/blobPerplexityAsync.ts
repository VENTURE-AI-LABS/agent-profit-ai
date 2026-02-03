import { list, put } from "@vercel/blob";

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

export async function updateLatestPerplexityAsyncJob(job: PendingPerplexityAsyncJobV1) {
  const latestBlob = await put(LATEST_PATH, JSON.stringify(job), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { latestUrl: latestBlob.url };
}

export async function readLatestPerplexityAsyncJob(): Promise<PendingPerplexityAsyncJobV1 | null> {
  const base = (process.env.VERCEL_BLOB_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (base) {
    try {
      return await fetchJson<PendingPerplexityAsyncJobV1>(`${base}/${LATEST_PATH}`, { cache: "no-store" });
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
    return await fetchJson<PendingPerplexityAsyncJobV1>(url, { cache: "no-store" });
  } catch {
    return null;
  }
}

export type { PendingPerplexityAsyncJobV1 };

