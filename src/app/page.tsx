import CaseStudiesTable from "@/components/CaseStudiesTable";
import NewsletterForm from "@/components/NewsletterForm";
import rawCaseStudies from "@/data/case-studies.json";
import type { CaseStudy } from "@/lib/types";

export default function Home() {
  const caseStudies = rawCaseStudies as unknown as CaseStudy[];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-none flex-col gap-10 px-6 py-12">
        <header className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-start">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="text-4xl font-black tracking-tight sm:text-5xl">
                AgentProfit.ai
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-800 dark:text-zinc-100 sm:text-3xl">
                How AI agents make money — documented case studies.
              </h1>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-900/50 bg-blue-950 p-4 shadow-sm">
            <div className="text-sm font-semibold text-white">
              Weekly digest
            </div>
            <div className="mt-1 text-xs leading-5 text-blue-100/80">
              Get the newest case studies every week - learn how AI Agents are making profits!.
            </div>
            <div className="mt-3">
              <NewsletterForm variant="compact" tone="onDark" />
            </div>
            <a
              className="mt-3 inline-flex text-xs font-medium text-blue-100/80 underline-offset-2 hover:underline"
              href="#newsletter"
            >
              Prefer the full signup section ↓
            </a>
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
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
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
            Weekly digest
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
