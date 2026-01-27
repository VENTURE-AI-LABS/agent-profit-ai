import { NextResponse } from "next/server";

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type Provider = "buttondown" | "none";

function getProvider(): Provider {
  const raw = (process.env.NEWSLETTER_PROVIDER ?? "none").toLowerCase();
  if (raw === "buttondown") return "buttondown";
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

  return NextResponse.json({ error: "Unsupported provider." }, { status: 500 });
}

