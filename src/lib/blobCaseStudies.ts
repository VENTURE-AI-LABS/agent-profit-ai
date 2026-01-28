import type { CaseStudy } from "@/lib/types";
import { list, put } from "@vercel/blob";

type LiveManifestV1 = {
  version: 1;
  updatedAt: string; // ISO timestamp
  runId: string; // e.g. 2026-01-28T14-00-00Z
  count: number;
  snapshotUrl: string; // public blob url for the full dataset
  addedIds?: string[];
};

const LIVE_MANIFEST_PREFIX = "case-studies/live-manifest/";

async function getLatestManifestUrl(): Promise<string> {
  const res = await list({ prefix: LIVE_MANIFEST_PREFIX, limit: 1000 });
  const blobs = Array.isArray(res.blobs) ? res.blobs : [];
  const latest = blobs.reduce<{ pathname: string; url: string } | null>((acc, b) => {
    const pathname = String((b as any)?.pathname ?? "");
    const url = String((b as any)?.url ?? "");
    if (!pathname || !url) return acc;
    // Our runId is sortable lexicographically. Pick max pathname.
    if (!acc) return { pathname, url };
    return pathname > acc.pathname ? { pathname, url } : acc;
  }, null);
  return latest?.url ?? "";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function readLiveManifestFromBlob(): Promise<LiveManifestV1 | null> {
  const url = await getLatestManifestUrl();
  if (!url) return null;
  try {
    // Versioned manifest is immutable; safe to cache.
    return await fetchJson<LiveManifestV1>(url, { cache: "force-cache" });
  } catch {
    return null;
  }
}

export async function readLiveCaseStudiesFromBlob(): Promise<CaseStudy[] | null> {
  const manifest = await readLiveManifestFromBlob();
  if (!manifest?.snapshotUrl) return null;
  try {
    // Snapshot can be cached briefly by CDN; manifest changes will point to a new snapshot URL.
    const items = await fetchJson<CaseStudy[]>(manifest.snapshotUrl, { cache: "force-cache" });
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
}

export type WriteRunArtifacts = {
  runId: string;
  all: CaseStudy[];
  added: CaseStudy[];
  perplexityRaw?: unknown;
  claudeRaw?: unknown;
  runLog?: unknown;
};

export async function writeLiveCaseStudiesToBlob({
  runId,
  all,
  added,
  perplexityRaw,
  claudeRaw,
  runLog,
}: WriteRunArtifacts) {
  const now = new Date().toISOString();

  // Versioned snapshot (never overwritten).
  const snapshotPath = `case-studies/snapshots/${encodeURIComponent(runId)}.json`;
  const snapshot = await put(snapshotPath, JSON.stringify(all), {
    access: "public",
    contentType: "application/json",
    // Versioned snapshots are immutable by design.
    addRandomSuffix: false,
    allowOverwrite: false,
  });

  // Per-run audit trail (best-effort).
  const auditPrefix = `weekly-scout/${encodeURIComponent(runId)}`;
  const auditWrites: Array<Promise<unknown>> = [];
  if (perplexityRaw !== undefined) {
    auditWrites.push(
      put(`${auditPrefix}/perplexity.json`, JSON.stringify(perplexityRaw), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      }),
    );
  }
  if (claudeRaw !== undefined) {
    auditWrites.push(
      put(`${auditPrefix}/claude.json`, JSON.stringify(claudeRaw), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      }),
    );
  }
  if (runLog !== undefined) {
    auditWrites.push(
      put(`${auditPrefix}/run.json`, JSON.stringify(runLog), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      }),
    );
  }
  if (added.length) {
    auditWrites.push(
      put(`${auditPrefix}/added.json`, JSON.stringify(added), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      }),
    );
  }
  await Promise.allSettled(auditWrites);

  const manifest: LiveManifestV1 = {
    version: 1,
    updatedAt: now,
    runId,
    count: all.length,
    snapshotUrl: snapshot.url,
    addedIds: added.map((x) => x.id),
  };

  // Versioned manifest (avoid CDN cache invalidation problems on overwrite).
  const manifestPath = `${LIVE_MANIFEST_PREFIX}${encodeURIComponent(runId)}.json`;
  const manifestBlob = await put(manifestPath, JSON.stringify(manifest), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: false,
  });

  return { snapshotUrl: snapshot.url, manifestUrl: manifestBlob.url, manifest };
}

