import Link from "next/link";

export const metadata = {
  title: "API Documentation - AgentProfit.ai",
  description: "Public API documentation for accessing AI agent profit case studies.",
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            &larr; Back to AgentProfit.ai
          </Link>
        </div>

        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
            API Documentation
          </h1>
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">
            Free public API to access AI agent profit case studies.
          </p>
        </header>

        <section className="space-y-8">
          {/* Base URL */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold">Base URL</h2>
            <code className="mt-3 block rounded-lg bg-zinc-100 px-4 py-3 font-mono text-sm dark:bg-zinc-800">
              https://agentprofit.ai/api
            </code>
          </div>

          {/* Endpoints */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold">Endpoints</h2>

            <div className="mt-6 space-y-6">
              {/* GET /case-studies */}
              <div className="border-l-4 border-emerald-500 pl-4">
                <div className="flex items-center gap-3">
                  <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    GET
                  </span>
                  <code className="font-mono text-sm">/case-studies</code>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Returns a list of all AI agent profit case studies.
                </p>
              </div>
            </div>
          </div>

          {/* Query Parameters */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold">Query Parameters</h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="py-3 pr-4 text-left font-semibold">Parameter</th>
                    <th className="py-3 pr-4 text-left font-semibold">Type</th>
                    <th className="py-3 pr-4 text-left font-semibold">Default</th>
                    <th className="py-3 text-left font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">limit</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">integer</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">50</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Number of results (max 100)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">offset</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">integer</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">0</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Skip first N results (pagination)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">status</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">-</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Filter by status: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">verified</code> or <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">speculation</code></td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">tag</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">-</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Filter by tag (partial match)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">q</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">-</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Search in title, summary, description</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">sort</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">date</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Sort by: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">date</code> or <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">title</code></td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">order</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">desc</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Sort order: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">asc</code> or <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">desc</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Response Format */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold">Response Format</h2>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-100 p-4 font-mono text-sm dark:bg-zinc-800">
{`{
  "success": true,
  "data": [
    {
      "id": "2026-01-29-arcstory-2-3k-mrr",
      "date": "2026-01-29",
      "title": "ArcStory Reaches $2.3K MRR (AI Comic Maker)",
      "summary": "Solo developer built AI comic maker...",
      "description": "Full description of the case study...",
      "profitMechanisms": ["Mobile app monetization", "..."],
      "tags": ["AI", "mobile", "indie"],
      "proofSources": [
        {
          "label": "X Post",
          "url": "https://x.com/...",
          "kind": "tweet",
          "excerpt": "Quote from source..."
        },
        {
          "label": "ArcStory (Official Website)",
          "url": "https://arcstory.ai",
          "kind": "website"
        }
      ],
      "status": "verified"
    }
  ],
  "meta": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  },
  "tags": ["AI", "SaaS", "trading", "..."]
}`}
            </pre>
          </div>

          {/* Examples */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold">Examples</h2>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Get all case studies:</p>
                <code className="mt-2 block rounded-lg bg-zinc-100 px-4 py-2 font-mono text-sm dark:bg-zinc-800">
                  GET /api/case-studies
                </code>
              </div>

              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Get verified case studies only:</p>
                <code className="mt-2 block rounded-lg bg-zinc-100 px-4 py-2 font-mono text-sm dark:bg-zinc-800">
                  GET /api/case-studies?status=verified
                </code>
              </div>

              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Search for trading-related case studies:</p>
                <code className="mt-2 block rounded-lg bg-zinc-100 px-4 py-2 font-mono text-sm dark:bg-zinc-800">
                  GET /api/case-studies?q=trading
                </code>
              </div>

              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Filter by tag with pagination:</p>
                <code className="mt-2 block rounded-lg bg-zinc-100 px-4 py-2 font-mono text-sm dark:bg-zinc-800">
                  GET /api/case-studies?tag=SaaS&limit=10&offset=0
                </code>
              </div>

              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">cURL example:</p>
                <code className="mt-2 block overflow-x-auto rounded-lg bg-zinc-100 px-4 py-2 font-mono text-sm dark:bg-zinc-800">
                  curl &quot;https://agentprofit.ai/api/case-studies?limit=5&quot;
                </code>
              </div>
            </div>
          </div>

          {/* Rate Limits */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold">Rate Limits</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              The API is free and public. Please be respectful and avoid excessive requests.
              If you need higher limits for a specific use case, reach out to us.
            </p>
          </div>

          {/* Data Schema */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold">Case Study Schema</h2>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="py-3 pr-4 text-left font-semibold">Field</th>
                    <th className="py-3 pr-4 text-left font-semibold">Type</th>
                    <th className="py-3 text-left font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">id</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Unique identifier</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">date</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">ISO date (YYYY-MM-DD)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">title</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Case study title (includes $ amount)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">summary</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Brief summary</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">description</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Full description</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">profitMechanisms</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string[]</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">How the agent makes money</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">tags</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string[]</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Categorization tags</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">proofSources</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">object[]</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">Links verifying the claims</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-mono text-emerald-600 dark:text-emerald-400">status</td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">string</td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-400">&quot;verified&quot; or &quot;speculation&quot;</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <footer className="mt-12 border-t border-zinc-200 pt-8 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <div>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              AgentProfit.ai
            </span>{" "}
            — documenting real-world AI agent profit mechanisms.
          </div>
        </footer>
      </main>
    </div>
  );
}
