/**
 * YouTube Podcast Transcript Search for Scout Pipeline.
 *
 * Searches YouTube for podcast interviews about AI/tech revenue,
 * extracts transcripts, and finds mentions of revenue/MRR/profit with dollar amounts.
 *
 * Token optimization: All transcript processing happens locally before reaching Claude.
 */

import { YoutubeTranscript } from "youtube-transcript-plus";
import type { StageSource } from "./blobScoutAsync";

export type YouTubeSearchOptions = {
  queries: string[];
  maxResultsPerQuery?: number;
  withinDays?: number;
};

export type YouTubeVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  url: string;
  description: string;
};

export type YouTubeSearchResult = {
  sources: StageSource[];
  summary: string;
  videosProcessed: number;
  videosWithMatches: number;
};

type YouTubeSearchApiResponse = {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      publishedAt?: string;
      description?: string;
    };
  }>;
};

type TranscriptSegment = {
  text: string;
  offset: number;
  duration: number;
};

/**
 * Revenue patterns for local extraction (no AI needed).
 * These patterns capture dollar amounts in various formats.
 */
const REVENUE_PATTERNS = [
  // $X, $X.XX, $Xk, $XK, $X thousand, $X million, $XM
  /\$[\d,]+(?:\.\d+)?(?:\s*(?:k|K|thousand|million|M|mil))?/gi,
  // Xk MRR, XK ARR, X thousand MRR
  /[\d,]+(?:\.\d+)?(?:\s*(?:k|K|thousand|million|M|mil))?(?:\s*(?:MRR|ARR|\/month|per month|monthly|a month))/gi,
  // "made $X", "earned $X", "hit $X", "reached $X", "generating $X"
  /(?:made|earned|hit|reached|generating|doing|at)\s+\$[\d,]+(?:\.\d+)?(?:\s*(?:k|K|thousand|million|M))?/gi,
];

/**
 * Extract URLs from text (video descriptions, transcripts).
 * Filters out common non-product URLs.
 */
function extractProductUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>\[\](),"']+/gi;
  const matches = text.match(urlRegex) || [];
  const urls: string[] = [];
  const seenHosts = new Set<string>();

  // Domains to skip (social media, common platforms)
  const skipDomains = [
    "youtube.com", "youtu.be", "twitter.com", "x.com",
    "facebook.com", "instagram.com", "tiktok.com", "linkedin.com",
    "discord.gg", "discord.com", "t.me", "telegram.me",
    "bit.ly", "goo.gl", "tinyurl.com", "ow.ly",
    "patreon.com", "ko-fi.com", "buymeacoffee.com",
    "spotify.com", "apple.com/podcast", "podcasts.apple.com",
  ];

  for (const rawUrl of matches) {
    // Clean up URL (remove trailing punctuation)
    const url = rawUrl.replace(/[.,;:!?)]+$/, "");

    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");

      // Skip social media and common platforms
      if (skipDomains.some((d) => host.includes(d))) continue;

      // Skip if we already have a URL from this host
      if (seenHosts.has(host)) continue;
      seenHosts.add(host);

      urls.push(url);
    } catch {
      // Invalid URL, skip
    }
  }

  return urls.slice(0, 5); // Max 5 URLs per video
}

/**
 * Extract product/company names mentioned near revenue amounts.
 * Looks for capitalized words, quoted names, and domain-like patterns.
 */
