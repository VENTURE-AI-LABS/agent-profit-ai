export type ScoutMode = "strict" | "speculation";

/**
 * Bump this when you change default prompts/query logic.
 * Logged into Blob run logs for auditability and rollback.
 */
export const SCOUT_CONFIG_VERSION = 2 as const;

/**
 * Research stage provider type.
 */
export type ResearchProvider = "perplexity" | "grok" | "youtube";

/**
 * A single research stage in the multi-stage pipeline.
 */
export type ResearchStage = {
  /** Unique identifier for this stage (e.g., "grok-x-search", "hackathon") */
  stageId: string;
  /** Provider to use for this stage */
  provider: ResearchProvider;
  /** Human-readable description */
  label: string;
  /** Query focus/angle for this stage */
  queryFocus: string;
  /** Priority for ranking (lower = higher priority) */
  priority: number;
  /** Whether this stage is enabled by default */
  enabled: boolean;
};

/**
 * Default research stages for the scout pipeline.
 * Grok runs first (synchronous), then Perplexity stages (async).
 */
export const DEFAULT_RESEARCH_STAGES: ResearchStage[] = [
  {
    stageId: "grok-x-search",
    provider: "grok",
    label: "X/Twitter Indies",
    queryFocus: "AI agent MRR revenue indie maker solopreneur",
    priority: 1,
    enabled: true,
  },
  {
    stageId: "youtube-podcasts",
    provider: "youtube",
    label: "Podcast Interviews",
    queryFocus: "AI agent revenue interview indie hacker podcast MRR",
    priority: 2,
    enabled: true,
  },
  {
    stageId: "hackathon",
    provider: "perplexity",
    label: "Contest Winners",
    queryFocus: "hackathon winner prize bounty AI agent autonomous",
    priority: 3,
    enabled: true,
  },
  {
    stageId: "indie-revenue",
    provider: "perplexity",
    label: "Indie Makers",
    queryFocus: "indie maker revenue milestone MRR AI agent solo founder",
    priority: 4,
    enabled: true,
  },
  {
    stageId: "youtube-case-study",
    provider: "perplexity",
    label: "Creator Content",
    queryFocus: "AI agent case study tutorial revenue YouTube",
    priority: 5,
    enabled: true,
  },
  {
    stageId: "news-roundup",
    provider: "perplexity",
    label: "Tech News",
    queryFocus: "autonomous agent revenue news profit AI",
    priority: 6,
    enabled: true,
  },
];

