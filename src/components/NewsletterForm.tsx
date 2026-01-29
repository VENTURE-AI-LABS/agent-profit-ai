"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";
type Variant = "default" | "compact";
type Tone = "default" | "onDark";
type Frequency = "daily" | "weekly";

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
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const trimmed = email.trim();
    if (!isEmail(trimmed)) {
      setStatus("error");
      setMessage("Please enter a valid email.");
      return;
    }

    setPendingEmail(trimmed);
    setShowFrequencyModal(true);
  }

  async function handleFrequencySelect(frequency: Frequency) {
    setShowFrequencyModal(false);
    setStatus("loading");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, frequency }),
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
      setPendingEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  const inputClasses =
    tone === "onDark"
      ? variant === "compact"
        ? "w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white shadow-sm outline-none transition placeholder:text-white/60 focus:border-white/40"
        : "w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-sm outline-none transition placeholder:text-white/60 focus:border-white/40"
      : variant === "compact"
        ? "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600"
        : "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-600";

  const buttonClasses =
    tone === "onDark"
      ? variant === "compact"
        ? "inline-flex cursor-pointer items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70"
        : "inline-flex cursor-pointer items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70"
      : variant === "compact"
        ? "inline-flex cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        : "inline-flex cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200";

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className={
          variant === "compact"
            ? "flex w-full flex-col gap-2"
            : "flex w-full max-w-xl flex-col gap-3"
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className={inputClasses}
            type="email"
            autoComplete="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "loading"}
          />
          <button
            className={buttonClasses}
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
            Choose your preferred frequency. Unsubscribe any time.
          </div>
        )}
      </form>

      {showFrequencyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowFrequencyModal(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-blue-900/50 bg-blue-950 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowFrequencyModal(false)}
              className="absolute right-4 top-4 cursor-pointer text-blue-300/60 transition hover:text-white"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <h3 className="mb-4 text-center text-lg font-semibold text-white">
              How often would you like emails?
            </h3>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleFrequencySelect("daily")}
                className="w-full cursor-pointer rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/20"
              >
                Daily digest
              </button>
              <button
                onClick={() => handleFrequencySelect("weekly")}
                className="w-full cursor-pointer rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/20"
              >
                Weekly digest
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