function extractProductNames(context: string): string[] {
  const names: string[] = [];

  // Look for domain-like mentions (e.g., "example.ai", "myapp.com")
  const domainMatches = context.match(/\b([a-zA-Z][a-zA-Z0-9-]+)\.(ai|io|com|co|app|dev|so|xyz)\b/gi);
  if (domainMatches) {
    for (const match of domainMatches) {
      names.push(match);
    }
  }

  // Look for quoted names
  const quotedMatches = context.match(/["']([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)["']/g);
  if (quotedMatches) {
    for (const match of quotedMatches) {
      const cleaned = match.replace(/["']/g, "");
      if (!names.includes(cleaned)) {
        names.push(cleaned);
      }
    }
  }

  // Look for capitalized product-like names (3+ chars, not common words)
  // Expanded common words list to reduce false positives
  const commonWords = new Set([
    // Articles, pronouns, prepositions
    "The", "And", "For", "With", "This", "That", "From", "They", "Have", "Been",
    "Were", "What", "When", "Where", "Which", "About", "Into", "Through", "During",
    "Before", "After", "Above", "Below", "Between", "Under", "Again", "Further",
    "Then", "Once", "Here", "There", "All", "Each", "Few", "More", "Most", "Other",
    "Some", "Such", "Only", "Own", "Same", "Than", "Too", "Very", "Just", "Over",
    "Also", "Back", "Now", "Well", "Way", "Even", "New", "Want", "Because", "Any",
    "These", "Give", "Day", "Make", "Like", "Know", "Take", "Come", "Could", "Would",
    "Should", "Being", "Their", "Your", "You", "Yes", "Yeah", "Okay", "Really",
    "Think", "Going", "Got", "Get", "See", "Look", "Want", "First", "Last", "Next",
    "Still", "Let", "But", "How", "Why", "Who", "Our", "Out", "Can", "Will",
    // Common podcast words
    "Episode", "Podcast", "Interview", "Talk", "Show", "Channel", "Video", "Watch",
    "Listen", "Subscribe", "Follow", "Share", "Comment", "Check", "Today", "Week",
    "Month", "Year", "Time", "Part", "Full", "Clip", "Fear", "Love", "Hate",
  ]);

  const capitalizedMatches = context.match(/\b[A-Z][a-zA-Z0-9]{2,}(?:\s+[A-Z][a-zA-Z0-9]+)?\b/g);
  if (capitalizedMatches) {
    for (const match of capitalizedMatches) {
      // Skip if it's a common word or already included
      if (commonWords.has(match) || commonWords.has(match.split(" ")[0])) continue;
      if (names.some((n) => n.toLowerCase() === match.toLowerCase())) continue;
      // Skip single short words that are likely not product names
      if (match.length < 4 && !match.includes(".")) continue;
      names.push(match);
    }
  }

  return names.slice(0, 5); // Max 5 names
}

/**
 * Construct likely product URLs from product names.
 * Converts "Product Name" to likely domain patterns.
 */
function constructProductUrls(productNames: string[]): string[] {
  const urls: string[] = [];
  const seenHosts = new Set<string>();

  // Skip generic/big company names and false positives
  const skipNames = new Set([
    "Amazon", "Microsoft", "Google", "Meta", "Apple", "Nvidia", "OpenAI",
    "Facebook", "Twitter", "LinkedIn", "YouTube", "Netflix", "Spotify",
    "Berkshire", "Buffet", "Heatherway", "Anyway", "Totally", "Ralph",
    "Maar", "Peter", "Manis", "Notion", // Notion is real but too generic
  ]);

  for (const name of productNames) {
    if (skipNames.has(name)) continue;
    // Skip names that are too short or look like common words
    if (name.length < 5) continue;

    // If it already looks like a domain, use it directly
    if (name.match(/\.(ai|io|com|co|app|dev)$/i)) {
      const url = `https://${name.toLowerCase()}`;
      if (!seenHosts.has(name.toLowerCase())) {
        seenHosts.add(name.toLowerCase());
        urls.push(url);
      }
      continue;
    }

    // Convert product name to likely domain
    // "Nomad List" → "nomadlist", "Photo AI" → "photoai"
    const normalized = name
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9]/g, "");

    if (normalized.length < 3) continue;

    // Try common TLD patterns
    const commonDomains = [
      `https://${normalized}.com`,
      `https://${normalized}.ai`,
      `https://${normalized}.io`,
    ];

    // Add the first one that hasn't been seen
    for (const url of commonDomains) {
      const host = normalized;
      if (!seenHosts.has(host)) {
        seenHosts.add(host);
        urls.push(url); // Just add .com as most likely
        break;
      }
    }
  }

  return urls.slice(0, 3);
}

/**
 * Context keywords for pre-filtering videos.
 * Videos without these keywords in title/description are skipped.
 */
const CONTEXT_KEYWORDS = [
  "ai agent",
  "autonomous",
  "indie",
  "solo",
  "saas",
  "mrr",
  "revenue",
  "profit",
  "startup",
  "founder",
  "maker",
  "side project",
  "bootstrap",
  "money",
  "income",
  "business",
];

/**
 * Search YouTube Data API for videos matching the query.
 */
async function searchYouTubeVideos({
  apiKey,
  query,
  maxResults = 5,
  publishedAfter,
}: {
  apiKey: string;
  query: string;
  maxResults?: number;
  publishedAfter?: string;
}): Promise<YouTubeVideo[]> {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(maxResults),
    order: "date",
    key: apiKey,
    videoDuration: "long", // Focus on long-form content (podcasts)
  });

  if (publishedAfter) {
    params.set("publishedAfter", publishedAfter);
  }

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube search failed: ${res.status} ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as YouTubeSearchApiResponse;
  const items = json.items ?? [];

  return items
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      videoId: item.id!.videoId!,
      title: item.snippet?.title ?? "Unknown Title",
      channelTitle: item.snippet?.channelTitle ?? "Unknown Channel",
      publishedAt: item.snippet?.publishedAt ?? "",
      url: `https://www.youtube.com/watch?v=${item.id!.videoId}`,
      description: item.snippet?.description ?? "",
    }));
}

