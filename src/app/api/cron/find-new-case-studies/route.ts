import { runStoryParser } from "@/app/api/cron/parse-new-stories/route";

export const runtime = "nodejs";

// Updates Blob case studies but never sends email.
// Supports ?find=N to cap how many new case studies are added (default 10).
export async function GET(req: Request) {
  return runStoryParser(req, { disableSend: true, defaultWithinDays: 7 });
}

export async function POST(req: Request) {
  return runStoryParser(req, { disableSend: true, defaultWithinDays: 7 });
}
