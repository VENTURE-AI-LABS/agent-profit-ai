import { NextResponse } from "next/server";
import rawCaseStudies from "@/data/case-studies.json";
import type { CaseStudy } from "@/lib/types";
import { readLiveCaseStudiesFromBlob } from "@/lib/blobCaseStudies";
import { renderWeeklyDigestEmail } from "@/lib/newsletterDigest";
import {
  resendCreateBroadcast,
  resendGetOrCreateSegmentId,
  resendSendBroadcast,
} from "@/lib/resendBroadcast";

export const runtime = "nodejs";

function isAuthorized(req: Request) {
  // Vercel Cron sets this header automatically.
  if ((req.headers.get("x-vercel-cron") ?? "") === "1") return true;

  // Fallback for manual triggering (local/dev): Authorization: Bearer <token> OR ?token=<token>
  const token = process.env.CRON_TOKEN ?? "";
  if (!token) return false;

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token") ?? "";
  if (queryToken && queryToken === token) return true;

  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7) === token) return true;

  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enabled = (process.env.WEEKLY_DIGEST_ENABLED ?? "true").toLowerCase() === "true";
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const resendApiKey = process.env.RESEND_API_KEY ?? "";
  if (!resendApiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY is missing." }, { status: 500 });
  }

  const siteUrl = process.env.SITE_URL ?? "https://agentprofit.ai";
  const from = process.env.RESEND_FROM ?? "AgentProfit <onboarding@resend.dev>";
  const testToEnv = process.env.RESEND_TEST_TO ?? "";
  const segmentIdEnv = process.env.RESEND_NEWSLETTER_SEGMENT_ID ?? "";
  const segmentName = process.env.RESEND_NEWSLETTER_SEGMENT_NAME ?? "AgentProfit Newsletter";

  try {
    const url = new URL(req.url);
    const daysParam = url.searchParams.get("days");
    const limitParam = url.searchParams.get("limit");
    const testParam = (url.searchParams.get("test") ?? "").toLowerCase();
    const isTest = testParam === "1" || testParam === "true";

    const fromBlob = await readLiveCaseStudiesFromBlob();
    const local = rawCaseStudies as unknown as CaseStudy[];
    const all = (fromBlob ?? local)
      .slice()
      .sort((a, b) => {
        const ar = (a.status ?? "speculation") === "verified" ? 0 : 1;
        const br = (b.status ?? "speculation") === "verified" ? 0 : 1;
        if (ar !== br) return ar - br;
        return b.date.localeCompare(a.date);
      });
    const isCron = (req.headers.get("x-vercel-cron") ?? "") === "1";
    const days = daysParam ? Math.max(1, Math.min(60, Number(daysParam) || 0)) : isCron ? 1 : 0;
    const limit = limitParam ? Math.max(1, Math.min(50, Number(limitParam) || 0)) : 20;

    const todayUtc = (() => {
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    })();
    const cutoff = new Date(todayUtc.getTime() - days * 86_400_000);

    const selected = !days
      ? all
      : all.filter((cs) => new Date(`${cs.date}T00:00:00Z`).getTime() >= cutoff.getTime());
    const items = selected.slice(0, limit);

    const { name, subject, html, text } = renderWeeklyDigestEmail({
      siteUrl,
      items,
      title: days ? "How AI Agents Made Profits Today" : "Email digest — newest case studies",
      subject: `How AI Agents Made Profits Today - ${items.length} Case Studies`,
    });

    if (isTest) {
      const to = (url.searchParams.get("to") ?? "").trim() || testToEnv;
      if (!to) {
        return NextResponse.json({ error: "Provide ?to= or set RESEND_TEST_TO for test sends." }, { status: 400 });
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          html,
          text,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return NextResponse.json(
          { error: "Resend test send failed.", providerStatus: res.status, providerBody: body.slice(0, 2000) },
          { status: 502 },
        );
      }

      const json = (await res.json()) as unknown;
      return NextResponse.json({
        ok: true,
        test: true,
        to,
        items: items.map((c) => ({ id: c.id, date: c.date, title: c.title })),
        resend: json,
      });
    }

    const segmentId = segmentIdEnv
      ? segmentIdEnv
      : await resendGetOrCreateSegmentId({
          apiKey: resendApiKey,
          segmentName,
        });

    const broadcastId = await resendCreateBroadcast({
      apiKey: resendApiKey,
      segmentId,
      from,
      subject,
      html,
      text,
      name,
    });
    const sendResult = await resendSendBroadcast({ apiKey: resendApiKey, broadcastId });

    return NextResponse.json({
      ok: true,
      items: items.map((c) => ({ id: c.id, date: c.date, title: c.title })),
      resend: { segmentId, broadcastId, send: sendResult },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("restricted_api_key")) {
      return NextResponse.json(
        {
          error:
            "Your RESEND_API_KEY is restricted to sending-only. Weekly broadcasts require a full-access Resend API key (Segments/Broadcasts).",
          providerStatus: 401,
          providerBody: msg,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "Failed to send weekly digest.", providerStatus: 500, providerBody: msg },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  // Support POST for manual triggering tools.
  return GET(req);
}