/**
 * Check if a video is relevant based on title/channel.
 */
function isRelevantVideo(video: YouTubeVideo): boolean {
  const text = `${video.title} ${video.channelTitle}`.toLowerCase();
  return CONTEXT_KEYWORDS.some((keyword) => text.includes(keyword));
}

/**
 * Get video transcript using youtube-transcript-plus.
 * Returns null if transcript is unavailable.
 */
async function getVideoTranscript(videoId: string): Promise<string | null> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    if (!transcript || transcript.length === 0) return null;

    // Combine all transcript segments into one text
    return (transcript as TranscriptSegment[]).map((seg) => seg.text).join(" ");
  } catch {
    // Transcript unavailable (common for ~15% of videos)
    return null;
  }
}

/**
 * Extract revenue matches from transcript text using local regex.
 * Returns matches with surrounding context (~100 chars before/after).
 */
function extractRevenueMatches(
  transcript: string,
  maxMatches = 2
): Array<{ match: string; context: string }> {
  const matches: Array<{ match: string; context: string; position: number }> = [];
  const seenPositions = new Set<number>();

  for (const pattern of REVENUE_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;

    let result;
    while ((result = pattern.exec(transcript)) !== null) {
      const position = result.index;

      // Skip if too close to an existing match (within 50 chars)
      const isTooClose = [...seenPositions].some((p) => Math.abs(p - position) < 50);
      if (isTooClose) continue;

      seenPositions.add(position);

      // Extract context window (~100 chars before/after)
      const contextStart = Math.max(0, position - 100);
      const contextEnd = Math.min(transcript.length, position + result[0].length + 100);
      let context = transcript.slice(contextStart, contextEnd).trim();

      // Clean up context (remove incomplete words at edges)
      if (contextStart > 0) {
        const firstSpace = context.indexOf(" ");
        if (firstSpace > 0 && firstSpace < 20) {
          context = "..." + context.slice(firstSpace + 1);
        }
      }
      if (contextEnd < transcript.length) {
        const lastSpace = context.lastIndexOf(" ");
        if (lastSpace > context.length - 20) {
          context = context.slice(0, lastSpace) + "...";
        }
      }

      matches.push({
        match: result[0],
        context,
        position,
      });
    }
  }

  // Sort by position and return first N matches
  return matches
    .sort((a, b) => a.position - b.position)
    .slice(0, maxMatches)
    .map(({ match, context }) => ({ match, context }));
}