function compact(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Build the Grok X Search query for finding indie AI agent success stories.
 */
export function buildGrokXSearchQuery({
  windowDays,
}: {
  windowDays: number;
}): string {
  void windowDays; // Query doesn't change based on window (dates are set via API params)
  return compact(`
    AI agent made money MRR revenue profit indie maker solopreneur
    "hit $" OR "reached $" OR "made $" OR "earning $" OR "generated $"
    "my AI" OR "I built" OR "solo founder" OR "side project"
  `);
}

export function buildDefaultScoutQuery({
  windowDays,
  stageId,
}: {
  /** Intended recency window the scout is targeting (e.g. 7 for "this week"). */
  windowDays: number;
  /** Optional stage ID to customize query focus */
  stageId?: string;
}) {
  const window =
    windowDays <= 1 ? "today" : windowDays <= 7 ? "the last 7 days (this week)" : `the last ${windowDays} days`;

  // Find stage-specific focus if provided
  const stage = stageId ? DEFAULT_RESEARCH_STAGES.find((s) => s.stageId === stageId) : null;
  const focusHint = stage ? `Focus: ${stage.queryFocus}.` : "";

  // Keep < 600 chars (enforced by route handlers).
  return compact(`
    Find NEW, specific real-world stories ${window} where an AI agent / agentic workflow made money with an explicit $ amount.
    Include only: revenue/MRR/ARR/profit, prize payouts, bounties, or a sale price.
    Must be about a specific project/company/person (not market size, not trends).
    Keywords: MRR, ARR, revenue, profit, bounty, prize, payout, winner, sold for.
    Agent terms: agent, autonomous, workflow, multi-agent.
    Exclude: fundraising, funding, raised, valuation, capex, market cap, stock, earnings.
    Prefer: hackathon/contest winners pages, Devpost, Kaggle, GitHub releases/README, IndieHackers, YouTube case study videos.
    ${focusHint}
  `);
}

export function buildClaudeSystemPrompt({ mode }: { mode: ScoutMode }) {
  const indieExtractionHints = [
    "",
    "INDIE PROJECT SIGNALS (prioritize these):",
    '- Phrases: "I built", "my AI agent", "solo founder", "indie maker", "side project"',
    "- Product Hunt launches, IndieHackers milestones",
    "- Twitter/X threads from individual accounts (not companies)",
    "- GitHub repos with sponsor/donation income",
    "",
    "MONEY EXTRACTION PATTERNS:",
    '- MRR: "$X/month MRR", "$Xk MRR", "monthly recurring revenue of $X"',
    '- Prize: "won $X", "prize of $X", "$X bounty"',
    '- Revenue: "generated $X", "made $X", "earned $X", "sold for $X"',
    '- Milestone: "hit $Xk", "crossed $X", "reached $X MRR"',
    "",
    "PRODUCT LINK EXTRACTION (IMPORTANT):",
    "- Look for product/project URLs in the source snippets (e.g., myproduct.com, myapp.ai)",
    "- If a product name is mentioned, include it in the title and description",
    "- Add product website as a proofSource with kind='website' when found",
    "- Describe what the AI product/agent actually DOES in the description",
    "- Example: 'ArcStory.ai is an AI-powered storytelling app that...'",
    "",
    "X/TWITTER SOURCE HANDLING:",
    "- X/Twitter posts from Grok search are allowed as proof sources",
    "- Individual creator posts (indie makers) are more valuable than company announcements",
    "- Look for specific usernames/handles when extracting from X posts",
    "- Extract product URLs mentioned in tweets and add them as separate proofSources",
    "",
    "YOUTUBE PODCAST SOURCE HANDLING (CRITICAL):",
    "- YouTube podcast snippets contain '| Mentioned: ProductName1, ProductName2' with extracted product names",
    "- YouTube snippets may also contain '| Product links: url1, url2' with extracted URLs",
    "- For EACH YouTube source, you MUST add product website proofSources when product names are mentioned",
    "- Construct standard URLs from product names: 'Nomad List' → nomadlist.com, 'Photo AI' → photoai.com",
    "- Add these as proofSources with kind='product' even if not explicitly in the source list",
    "- The description MUST explain what each mentioned product does (AI-powered X that Y)",
    "- Example: If snippet says 'Mentioned: Nomad List, Photo AI', add proofSources for nomadlist.com and photoai.com",
  ].join("\n");

  if (mode === "strict") {
    return [
      "You are an editor for AgentProfit.ai.",
      "",
      "STRICT RULES:",
      "- Output must be a single JSON array ONLY (no markdown, no prose).",
      "- Each entry MUST describe an AI agent or agentic workflow making money/profit with a specific $ amount.",
      "- EXCLUDE fundraising/valuations/grants; those do NOT count as 'making money'.",
      "- Prefer VERIFIED entries with 2+ proofSources.",
      "- Speculation entries may have 1 proofSource (only if you cannot find a second credible source).",
      "- Every proofSources.url MUST be taken EXACTLY from the provided sources list (do not invent links).",
      "- At least one proofSources.excerpt MUST contain the $ amount and MUST be copied verbatim from a provided snippet (no paraphrasing in excerpts).",
      "- Title MUST include a $ amount (include '$' character).",
      "- If the sources/snippets are too thin to be confident, set status to 'speculation' and explicitly state the proof gap in the description.",
      "- Do NOT use social media links (e.g. Facebook, LinkedIn, TikTok, Instagram, Discord, Telegram) as the only proof source. YouTube and X/Twitter (from Grok search) are allowed.",
      indieExtractionHints,
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
    "- Each entry MUST describe an AI agent or agentic workflow making money/profit with a specific $ amount.",
    "- EXCLUDE fundraising/valuations/grants; those do NOT count as 'making money'.",
    "- Prefer 2+ proofSources when possible; 1 proofSource is allowed for speculation when you cannot find a second credible source.",
    "- Every proofSources.url MUST be taken EXACTLY from the provided sources list (do not invent links).",
    "- If you cannot include a verbatim proofSources.excerpt containing the $ amount, still include the best available excerpt/snippet and clearly state the proof gap in the description.",
    "- Title SHOULD include a $ amount when the sources indicate one (it may be normalized downstream).",
    "- Do NOT use social media links (Facebook, LinkedIn, TikTok, Instagram, Discord, Telegram) as the only proof source. YouTube and X/Twitter (from Grok search) are allowed.",
    indieExtractionHints,
    "",
    "CaseStudy schema:",
    "{ id, date(YYYY-MM-DD), title, summary, description, profitMechanisms[], tags[], proofSources[{label,url,kind?,excerpt?}], status('verified'|'speculation') }",
    "",
    "Use short, neutral writing. Don't fabricate details not present in sources/snippets.",
  ].join("\n");
}

/**
 * Build YouTube search queries for finding podcast interviews with revenue mentions.
 * Returns multiple queries to cover different podcast sources and topics.
 */
export function buildYouTubeSearchQueries(): string[] {
  return [
    // Specific podcast channels known for indie/AI content
    "Indie Hackers AI agent revenue interview",
    "My First Million AI startup money",
    "Starter Story founder revenue AI",
    "Lex Fridman AI agent interview",
    "All-In Podcast AI agent",
    "TWIML AI agent business",
    // Generic searches for revenue-focused AI content
    "AI agent made money interview",
    "indie hacker revenue MRR AI",
    "solo founder AI agent profit",
    "AI startup revenue podcast",
    "autonomous agent business interview",
  ];
}

export function buildClaudeUserPrompt({
  sources,
  perplexitySummary,
  maxItems,
  mode,
}: {
  sources: Array<{ title: string; url: string; date?: string; snippet?: string; stageId?: string }>;
  perplexitySummary: string;
  maxItems: number;
  mode: ScoutMode;
}) {
  const modeHint =
    mode === "speculation"
      ? "- You MAY output speculation entries with 1 proofSource if you cannot find a second credible source."
      : "- Ensure each entry has 2+ proofSources unless truly impossible (otherwise set status to 'speculation').";

  // Group sources by stage for better context
  const stageGroups = new Map<string, typeof sources>();
  for (const s of sources) {
    const stage = s.stageId ?? "unknown";
    if (!stageGroups.has(stage)) stageGroups.set(stage, []);
    stageGroups.get(stage)!.push(s);
  }

  const sourcesText =
    stageGroups.size > 1
      ? Array.from(stageGroups.entries())
          .map(([stage, srcs]) => `\n--- Stage: ${stage} ---\n${JSON.stringify(srcs, null, 2)}`)
          .join("\n")
      : JSON.stringify(sources, null, 2);

  return [
    "Research summary (may contain extra context; treat as secondary):",
    perplexitySummary.slice(0, 6000),
    "",
    "Allowed sources (ONLY use these URLs, plus any product URLs mentioned in snippets):",
    sourcesText,
    "",
    "Task:",
    `- Produce up to ${maxItems} CaseStudy JSON objects that meet the strict rules.`,
    modeHint,
    "- Prioritize indie/solo maker stories with clear $ amounts.",
    "- X/Twitter sources from the grok-x-search stage are allowed as proof.",
    "",
    "IMPORTANT - Product Links:",
    "- If a product URL is mentioned in any snippet (e.g., 'check out myapp.ai'), add it as a proofSource with kind='product'",
    "- In the description, explain what the product/AI agent actually DOES",
    "- Include the product name in the title when known",
    "- Product URLs don't need to be in the allowed sources list - extract them from snippets",
  ].join("\n");
}
