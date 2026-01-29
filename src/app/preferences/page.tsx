"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";
type Action = "daily" | "weekly" | "unsubscribe";

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function PreferencesPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [completedAction, setCompletedAction] = useState<Action | null>(null);

  async function handleAction(action: Action) {
    const trimmed = email.trim().toLowerCase();
    if (!isEmail(trimmed)) {
      setStatus("error");
      setMessage("Please enter a valid email address.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, action }),
      });

      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const err =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Something went wrong. Please try again.";
        setStatus("error");
        setMessage(err);
        return;
      }

      setStatus("success");
      setCompletedAction(action);
      if (action === "unsubscribe") {
        setMessage("You have been unsubscribed. Sorry to see you go!");
      } else {
        setMessage(`Your preference has been updated to ${action} emails.`);
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-12">
        <header className="flex flex-col items-center gap-2">
          <a href="/" className="flex items-center gap-3">
            <img
              src="/robot-cash-transparent.png"
              alt="AgentProfit.ai logo"
              className="block h-16 w-auto"
            />
            <div className="text-3xl font-black tracking-tight text-emerald-700 dark:text-emerald-400">
              AgentProfit.ai
            </div>
          </a>
        </header>

        <div className="rounded-2xl border border-blue-900/50 bg-blue-950 p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-white">
            Email Preferences
          </h1>
          <p className="mt-2 text-sm text-blue-100/80">
            Update your email frequency or unsubscribe from our newsletter.
          </p>

          <div className="mt-6">
            <label className="block text-sm font-medium text-white">
              Your email address
            </label>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "loading" || status === "success"}
              className="mt-2 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-sm outline-none transition placeholder:text-white/60 focus:border-white/40 disabled:opacity-60"
            />
          </div>

          {status !== "success" && (
            <>
              <div className="mt-6">
                <p className="text-sm font-medium text-white">
                  Change email frequency
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  <button
                    onClick={() => handleAction("daily")}
                    disabled={status === "loading"}
                    className="w-full cursor-pointer rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {status === "loading" ? "Updating..." : "Daily digest"}
                  </button>
                  <button
                    onClick={() => handleAction("weekly")}
                    disabled={status === "loading"}
                    className="w-full cursor-pointer rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {status === "loading" ? "Updating..." : "Weekly digest"}
                  </button>
                </div>
              </div>

              <div className="mt-6 border-t border-white/20 pt-6">
                <button
                  onClick={() => handleAction("unsubscribe")}
                  disabled={status === "loading"}
                  className="w-full cursor-pointer rounded-xl border border-red-400/30 bg-red-500/20 px-4 py-3 text-sm font-medium text-red-200 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === "loading" ? "Processing..." : "Unsubscribe from all emails"}
                </button>
              </div>
            </>
          )}

          {message && (
            <div
              className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                status === "success"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-red-500/20 text-red-200"
              }`}
              role="status"
            >
              {message}
            </div>
          )}

          {status === "success" && completedAction !== "unsubscribe" && (
            <div className="mt-4">
              <a
                href="/"
                className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-blue-50"
              >
                Back to AgentProfit.ai
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
