# AgentProfit.ai

AgentProfit.ai is a living catalog of **publicly verifiable case studies** showing how AI agents make money (or profit) in the wild.

## Disclaimer (NFA)

This repository is for informational documentation only. **Not financial advice.** Verify all claims independently. Any revenue/profit claims belong to the cited public sources.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Case study database

Case studies live in:

- `src/data/case-studies.json`

When deployed on Vercel, the site can also read the **live dataset from Vercel Blob**
(written by the weekly pipeline). If the Blob dataset is missing, the site falls
back to `src/data/case-studies.json`.

Each case study includes:

- **date**, **title**, **summary**
- **full description** (plain text)
- **profit mechanisms**
- **proof sources** (public URLs; aim for 2+)

Validate after edits:

```bash
npm run validate:case-studies
npm run lint
```

## Newsletter signup

The UI posts to `POST /api/subscribe`.

By default it is **not configured** and will return `501`.

### Beehiiv (recommended)

Set environment variables:

- `NEWSLETTER_PROVIDER=beehiiv`
- `BEEHIIV_API_KEY=...`
- `BEEHIIV_API_PUB_ID=...`

Then redeploy/restart.

### Weekly email digest (latest 10 case studies)

This repo includes a cron endpoint at:

- `GET /api/cron/weekly-digest`

When deployed on Vercel, `vercel.json` schedules the **weekly update pipeline** weekly (`0 14 * * 1`, UTC).

It will:

- Generate a digest from the **newest entries** in the live case study dataset
- Create and send a **Resend Broadcast** to your newsletter segment

Required environment variables:

- `RESEND_API_KEY`
- `RESEND_FROM` (must be a verified sender/domain in Resend)
- `RESEND_NEWSLETTER_SEGMENT_ID` (recommended) or `RESEND_NEWSLETTER_SEGMENT_NAME`
- `SITE_URL` (used for links in the email)

Optional:

- `WEEKLY_DIGEST_ENABLED=false` to disable sending
- `CRON_TOKEN=...` to allow manual triggering outside Vercel Cron

### Weekly discovery pipeline (Perplexity → Claude Haiku → update case studies → send)

This repo includes a weekly cron endpoint at:

- `GET /api/cron/weekly-update`

It will:

- Use **Perplexity** to find last-week public items about **AI agents making money** (with citations)
- Save the raw research output to **Vercel Blob** under `weekly-scout/<runId>/...`
- Use **Claude Haiku** to convert only well-cited items into valid case studies
- Merge new case studies into the **live case study dataset in Vercel Blob**
- Send a Resend Broadcast for the newly added items (disabled if `WEEKLY_DIGEST_ENABLED=false`)

Required environment variables:

- `PERPLEXITY_API_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `RESEND_NEWSLETTER_SEGMENT_ID` (recommended) or `RESEND_NEWSLETTER_SEGMENT_NAME`

Optional:

- `PERPLEXITY_MODEL=sonar-pro`
- `ANTHROPIC_MODEL=claude-haiku-4-5`
- `WEEKLY_UPDATE_ENABLED=false` to disable the pipeline

Vercel requirements:

- Connect a **Vercel Blob** store to this project (creates `BLOB_READ_WRITE_TOKEN`)

### Resend (recommended)

Set environment variables:

- `NEWSLETTER_PROVIDER=resend`
- `RESEND_API_KEY=...`
- `RESEND_NEWSLETTER_SEGMENT_ID=...` (recommended) or `RESEND_NEWSLETTER_SEGMENT_NAME=...`

Then redeploy/restart.

### Buttondown (legacy starter)

Set environment variables:

- `NEWSLETTER_PROVIDER=buttondown`
- `BUTTONDOWN_API_KEY=...`

Then redeploy/restart.

## Discover new case studies skill

This repo includes a project skill that guides an agent (e.g. Claude Code / Cursor agent) to search the internet for new entries and add them to the database:

- `.cursor/skills/discover-case-studies/SKILL.md`

