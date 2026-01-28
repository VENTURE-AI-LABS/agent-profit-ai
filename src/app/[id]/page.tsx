import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import rawCaseStudies from "@/data/case-studies.json";
import type { CaseStudy } from "@/lib/types";
import { readLiveCaseStudiesFromBlob } from "@/lib/blobCaseStudies";
import MoneyText from "@/components/MoneyText";

export const dynamic = "force-dynamic";

function formatVerifiedOn(dateIso: string) {
  // ISO YYYY-MM-DD treated as UTC midnight.
  const d = new Date(`${dateIso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const fromBlob = await readLiveCaseStudiesFromBlob();
  const local = rawCaseStudies as unknown as CaseStudy[];
  const cs = (fromBlob ?? local).find((x) => x.id === id);
  if (!cs) return {};
  return {
    title: `${cs.title} | AgentProfit.ai`,
    description: cs.summary,
  };
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fromBlob = await readLiveCaseStudiesFromBlob();
  const local = rawCaseStudies as unknown as CaseStudy[];
  const cs = (fromBlob ?? local).find((x) => x.id === id);
  if (!cs) notFound();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-sm font-semibold text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
          >
            ← Back to case studies
          </Link>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {cs.status ? (
              <span className="font-semibold capitalize">{cs.status}</span>
            ) : (
              <span className="font-semibold">speculation</span>
            )}
          </div>
        </div>

        <header className="mt-6">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            <MoneyText text={cs.title} />
          </h1>
          <p className="mt-3 text-lg leading-7 text-zinc-700 dark:text-zinc-300">
            <MoneyText text={cs.summary} />
          </p>
          <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            Verified on <span className="font-semibold">{formatVerifiedOn(cs.date)}</span>
          </div>
        </header>

        <section className="mt-10 grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Full details
            </div>
            <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-white p-5 text-sm leading-6 text-zinc-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              <MoneyText text={cs.description} />
            </div>

            {!!cs.profitMechanisms?.length && (
              <div className="mt-8">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Profit mechanisms
                </div>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-800 dark:text-zinc-200">
                  {cs.profitMechanisms.map((m) => (
                    <li key={m}>
                      <MoneyText text={m} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <aside className="md:col-span-1">
            {!!cs.tags?.length && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Tags
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {cs.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Proof sources
              </div>
              {cs.proofSources?.length ? (
                <ul className="mt-3 space-y-3 text-sm">
                  {cs.proofSources.map((s) => (
                    <li key={`${cs.id}:${s.url}`} className="leading-6">
                      <a
                        className="font-semibold text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {s.label}
                      </a>
                      {s.kind && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {s.kind}
                        </div>
                      )}
                      {s.excerpt && (
                        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                          <MoneyText text={s.excerpt} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                  No sources yet.
                </div>
              )}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

