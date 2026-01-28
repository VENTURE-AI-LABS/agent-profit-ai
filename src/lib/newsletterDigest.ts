import type { CaseStudy } from "@/lib/types";

function formatVerifiedOn(dateIso: string) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderWeeklyDigestEmail({
  siteUrl,
  items,
  title = "Weekly email digest — newest case studies",
}: {
  siteUrl: string;
  items: CaseStudy[];
  title?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const subject = `Weekly email digest: ${items.length} new AgentProfit.ai case studies (${today})`;

  const intro =
    items.length === 1
      ? "Here is the newest publicly verifiable case study added to AgentProfit.ai."
      : `Here are ${items.length} publicly verifiable case studies added to AgentProfit.ai.`;

  const listRowsHtml = items
    .map((cs) => {
      const href = `${siteUrl.replace(/\/+$/, "")}/${encodeURIComponent(cs.id)}`;
      return `
        <tr>
          <td style="padding: 10px 0; vertical-align: top; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
            <div style="font-weight: 800; font-size: 16px; line-height: 1.35; color: #0f172a;">
              <a href="${escapeHtml(href)}" style="color: #2563eb; text-decoration: underline; text-underline-offset: 2px;">
                ${escapeHtml(cs.title)}
              </a>
            </div>
            <div style="margin-top: 6px; font-size: 14px; line-height: 1.5; color: #334155;">${escapeHtml(cs.summary)}</div>
            <div style="margin-top: 8px; font-size: 12px; color: #64748b;">
              Verified on ${escapeHtml(formatVerifiedOn(cs.date))}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background: #ffffff; color: #0f172a; padding: 24px;">
      <div style="max-width: 680px; margin: 0 auto;">
        <div style="font-weight: 900; font-size: 20px; letter-spacing: -0.01em; color: #059669;">
          AgentProfit.ai
        </div>

        <h1 style="margin: 14px 0 8px 0; font-size: 22px; line-height: 1.25;">
          ${escapeHtml(title)}
        </h1>
        <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.6; color: #334155;">
          ${escapeHtml(intro)}
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          ${listRowsHtml}
        </table>

        <p style="margin: 18px 0 0 0; font-size: 14px; line-height: 1.6;">
          <a href="${siteUrl}" style="color: #2563eb; text-decoration: underline; text-underline-offset: 2px;">
            View all case studies
          </a>
        </p>

        <p style="margin: 18px 0 0 0; font-size: 12px; color: #64748b;">
          <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color: #64748b; text-decoration: underline; text-underline-offset: 2px;">
            Unsubscribe
          </a>
        </p>
      </div>
    </div>
  `.trim();

  // Avoid printing the full unsubscribe URL in plaintext.
  const text = `${intro}\n\n${items
    .map((cs) => {
      const href = `${siteUrl.replace(/\/+$/, "")}/${encodeURIComponent(cs.id)}`;
      return `${cs.title}\n${cs.summary}\nVerified on ${formatVerifiedOn(cs.date)}\nRead: ${href}`;
    })
    .join("\n\n")}\n\nView all case studies: ${siteUrl}\n`;

  const name = `weekly-digest-${today}`;
  return { name, subject, html, text };
}

