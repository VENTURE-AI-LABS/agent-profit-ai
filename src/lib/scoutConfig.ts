export type ScoutMode = "strict" | "speculation";

/**
 * Bump this when you change default prompts/query logic.
 * Logged into Blob run logs for auditability and rollback.
 */
export const SCOUT_CONFIG_VERSION = 2 as const;

function compact(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export function buildDefaultScoutQuery({
  windowDays,
}: {
  /** Intended recency window the scout is targeting (e.g. 7 for “this week”). */
  windowDays: number;
}) {
  const window =
    windowDays <= 1 ? "today" : windowDays <= 7 ? "the last 7 days (this week)" : `the last ${windowDays} days`;

  // Keep < 600 chars (enforced by route handlers).
  return compact(`
    Find NEW, specific real-world stories ${window} where an AI agent, AI tool, AI SaaS, AI automation, or AI-powered product made money with an explicit $ amount.
    Include: revenue, MRR, ARR, profit, prize payouts, bounties, sale price, freelance/consulting income using AI.
    Must be about a specific project, company, person, or product (not market size, not trends).
    Keywords: MRR, ARR, revenue, profit, bounty, prize, payout, winner, sold for, income, earnings report.
    Product terms: AI agent, AI tool, AI SaaS, AI chatbot, AI automation, GPT wrapper, LLM app, autonomous agent, agentic workflow, AI assistant, Cursor, Bolt, n8n.
    Exclude: fundraising, funding rounds, raised, valuation, capex, market cap, stock price.
    Prefer: IndieHackers, Devpost, Kaggle, GitHub, YouTube, HackerNews, ProductHunt, personal blogs, news articles.
  `);
}

export function buildClaudeSystemPrompt({ mode }: { mode: ScoutMode }) {
  if (mode === "strict") {
    return [
      "You are an editor for AgentProfit.ai.",
      "",
      "STRICT RULES:",
      "- Output must be a single JSON array ONLY (no markdown, no prose).",
      "- Each entry MUST describe an AI agent, AI tool, AI SaaS, or AI-powered product making money/profit with a specific $ amount.",
      "- EXCLUDE fundraising/valuations/grants; those do NOT count as 'making money'.",
      "- Prefer VERIFIED entries with 2+ proofSources.",
      "- Speculation entries may have 1 proofSource (only if you cannot find a second credible source).",
      "- Prefer URLs from the provided sources list. You may also include product website URLs (set kind: 'website') mentioned in the summary/report.",
      "- At least one proofSources.excerpt MUST contain the $ amount and MUST be copied verbatim from a provided snippet (no paraphrasing in excerpts).",
      "- Title MUST include a $ amount (include '$' character).",
      "- If the sources/snippets are too thin to be confident, set status to 'speculation' and explicitly state the proof gap in the description.",
      "- Do NOT use Facebook/TikTok/Instagram/Discord/Telegram as the only proof source. YouTube and X/Twitter indie maker posts are allowed with corroboration from a non-social source.",
      "",
      "CaseStudy schema:",
      "{ id, date(YYYY-MM-DD), title, summary, description, profitMechanisms[], tags[], proofSources[{label,url,kind?,excerpt?}], status('verified'|'speculation') }",
      "",
      "Use short, neutral writing. Don't fabricate details not present in sources/snippets.",
    ].join("\n");
  }

  // Speculation mode: be more permissive so we can generate candidates even when excerpts are incomplete.
  // The server-side validator will enforce the final acceptance rules.
  return [
    "You are an editor for AgentProfit.ai.",
    "",
    "RULES (SPECULATION MODE):",
    "- Output must be a single JSON array ONLY (no markdown, no prose).",
    "- Each entry MUST describe an AI agent, AI tool, AI SaaS, or AI-powered product making money/profit with a specific $ amount.",
    "- EXCLUDE fundraising/valuations/grants; those do NOT count as 'making money'.",
    "- Prefer 2+ proofSources when possible; 1 proofSource is allowed for speculation when you cannot find a second credible source.",
    "- Prefer URLs from the provided sources list. You may also include product website URLs (set kind: 'website') mentioned in the summary/report.",
    "- If you cannot include a verbatim proofSources.excerpt containing the $ amount, still include the best available excerpt/snippet and clearly state the proof gap in the description.",
    "- Title SHOULD include a $ amount when the sources indicate one (it may be normalized downstream).",
    "- Do NOT use Facebook/TikTok/Instagram/Discord/Telegram as the only proof source. YouTube and X/Twitter indie maker posts are allowed with corroboration.",
    "",
    "CaseStudy schema:",
    "{ id, date(YYYY-MM-DD), title, summary, description, profitMechanisms[], tags[], proofSources[{label,url,kind?,excerpt?}], status('verified'|'speculation') }",
    "",
    "Use short, neutral writing. Don't fabricate details not present in sources/snippets.",
  ].join("\n");
}

export function buildClaudeUserPrompt({
  sources,
  perplexitySummary,
  maxItems,
  mode,
}: {
  sources: Array<{ title: string; url: string; date?: string; snippet?: string }>;
  perplexitySummary: string;
  maxItems: number;
  mode: ScoutMode;
}) {
  const modeHint =
    mode === "speculation"
      ? "- You MAY output speculation entries with 1 proofSource if you cannot find a second credible source."
      : "- Ensure each entry has 2+ proofSources unless truly impossible (otherwise set status to 'speculation').";

  return [
    "Perplexity summary (may contain extra context; treat as secondary):",
    perplexitySummary.slice(0, 6000),
    "",
    "Primary sources (prefer these URLs; you may also include product website URLs with kind: 'website'):",
    JSON.stringify(sources, null, 2),
    "",
    "Task:",
    `- Produce up to ${maxItems} CaseStudy JSON objects that meet the strict rules.`,
    modeHint,
  ].join("\n");
}

