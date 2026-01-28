"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";
type Variant = "default" | "compact";
type Tone = "default" | "onDark";

function isEmail(email: string) {
  // intentionally basic; server re-validates
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function NewsletterForm({
  variant = "default",
  tone = "default",
}: {
  variant?: Variant;
  tone?: Tone;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const trimmed = email.trim();
    if (!isEmail(trimmed)) {
      setStatus("error");
      setMessage("Please enter a valid email.");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const err =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Subscription failed. Try again later.";
        setStatus("error");
        setMessage(err);
        return;
      }

      setStatus("success");
      setMessage("Thanks — you're subscribed!");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={
        variant === "compact"
          ? "flex w-full flex-col gap-2"
          : "flex w-full max-w-xl flex-col gap-3"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className={
            tone === "onDark"
              ? variant === "compact"
                ? "w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white shadow-sm outline-none transition placeholder:text-white/60 focus:border-white/40"
                : "w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-sm outline-none transition placeholder:text-white/60 focus:border-white/40"
              : variant === "compact"
                ? "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600"
                : "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600"
          }
          type="email"
          autoComplete="email"
          placeholder="you@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "loading"}
        />
        <button
          className={
            tone === "onDark"
              ? variant === "compact"
                ? "inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70"
                : "inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70"
              : variant === "compact"
                ? "inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                : "inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          }
          type="submit"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Subscribing…" : "Subscribe"}
        </button>
      </div>

      {message && (
        <div
          className={
            status === "success"
              ? "text-sm text-emerald-700 dark:text-emerald-400"
              : "text-sm text-rose-700 dark:text-rose-400"
          }
          role="status"
        >
          {message}
        </div>
      )}

      {variant === "default" && (
        <div
          className={
            tone === "onDark"
              ? "text-xs leading-5 text-blue-100/80"
              : "text-xs leading-5 text-zinc-500 dark:text-zinc-400"
          }
        >
          Weekly email digest. Unsubscribe any time.
        </div>
      )}
    </form>
  );
}

