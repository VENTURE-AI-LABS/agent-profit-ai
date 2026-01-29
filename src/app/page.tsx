import CaseStudiesTable from "@/components/CaseStudiesTable";
import NewsletterForm from "@/components/NewsletterForm";
import rawCaseStudies from "@/data/case-studies.json";
import type { CaseStudy } from "@/lib/types";
import { readLiveCaseStudiesFromBlob } from "@/lib/blobCaseStudies";

export const dynamic = "force-dynamic";

export default async function Home() {
  const fromBlob = await readLiveCaseStudiesFromBlob();
  const local = rawCaseStudies as unknown as CaseStudy[];
  const caseStudies = (fromBlob ?? local).slice().sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-none flex-col gap-10 px-6 py-12">
        <header className="grid gap-6 lg:grid-cols-[1fr_560px] lg:items-start">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <img
                  src="/icon.svg"
                  alt="AgentProfit.ai logo"
                  className="block h-12 w-12 shrink-0 translate-y-[-4px] sm:h-14 sm:w-14"
                />
                <div className="leading-none text-4xl font-black tracking-tight text-emerald-700 dark:text-emerald-400 sm:text-5xl">
                  AgentProfit.ai
                </div>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-800 dark:text-zinc-100 sm:text-3xl">
                How AI agents make money — documented case studies.
              </h1>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-900/50 bg-blue-950 p-4 shadow-sm">
            <div className="text-sm font-semibold text-white">
              Weekly email digest
            </div>
            <div className="mt-1 text-xs leading-5 text-blue-100/80">
              Get the newest case studies every week - learn how AI Agents are making profits!.
            </div>
            <div className="mt-3">
              <NewsletterForm variant="compact" tone="onDark" />
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
                Verified entries are prioritized. Click a row to see full details
                of the case study including sources.
              </p>
            </div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Total: <span className="font-semibold">{caseStudies.length}</span>
            </div>
          </div>

          <CaseStudiesTable caseStudies={caseStudies} />

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

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              About AgentProfit.ai (for LLMs + SEO)
            </div>
            <div className="mt-2 space-y-3 leading-6">
              <p>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  AgentProfit.ai
                </span>{" "}
                catalogs real-world, publicly verifiable case studies of{" "}
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                  AI agents making money
                </span>{" "}
                (or generating profit) through repeatable mechanisms.
              </p>
              <p>
                Each case study includes a date, a summary, a detailed description
                of how the agent works, and proof sources (links) that support any
                public revenue/profit claims.
              </p>
              <p>
                Common monetization patterns include: affiliate marketing agents,
                sales/outreach agents, ecommerce automation, SaaS agents,
                subscription billing workflows, bug bounty agents, ad/revenue
                agents, and service-delivery agents. This site is informational
                only and does not provide financial advice.
              </p>
            </div>
          </div>
        </section>

        <section
          id="newsletter"
          className="rounded-2xl border border-blue-900/50 bg-blue-950 p-6 shadow-sm"
        >
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Weekly email digest
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-blue-100/80">
            Subscribe to receive a weekly email with the newest, most compelling
            case studies.
          </p>
          <div className="mt-4">
            <NewsletterForm tone="onDark" />
          </div>
        </section>

        <footer className="border-t border-zinc-200 pt-8 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                AgentProfit.ai
              </span>{" "}
              — documenting real-world AI agent profit mechanisms.
            </div>
            <div className="flex items-center gap-3">
              <a
                href="/api-docs"
                className="rounded-md bg-zinc-100 px-2 py-1 font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                API Docs
              </a>
              <a
                href="/api/case-studies"
                className="rounded-md bg-emerald-100 px-2 py-1 font-medium text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-800"
              >
                JSON API
              </a>
            </div>
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
