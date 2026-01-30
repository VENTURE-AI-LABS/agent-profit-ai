/**
 * Utility functions for detecting embeddable media URLs.
 * These can be used on both server and client.
 */

/**
 * Extract YouTube video ID from various URL formats.
 */
export function getYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    // youtube.com/watch?v=VIDEO_ID
    if (u.hostname.includes("youtube.com") && u.searchParams.get("v")) {
      return u.searchParams.get("v");
    }
    // youtu.be/VIDEO_ID
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split("/")[0];
    }
    // youtube.com/embed/VIDEO_ID
    if (u.pathname.startsWith("/embed/")) {
      return u.pathname.slice(7).split("/")[0];
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Extract tweet ID from X/Twitter URL.
 */
export function getTweetId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "x.com" || u.hostname === "twitter.com") {
      // Format: /username/status/TWEET_ID or /i/status/TWEET_ID
      const match = u.pathname.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Check if a URL can be embedded.
 */
export function isEmbeddableUrl(url: string): boolean {
  return getYouTubeVideoId(url) !== null || getTweetId(url) !== null;
}
