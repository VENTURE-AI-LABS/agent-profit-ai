"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Status = "idle" | "loading" | "success" | "error";

function ConfirmContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [frequency, setFrequency] = useState<string>("");
  const hasRun = useRef(false);

  useEffect(() => {
    // Prevent double execution in React StrictMode
    if (hasRun.current) return;
    hasRun.current = true;

    if (!token) {
      setStatus("error");
      setMessage("Missing confirmation token.");
      return;
    }

    setStatus("loading");

    fetch(`/api/confirm?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data: unknown = await res.json().catch(() => null);

        if (!res.ok) {
          const err =
            data &&
            typeof data === "object" &&
            "error" in data &&
            typeof (data as { error?: unknown }).error === "string"
              ? (data as { error: string }).error
              : "Failed to confirm subscription.";
          setStatus("error");
          setMessage(err);
          return;
        }

        if (
          data &&
          typeof data === "object" &&
          "frequency" in data &&
          typeof (data as { frequency?: unknown }).frequency === "string"
        ) {
          setFrequency((data as { frequency: string }).frequency);
        }

        setStatus("success");
        setMessage("Your subscription has been confirmed!");
      })
      .catch(() => {
        setStatus("error");
        setMessage("Network error. Please try again.");
      });
  }, [token]);

  return (
    <div className="rounded-2xl border border-blue-900/50 bg-blue-950 p-6 shadow-sm">
      {(status === "idle" || status === "loading") && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-white"></div>
          <p className="text-sm text-white">Confirming your subscription...</p>
        </div>
      )}

      {status === "success" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
            <svg
              className="h-8 w-8 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">{message}</h1>
          {frequency && (
            <p className="text-sm text-blue-100/80">
              You&apos;re now subscribed to the <strong>{frequency}</strong> digest.
            </p>
          )}
          <Link
            href="/"
            className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-blue-50"
          >
            Go to AgentProfit.ai
          </Link>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
            <svg
              className="h-8 w-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">Confirmation failed</h1>
          <p className="text-sm text-blue-100/80">{message}</p>
          <p className="text-sm text-blue-100/60">
            The link may have expired. Please try subscribing again.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-950 shadow-sm transition hover:bg-blue-50"
          >
            Back to AgentProfit.ai
          </Link>
        </div>
      )}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="rounded-2xl border border-blue-900/50 bg-blue-950 p-6 shadow-sm">
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-white"></div>
        <p className="text-sm text-white">Loading...</p>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-12">
        <header className="flex flex-col items-center gap-2">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="/robot-cash-transparent.png"
              alt="AgentProfit.ai logo"
              className="block h-16 w-auto"
            />
            <div className="text-3xl font-black tracking-tight text-emerald-700 dark:text-emerald-400">
              AgentProfit.ai
            </div>
          </Link>
        </header>

        <Suspense fallback={<LoadingFallback />}>
          <ConfirmContent />
        </Suspense>
      </main>
    </div>
  );
}
