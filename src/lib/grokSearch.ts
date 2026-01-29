/**
 * Grok X Search client for native Twitter/X indie maker discovery.
 *
 * Uses Grok's Live Search API (currently free in beta) to search X/Twitter
 * posts directly, which is ideal for finding indie maker announcements.
 */

export type GrokSearchOptions = {
  query: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  maxResults?: number;
  excludedHandles?: string[];
};

export type GrokSearchSource = {
  title: string;
  url: string;
  date?: string;
  snippet?: string;
  /** X/Twitter handle if available */
  handle?: string;
};

export type GrokSearchResult = {
  sources: GrokSearchSource[];
  summary: string;
  model: string;
  raw: unknown;
};

type GrokUrlAnnotation = {
  type: "url_citation";
  url: string;
  start_index: number;
  end_index: number;
  title?: string;
};

type GrokOutputContent = {
  type: string;
  text?: string;
  annotations?: GrokUrlAnnotation[];
};

type GrokOutputItem = {
  type: string;
  content?: GrokOutputContent[];
  role?: string;
};

type GrokApiResponse = {
  id?: string;
  model?: string;
  output?: GrokOutputItem[];
};

function extractGrokResponseText(json: GrokApiResponse): string {
  const output = Array.isArray(json?.output) ? json.output : [];
  const texts: string[] = [];
  for (const item of output) {
    if (item?.type !== "message") continue;
    const parts = Array.isArray(item?.content) ? item.content : [];
    for (const part of parts) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        texts.push(part.text);
      }
    }
  }
  return texts.join("");
}

/**
 * Extract URL citations from Grok response annotations.
 * Grok returns citations as annotations embedded in the message content.
 */
function extractGrokCitations(json: GrokApiResponse): GrokSearchSource[] {
  const output = Array.isArray(json?.output) ? json.output : [];
  const sources: GrokSearchSource[] = [];
  const seenUrls = new Set<string>();

  for (const item of output) {
    if (item?.type !== "message") continue;
    const parts = Array.isArray(item?.content) ? item.content : [];

    for (const part of parts) {
      if (part?.type !== "output_text") continue;
      const text = part.text ?? "";
      const annotations = Array.isArray(part.annotations) ? part.annotations : [];

      for (const ann of annotations) {
        if (ann.type !== "url_citation" || !ann.url) continue;
        if (seenUrls.has(ann.url)) continue;
        seenUrls.add(ann.url);

        // Extract context around the citation from the text
        // Find the sentence or phrase containing the citation
        let snippet = "";
        const citationMarker = `[[${ann.title ?? ""}]]`;
        const markerIndex = text.indexOf(citationMarker);
        if (markerIndex !== -1) {
          // Find surrounding context (look for sentence boundaries or bullets)
          let start = markerIndex;
          let end = markerIndex + citationMarker.length;

          // Look backward for sentence/bullet start
          for (let i = markerIndex - 1; i >= 0 && i > markerIndex - 300; i--) {
            const ch = text[i];
            if (ch === "\n" || ch === "." || ch === "-" || ch === "•") {
              start = i + 1;
              break;
            }
            if (i === 0) start = 0;
          }

          // Look forward for sentence end
          for (let i = markerIndex + citationMarker.length; i < text.length && i < markerIndex + 300; i++) {
            const ch = text[i];
            if (ch === "\n" || (ch === "." && text[i + 1] !== "." && (text[i + 1] === " " || text[i + 1] === "\n" || i === text.length - 1))) {
              end = i + 1;
              break;
            }
            if (i === text.length - 1) end = text.length;
          }

          snippet = text.slice(start, end).trim();
          // Remove citation markers from snippet
          snippet = snippet.replace(/\[\[\d+\]\]\([^)]+\)/g, "").replace(/\[\[\d+\]\]/g, "").trim();
        }

        // Try to extract handle from URL
        const handle = extractHandleFromXUrl(ann.url);

        sources.push({
          title: handle ? `X Post by ${handle}` : "X Post",
          url: ann.url,
          date: todayIso(), // Grok doesn't provide post dates in annotations
          snippet: snippet || undefined,
          handle,
        });
      }
    }
  }

  return sources;
}

function extractHandleFromXUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) {
      // URLs like https://x.com/username/status/123 or https://x.com/i/status/123
      const parts = u.pathname.split("/").filter(Boolean);
      // Skip /i/ in URLs like /i/status/123
      if (parts[0] === "i" && parts.length > 2) {
        return undefined; // Can't extract handle from /i/status URLs
      }
      if (parts.length > 0 && parts[0] !== "i") {
        return `@${parts[0]}`;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function callGrokXSearch({
  query,
  fromDate,
  toDate,
  maxResults = 20,
  excludedHandles = [],
}: GrokSearchOptions): Promise<GrokSearchResult> {
  const apiKey = process.env.GROK_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("GROK_API_KEY is not set");
  }

  const xSearchConfig: Record<string, unknown> = {
    from_date: fromDate,
    to_date: toDate,
  };

  if (excludedHandles.length > 0) {
    xSearchConfig.excluded_x_handles = excludedHandles;
  }

  const systemPrompt = [
    "You are a research assistant finding AI agent success stories on X/Twitter.",
    "Focus on indie makers, solo founders, and small teams sharing revenue milestones.",
    "Look for posts mentioning specific dollar amounts: MRR, revenue, prizes, bounties.",
    "Prioritize posts from individual creators, not large companies or news outlets.",
    "Return the most relevant posts with their URLs and key excerpts.",
    "IMPORTANT: Include specific dollar amounts in your summary when mentioned in posts.",
  ].join("\n");

  const userPrompt = [
    query,
    "",
    `Find up to ${maxResults} relevant X/Twitter posts from ${fromDate} to ${toDate}.`,
    "For each relevant post, include the URL and any dollar amounts mentioned.",
    "Focus on indie makers/solo founders sharing revenue milestones for AI agents or AI-powered products.",
  ].join("\n");

  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-4-1-fast-reasoning",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "x_search",
          x_search: xSearchConfig,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Grok X Search failed: ${res.status} ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as GrokApiResponse;
  const summary = extractGrokResponseText(json);
  const sources = extractGrokCitations(json).slice(0, maxResults);

  return {
    sources,
    summary,
    model: String(json?.model ?? "grok-4-1-fast-reasoning"),
    raw: json,
  };
}

/**
 * Build the default Grok X Search query for finding indie AI agent success stories.
 */
export function buildGrokXSearchQuery(): string {
  return [
    "AI agent made money MRR revenue profit indie maker solopreneur",
    '"hit $" OR "reached $" OR "made $" OR "earning $" OR "generated $"',
    '"my AI" OR "I built" OR "solo founder" OR "side project"',
  ].join(" ");
}
