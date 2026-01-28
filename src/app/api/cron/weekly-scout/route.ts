import { runWeeklyUpdate } from "@/app/api/cron/weekly-update/route";

export const runtime = "nodejs";

// Scout-only: updates Blob case studies but never sends email.
export async function GET(req: Request) {
  return runWeeklyUpdate(req, { disableSend: true });
}

export async function POST(req: Request) {
  return runWeeklyUpdate(req, { disableSend: true });
}

