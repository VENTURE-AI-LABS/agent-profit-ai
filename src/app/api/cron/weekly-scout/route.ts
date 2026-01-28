import { runWeeklyUpdate } from "@/app/api/cron/weekly-update/route";

export const runtime = "nodejs";

// Deprecated alias for /api/cron/find-new-case-studies
// (kept temporarily to avoid breaking old manual calls).
export async function GET(req: Request) {
  return runWeeklyUpdate(req, { disableSend: true, defaultWithinDays: 7 });
}

export async function POST(req: Request) {
  return runWeeklyUpdate(req, { disableSend: true, defaultWithinDays: 7 });
}

