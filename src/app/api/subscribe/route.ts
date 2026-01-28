import { NextResponse } from "next/server";

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type Provider = "buttondown" | "beehiiv" | "resend" | "none";

function getProvider(): Provider {
  const raw = (process.env.NEWSLETTER_PROVIDER ?? "none").toLowerCase();
  if (raw === "buttondown") return "buttondown";
  if (raw === "beehiiv") return "beehiiv";
  if (raw === "resend") return "resend";
  return "none";
}

export async function POST(req: Request) {
  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!email || !isEmail(email)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  const provider = getProvider();
  if (provider === "none") {
    return NextResponse.json(
      {
        error:
          "Newsletter is not configured yet. Set NEWSLETTER_PROVIDER and provider credentials.",
      },
      { status: 501 },
    );
  }

  if (provider === "buttondown") {
    const apiKey = process.env.BUTTONDOWN_API_KEY ?? "";
    if (!apiKey) {
      return NextResponse.json(
        { error: "BUTTONDOWN_API_KEY is missing." },
        { status: 500 },
      );
    }

    const res = await fetch("https://api.buttondown.email/v1/subscribers", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        tags: ["agentprofit.ai"],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Provider error while subscribing.",
          providerStatus: res.status,
          providerBody: text.slice(0, 2000),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (provider === "beehiiv") {
    const apiKey = process.env.BEEHIIV_API_KEY ?? "";
    const publicationId = process.env.BEEHIIV_API_PUB_ID ?? "";
    if (!apiKey) {
      return NextResponse.json(
        { error: "BEEHIIV_API_KEY is missing." },
        { status: 500 },
      );
    }
    if (!publicationId) {
      return NextResponse.json(
        { error: "BEEHIIV_API_PUB_ID is missing." },
        { status: 500 },
      );
    }

    const sendWelcomeEmail =
      (process.env.BEEHIIV_SEND_WELCOME_EMAIL ?? "true").toLowerCase() === "true";

    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${encodeURIComponent(publicationId)}/subscriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          send_welcome_email: sendWelcomeEmail,
          utm_source: "agentprofit.ai",
          utm_medium: "website",
          utm_campaign: "newsletter_signup",
          referring_site: "agentprofit.ai",
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Provider error while subscribing.",
          providerStatus: res.status,
          providerBody: text.slice(0, 2000),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY ?? "";
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is missing." },
        { status: 500 },
      );
    }

    const segmentIdEnv = process.env.RESEND_NEWSLETTER_SEGMENT_ID ?? "";
    const segmentName = process.env.RESEND_NEWSLETTER_SEGMENT_NAME ?? "AgentProfit Newsletter";

    async function getOrCreateSegmentId() {
      if (segmentIdEnv) return segmentIdEnv;

      const listRes = await fetch("https://api.resend.com/segments", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!listRes.ok) {
        const text = await listRes.text().catch(() => "");
        throw new Error(
          `Resend list segments failed: ${listRes.status} ${text.slice(0, 500)}`,
        );
      }
      const listJson = (await listRes.json()) as {
        data?: Array<{ id: string; name: string }>;
      };
      const segments = Array.isArray(listJson.data) ? listJson.data : [];
      const existing = segments.find(
        (s) => (s.name ?? "").toLowerCase() === segmentName.toLowerCase(),
      );
      if (existing?.id) return existing.id;

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
        throw new Error(
          `Resend create segment failed: ${createRes.status} ${text.slice(0, 500)}`,
        );
      }
      const createJson = (await createRes.json()) as { id?: string };
      if (!createJson.id) throw new Error("Resend create segment returned no id.");
      return createJson.id;
    }

    try {
      const segmentId = await getOrCreateSegmentId();

      // Create (or update) contact and add to our newsletter segment.
      // Resend uses global contacts; passing `segments` adds membership.
      const res = await fetch("https://api.resend.com/contacts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          unsubscribed: false,
          segments: [{ id: segmentId }],
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json(
          {
            error: "Provider error while subscribing.",
            providerStatus: res.status,
            providerBody: text.slice(0, 2000),
          },
          { status: 502 },
        );
      }

      return NextResponse.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("restricted_api_key")) {
        return NextResponse.json(
          {
            error:
              "Your RESEND_API_KEY is restricted to sending-only. Create a full-access Resend API key (with Contacts/Segments/Broadcasts access) and update RESEND_API_KEY.",
            providerStatus: 401,
            providerBody: msg,
          },
          { status: 502 },
        );
      }
      return NextResponse.json(
        {
          error: "Provider error while subscribing.",
          providerStatus: 500,
          providerBody: msg,
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ error: "Unsupported provider." }, { status: 500 });
}

