---
name: discover-case-studies
description: Find new publicly verifiable case studies where AI agents make money, then add them to src/data/case-studies.json with proof sources. Use when asked to research new agent profit examples, update the case study database, or scan the internet for new entries.
---

# Discover case studies (AgentProfit.ai)

## Goal

Maintain a high-signal database of real-world AI agents that **earn revenue or profit**, backed by **publicly verifiable proof**.

Primary output is updating `src/data/case-studies.json`.

## What counts as a case study

A case study should document an **AI agent** (autonomous or semi-autonomous workflow) that:

- **Produces revenue/profit** (e.g., sales, subscriptions, affiliate revenue, ad revenue, services, on-chain yield, bounties)
- Has **public evidence** supporting the claim (links required)
- Has a clear **how it works** description a reader can understand and replicate at a high level

## Proof standard (required)

Each entry must include **2+** proof sources in `proofSources`, at least one of which is a **primary source** when possible:

- **Primary**: official dashboards, on-chain addresses, product pricing + live customer proof, public invoices/receipts, public revenue screenshots from the operator, public repos showing monetized automation + claims
- **Secondary**: reputable articles summarizing the primary source

Avoid unverifiable “trust me” claims. If it’s interesting but weak proof, include it as `status: "unverified"` and explain the gap in the description.

## Research workflow

1. Search for new items (last ~30–90 days first), using queries like:
   - "AI agent revenue proof"
   - "autonomous agent makes money case study"
   - "agentic workflow affiliate revenue dashboard"
   - "AI agent bounty earnings public"
   - "AI agent SaaS launched revenue screenshot"
2. For each candidate:
   - Identify the **agent**, the **profit mechanism**, and the **evidence**
   - Collect proof URLs (prefer primary sources)
   - Extract a short, non-hallucinated excerpt (optional `excerpt` field)
3. Add to `src/data/case-studies.json` following the schema below.
4. Validate:
   - Run `npm run validate:case-studies`
   - Run `npm run lint`

## JSON schema (practical)

Each item must match:

- `id`: stable slug (e.g., `2026-01-15-foo-agent-affiliate`)
- `date`: `YYYY-MM-DD` (date of the public proof / post / announcement)
- `title`: short, descriptive
- `summary`: one sentence
- `description`: multi-paragraph plain text (use newlines)
- `profitMechanisms`: list of mechanisms
- `tags`: short tags (e.g., `affiliate`, `saas`, `ecommerce`, `bounties`, `trading`, `ads`)
- `proofSources`: array of `{ label, url, kind?, excerpt? }`
- `status`: `verified` or `unverified` (default unverified if unsure)

## Writing rules

- Don’t fabricate numbers, screenshots, or claims.
- If a source is ambiguous, say so in `description`.
- Keep tone neutral. Always include the site-wide NFA framing.
- Prefer fewer, stronger entries over many weak ones.

## Additional resources

- Proof guidelines and examples: see [reference.md](reference.md)

