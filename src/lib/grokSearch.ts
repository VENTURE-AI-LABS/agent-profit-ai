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

/**
 * Extract product URLs mentioned in the summary text.
 * Looks for URLs that aren't X/Twitter posts.
 */
function extractProductUrlsFromText(text: string): GrokSearchSource[] {
  const urlRegex = /https?:\/\/[^\s<>\[\](),"']+/g;
  const matches = text.match(urlRegex) || [];
  const sources: GrokSearchSource[] = [];
  const seenUrls = new Set<string>();

  for (const rawUrl of matches) {
    // Clean up URL (remove trailing punctuation)
    let url = rawUrl.replace(/[.,;:!?)]+$/, "");

    // Skip X/Twitter URLs (we handle those separately)
    const host = getHostFromUrl(url);
    if (!host) continue;
    if (host === "x.com" || host === "twitter.com" || host.includes(".x.com") || host.includes(".twitter.com")) {
      continue;
    }

    // Skip common non-product URLs
    if (host.includes("github.com") && !url.includes("/releases")) continue;
    if (host.includes("youtube.com") || host.includes("youtu.be")) continue;

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    // Try to extract context around the URL
    const urlIndex = text.indexOf(rawUrl);
    let context = "";
    if (urlIndex !== -1) {
      const start = Math.max(0, urlIndex - 100);
      const end = Math.min(text.length, urlIndex + rawUrl.length + 50);
      context = text.slice(start, end).trim();
    }

    // Extract product name from URL or context
    let productName = extractProductNameFromUrl(url);

    sources.push({
      title: productName ? `${productName} (Product Website)` : "Product Website",
      url,
      date: todayIso(),
      snippet: context || undefined,
    });
  }

  return sources;
}

function getHostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function extractProductNameFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    // Remove common prefixes/suffixes
    let name = host
      .replace(/^www\./, "")
      .replace(/\.(com|ai|io|app|co|net|org|dev)$/, "")
      .replace(/\.(com|ai|io|app|co|net|org|dev)\.[a-z]+$/, "");

    // Capitalize first letter
    if (name.length > 0) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return null;
  } catch {
    return null;
  }
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
    "",
    "CRITICAL: For each relevant post, you MUST find the product website by:",
    "1. Checking if a URL is mentioned in the tweet itself",
    "2. Looking at the user's X/Twitter bio for their product link",
    "3. Checking pinned tweets or recent tweets for product announcements",
    "4. The product URL is essential - include it in your response",
    "",
    "For each find, extract:",
    "- Dollar amount (MRR, revenue, prize, etc.)",
    "- Product/project name",
    "- Product website URL (from tweet, bio, or profile)",
    "- What the AI product/agent actually does",
  ].join("\n");

  const userPrompt = [
    query,
    "",
    `Find up to ${maxResults} relevant X/Twitter posts from ${fromDate} to ${toDate}.`,
    "",
    "For EACH relevant post, you MUST provide:",
    "1. The X/Twitter post URL with the revenue claim",
    "2. The specific dollar amount (e.g., '$16K MRR', '$2.3K/month')",
    "3. The PRODUCT NAME",
    "4. The PRODUCT WEBSITE URL - check the user's bio, pinned tweet, or linked website",
    "5. A 1-sentence description of what the product does",
    "",
    "Example format:",
    "- Post: https://x.com/user/status/123",
    "- Revenue: $10K MRR",
    "- Product: ArcStory",
    "- Website: https://arcstory.ai",
    "- Description: AI-powered mobile app for creating animated stories",
    "",
    "Focus on indie makers/solo founders. The product website is REQUIRED when possible.",
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

  // Extract X post citations
  const xSources = extractGrokCitations(json);

  // Extract product URLs mentioned in the summary
  const productSources = extractProductUrlsFromText(summary);

  // Combine sources: X posts first, then product URLs
  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const allSources: GrokSearchSource[] = [];

  for (const source of xSources) {
    if (!seenUrls.has(source.url)) {
      seenUrls.add(source.url);
      allSources.push(source);
    }
  }

  for (const source of productSources) {
    if (!seenUrls.has(source.url)) {
      seenUrls.add(source.url);
      allSources.push(source);
    }
  }

  return {
    sources: allSources.slice(0, maxResults),
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
