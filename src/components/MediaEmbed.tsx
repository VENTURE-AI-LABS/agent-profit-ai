"use client";

import { useState } from "react";
import { getYouTubeVideoId, getTweetId } from "@/lib/mediaUtils";

type MediaEmbedProps = {
  url: string;
  label?: string;
};

/**
 * YouTube embed component.
 */
function YouTubeEmbed({ videoId, label }: { videoId: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-black dark:border-zinc-700">
      <div className="relative aspect-video w-full">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={label || "YouTube video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  );
}

/**
 * Twitter/X embed component using Twitter's embed widget.
 */
function TweetEmbed({ tweetId: _tweetId, url }: { tweetId: string; url: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Load Twitter widget script
  if (typeof window !== "undefined" && !error) {
    const existingScript = document.getElementById("twitter-widget-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "twitter-widget-script";
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      script.onload = () => {
        setLoaded(true);
        // @ts-expect-error - Twitter widget API
        if (window.twttr?.widgets) {
          // @ts-expect-error - Twitter widget API
          window.twttr.widgets.load();
        }
      };
      script.onerror = () => setError(true);
      document.body.appendChild(script);
    } else if (!loaded) {
      // Script already exists, trigger widget load
      setTimeout(() => {
        // @ts-expect-error - Twitter widget API
        if (window.twttr?.widgets) {
          // @ts-expect-error - Twitter widget API
          window.twttr.widgets.load();
          setLoaded(true);
        }
      }, 500);
    }
  }

  if (error) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl border border-zinc-200 bg-zinc-100 p-4 text-center text-sm text-zinc-600 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
      >
        View tweet on X/Twitter
      </a>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl">
      <blockquote className="twitter-tweet" data-dnt="true" data-theme="light">
        <a href={url}>Loading tweet...</a>
      </blockquote>
    </div>
  );
}

/**
 * Media embed component that detects URL type and renders appropriate embed.
 */
export default function MediaEmbed({ url, label }: MediaEmbedProps) {
  const youtubeId = getYouTubeVideoId(url);
  const tweetId = getTweetId(url);

  if (youtubeId) {
    return <YouTubeEmbed videoId={youtubeId} label={label} />;
  }

  if (tweetId) {
    return <TweetEmbed tweetId={tweetId} url={url} />;
  }

  // Unknown URL type - don't render anything
  return null;
}

