import { NextResponse } from "next/server";
import rawCaseStudies from "@/data/case-studies.json";
import type { CaseStudy } from "@/lib/types";
import { readLiveCaseStudiesFromBlob } from "@/lib/blobCaseStudies";

export const runtime = "nodejs";

function isAuthorized(req: Request) {
  // In production, require a token to prevent abuse.
  if (process.env.NODE_ENV !== "production") return true;

  const token = process.env.CRON_TOKEN ?? "";
  if (!token) return false;

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token") ?? "";
  if (queryToken && queryToken === token) return true;

  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7) === token) return true;

  return false;
}

async function getLatestCaseStudies(limit: number) {
  const fromBlob = await readLiveCaseStudiesFromBlob();
  const local = rawCaseStudies as unknown as CaseStudy[];
  const all = (fromBlob ?? local).slice().sort((a, b) => b.date.localeCompare(a.date));
  return all.slice(0, limit);
}

function renderTestEmail({ siteUrl, items }: { siteUrl: string; items: CaseStudy[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const subject = `Resend test — AgentProfit.ai weekly digest (${today})`;

  const rows = items
    .map(
      (cs, i) => `
        <tr>
          <td style="padding: 10px 0; vertical-align: top;">
            <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">${i + 1}. ${cs.date}</div>
            <div style="font-weight: 800; font-size: 16px; line-height: 1.35; color: #0f172a;">${cs.title}</div>
            <div style="margin-top: 6px; font-size: 14px; line-height: 1.5; color: #334155;">${cs.summary}</div>
          </td>
        </tr>
      `,
    )
    .join("");

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 24px;">
      <div style="max-width: 680px; margin: 0 auto;">
        <div style="font-weight: 900; font-size: 20px; color: #059669;">AgentProfit.ai</div>
        <p style="margin: 10px 0 16px 0; font-size: 14px; color: #334155;">
          This is a <strong>test email</strong> to confirm Resend is configured correctly.
        </p>
        <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #0f172a;">Newest case studies</h2>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          ${rows}
        </table>
        <p style="margin: 18px 0 0 0; font-size: 14px;">
          <a href="${siteUrl}" style="color: #2563eb; text-decoration: underline; text-underline-offset: 2px;">
            View all case studies
          </a>
        </p>
      </div>
    </div>
  `.trim();

  const text = `This is a test email to confirm Resend is configured correctly.\n\nView all case studies: ${siteUrl}\n`;
  return { subject, html, text };
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendApiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM ?? "";
  const siteUrl = process.env.SITE_URL ?? "https://agentprofit.ai";

  if (!resendApiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY is missing." }, { status: 500 });
  }
  if (!from) {
    return NextResponse.json({ error: "RESEND_FROM is missing." }, { status: 500 });
  }

  let to = "";
  try {
    const body = (await req.json()) as { to?: unknown };
    to = typeof body.to === "string" ? body.to.trim() : "";
  } catch {
    // ignore
  }
  if (!to) {
    to = process.env.RESEND_TEST_TO ?? "";
  }
  if (!to) {
    return NextResponse.json(
      { error: "Provide { to } or set RESEND_TEST_TO." },
      { status: 400 },
    );
  }

  const latest = await getLatestCaseStudies(3);
  const { subject, html, text } = renderTestEmail({ siteUrl, items: latest });

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
      {
        error: "Resend send failed.",
        providerStatus: res.status,
        providerBody: body.slice(0, 2000),
      },
      { status: 502 },
    );
  }

  const json = (await res.json()) as unknown;
  return NextResponse.json({ ok: true, resend: json });
}