/**
 * Main function: Search YouTube for podcast transcripts with revenue mentions.
 */
export async function searchYouTubeTranscripts({
  queries,
  maxResultsPerQuery = 5,
  withinDays = 30,
}: YouTubeSearchOptions): Promise<YouTubeSearchResult> {
  const apiKey = process.env.YOUTUBE_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is not set");
  }

  // Calculate date filter
  const publishedAfter = new Date();
  publishedAfter.setDate(publishedAfter.getDate() - withinDays);
  const publishedAfterIso = publishedAfter.toISOString();

  const allSources: StageSource[] = [];
  const seenVideoIds = new Set<string>();
  const summaryParts: string[] = [];
  let videosProcessed = 0;
  let videosWithMatches = 0;

  for (const query of queries) {
    try {
      const videos = await searchYouTubeVideos({
        apiKey,
        query,
        maxResults: maxResultsPerQuery,
        publishedAfter: publishedAfterIso,
      });

      for (const video of videos) {
        // Skip duplicates
        if (seenVideoIds.has(video.videoId)) continue;
        seenVideoIds.add(video.videoId);

        // Pre-filter: skip videos without relevant keywords
        if (!isRelevantVideo(video)) continue;

        videosProcessed++;

        // Get transcript
        const transcript = await getVideoTranscript(video.videoId);
        if (!transcript) continue;

        // Extract revenue matches locally (no AI)
        const matches = extractRevenueMatches(transcript, 2);
        if (matches.length === 0) continue;

        videosWithMatches++;

        // Extract product URLs from description and transcript
        const descriptionUrls = extractProductUrls(video.description);
        const transcriptUrls = extractProductUrls(transcript);
        const allProductUrls = [...new Set([...descriptionUrls, ...transcriptUrls])].slice(0, 3);

        // Extract product names from contexts
        const allProductNames = new Set<string>();
        for (const { context } of matches) {
          for (const name of extractProductNames(context)) {
            allProductNames.add(name);
          }
        }

        // Construct likely product URLs from names if none found in description
        const constructedUrls = constructProductUrls([...allProductNames]);
        const combinedUrls = [...new Set([...allProductUrls, ...constructedUrls])].slice(0, 5);

        // Build product links section for snippet
        const productLinksText = combinedUrls.length > 0
          ? ` | Product links: ${combinedUrls.join(", ")}`
          : "";
        const productNamesText = allProductNames.size > 0
          ? ` | Mentioned: ${[...allProductNames].slice(0, 5).join(", ")}`
          : "";

        // Create sources from matches (max 2 per video)
        for (const { match, context } of matches) {
          allSources.push({
            title: `${video.title} (${video.channelTitle})`,
            url: video.url,
            date: video.publishedAt.slice(0, 10),
            snippet: `[${match}] ${context}${productNamesText}${productLinksText}`,
            stageId: "youtube-podcasts",
          });
        }

        // Add to summary
        summaryParts.push(
          `- ${video.title}: Found ${matches.length} revenue mention(s) - ${matches.map((m) => m.match).join(", ")}${allProductUrls.length > 0 ? ` (${allProductUrls.length} product URLs)` : ""}`
        );
      }
    } catch (err) {
      // Log error but continue with other queries
      console.error(`YouTube search failed for query "${query}":`, err);
    }
  }

  // Deduplicate sources by URL (keep first occurrence which has earliest match)
  const deduped: StageSource[] = [];
  const seenUrls = new Set<string>();
  for (const source of allSources) {
    if (!seenUrls.has(source.url)) {
      seenUrls.add(source.url);
      deduped.push(source);
    }
  }

  const summary = [
    `YouTube podcast transcript search completed.`,
    `Processed ${videosProcessed} videos, found revenue mentions in ${videosWithMatches}.`,
    "",
    ...summaryParts.slice(0, 20), // Limit summary entries
  ].join("\n");

  return {
    sources: deduped,
    summary,
    videosProcessed,
    videosWithMatches,
  };
}
