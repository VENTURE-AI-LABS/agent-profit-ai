import { NextResponse } from "next/server";
import {
  resendGetOrCreateDailySegmentId,
  resendGetOrCreateWeeklySegmentId,
} from "@/lib/resendBroadcast";

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY is missing." }, { status: 500 });
  }

  let email = "";
  let action: "daily" | "weekly" | "unsubscribe" = "weekly";

  try {
    const body = (await req.json()) as { email?: unknown; action?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (body.action === "daily" || body.action === "weekly" || body.action === "unsubscribe") {
      action = body.action;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!email || !isEmail(email)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  try {
    if (action === "unsubscribe") {
      // Mark contact as unsubscribed
      const res = await fetch("https://api.resend.com/contacts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          unsubscribed: true,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return NextResponse.json(
          { error: "Failed to unsubscribe.", providerBody: text.slice(0, 500) },
          { status: 502 },
        );
      }

      return NextResponse.json({ ok: true, action: "unsubscribed" });
    }

    // Change frequency preference
    const dailySegmentId = await resendGetOrCreateDailySegmentId(apiKey);
    const weeklySegmentId = await resendGetOrCreateWeeklySegmentId(apiKey);

    // Add to new segment
    const newSegmentId = action === "daily" ? dailySegmentId : weeklySegmentId;
    const oldSegmentId = action === "daily" ? weeklySegmentId : dailySegmentId;

    // Update contact with new segment
    const res = await fetch("https://api.resend.com/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        unsubscribed: false,
        segments: [{ id: newSegmentId }],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: "Failed to update preferences.", providerBody: text.slice(0, 500) },
        { status: 502 },
      );
    }

    // Try to remove from old segment (best effort)
    try {
      // First get the contact ID
      const contactRes = await fetch(
        `https://api.resend.com/contacts?email=${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      if (contactRes.ok) {
        const contactData = (await contactRes.json()) as { data?: Array<{ id: string }> };
        const contactId = contactData.data?.[0]?.id;
        if (contactId) {
          // Remove from old segment
          await fetch(
            `https://api.resend.com/segments/${oldSegmentId}/contacts/${contactId}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${apiKey}` },
            }
          );
        }
      }
    } catch {
      // Ignore errors when removing from old segment
    }

    return NextResponse.json({ ok: true, action, frequency: action });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update preferences.", providerBody: msg },
      { status: 502 },
    );
  }
}
