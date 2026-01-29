function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type ResendSegment = { id: string; name: string };

export async function resendGetOrCreateSegmentId({
  apiKey,
  segmentName,
}: {
  apiKey: string;
  segmentName: string;
}) {
  const listRes = await fetch("https://api.resend.com/segments", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!listRes.ok) {
    const text = await listRes.text().catch(() => "");
    throw new Error(`Resend list segments failed: ${listRes.status} ${text.slice(0, 500)}`);
  }
  const listJson = (await listRes.json()) as { data?: ResendSegment[] };
  const segments = Array.isArray(listJson.data) ? listJson.data : [];
  const existing = segments.find((s) => (s.name ?? "").toLowerCase() === segmentName.toLowerCase());
  if (existing?.id) return existing.id;

  // Resend rate limit can be as low as 2 req/sec.
  await sleep(550);

  const createRes = await fetch("https://api.resend.com/segments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: segmentName }),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => "");
    throw new Error(`Resend create segment failed: ${createRes.status} ${text.slice(0, 500)}`);
  }
  const createJson = (await createRes.json()) as { id?: string };
  if (!createJson.id) throw new Error("Resend create segment returned no id.");
  return createJson.id;
}

const DEFAULT_DAILY_SEGMENT_NAME = "AgentProfit Daily";
const DEFAULT_WEEKLY_SEGMENT_NAME = "AgentProfit Weekly";

export async function resendGetOrCreateDailySegmentId(apiKey: string): Promise<string> {
  const envId = process.env.RESEND_DAILY_SEGMENT_ID ?? "";
  if (envId) return envId;

  const segmentName = process.env.RESEND_DAILY_SEGMENT_NAME ?? DEFAULT_DAILY_SEGMENT_NAME;
  return resendGetOrCreateSegmentId({ apiKey, segmentName });
}

export async function resendGetOrCreateWeeklySegmentId(apiKey: string): Promise<string> {
  const envId = process.env.RESEND_WEEKLY_SEGMENT_ID ?? "";
  if (envId) return envId;

  const segmentName = process.env.RESEND_WEEKLY_SEGMENT_NAME ?? DEFAULT_WEEKLY_SEGMENT_NAME;
  return resendGetOrCreateSegmentId({ apiKey, segmentName });
}

export async function resendCreateBroadcast({
  apiKey,
  segmentId,
  from,
  subject,
  html,
  text,
  name,
}: {
  apiKey: string;
  segmentId: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  name: string;
}) {
  // Resend rate limit can be as low as 2 req/sec.
  await sleep(550);

  const res = await fetch("https://api.resend.com/broadcasts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Resend REST API expects snake_case here.
      segment_id: segmentId,
      from,
      subject,
      html,
      text,
      name,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend create broadcast failed: ${res.status} ${body.slice(0, 800)}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("Resend create broadcast returned no id.");
  return json.id;
}

export async function resendSendBroadcast({
  apiKey,
  broadcastId,
}: {
  apiKey: string;
  broadcastId: string;
}) {
  // Resend rate limit can be as low as 2 req/sec.
  await sleep(550);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(`https://api.resend.com/broadcasts/${broadcastId}/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (res.ok) return (await res.json()) as unknown;

    const body = await res.text().catch(() => "");
    if (res.status === 429 && attempt < 3) {
      // backoff: 0.8s, 1.6s, 2.4s
      await sleep(800 * (attempt + 1));
      continue;
    }

    throw new Error(`Resend send broadcast failed: ${res.status} ${body.slice(0, 800)}`);
  }

  throw new Error("Resend send broadcast failed: exhausted retries.");
}

