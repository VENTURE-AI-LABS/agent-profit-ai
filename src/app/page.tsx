import CaseStudiesTable from "@/components/CaseStudiesTable";
import NewsletterForm from "@/components/NewsletterForm";
import rawCaseStudies from "@/data/case-studies.json";
import type { CaseStudy } from "@/lib/types";

export default function Home() {
  const caseStudies = rawCaseStudies as unknown as CaseStudy[];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold tracking-wider text-zinc-500 dark:text-zinc-400">
                AgentProfit.ai
              </div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Ways AI agents make money — documented.
              </h1>
            </div>
            <a
              className="hidden rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800 sm:inline-flex"
              href="https://agentprofit.ai"
            >
              AgentProfit.ai
            </a>
          </div>

          <p className="max-w-3xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
            A living catalog of case studies showing how real AI agents earn
            revenue or profit in the wild, with publicly verifiable proof
            sources.
          </p>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <div className="font-semibold text-zinc-900 dark:text-zinc-50">
              Disclaimer (NFA)
            </div>
            <div className="mt-1 leading-6">
              Not financial advice. This site documents observed capabilities of
              AI agents and public claims with sources. Verify everything
              independently. Any revenue/profit claims belong to the cited
              sources.
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Case studies
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Sorted by newest first by default. Click a row to expand.
              </p>
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Total: <span className="font-semibold">{caseStudies.length}</span>
            </div>
          </div>

          <CaseStudiesTable caseStudies={caseStudies} />
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-xl font-semibold tracking-tight">
            Weekly digest
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Subscribe to receive a weekly email with the newest, most compelling
            case studies.
          </p>
          <div className="mt-4">
            <NewsletterForm />
          </div>
        </section>

        <footer className="border-t border-zinc-200 pt-8 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <div>
            AgentProfit.ai — documenting real-world AI agent profit mechanisms.
          </div>
          <div className="mt-2">
            NFA disclaimer: informational only; no solicitation; no investment
            advice.
          </div>
        </footer>
      </main>
    </div>
  );
}
