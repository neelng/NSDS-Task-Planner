// Builds the branded email. Pure and dependency-free so the composer can preview the exact
// HTML that the server sends.

export interface EmailContent {
  heading: string;
  /** Plain text. Blank lines start new paragraphs; URLs become links. */
  body: string;
  senderName: string;
  /** Absolute origin of the app, e.g. https://planner.example.com. Used for the logo and button. */
  appUrl: string;
  /** Optional key/value rows shown in a box under the message (used by task emails). */
  details?: { label: string; value: string }[];
  buttonLabel?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkify(escaped: string): string {
  return escaped.replace(
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g,
    '<a href="$1" style="color:#8e6f3e;text-decoration:underline;">$1</a>'
  );
}

function paragraphs(body: string): string {
  return body
    .trim()
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;">${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
}

export function renderEmailHtml(c: EmailContent): string {
  const base = c.appUrl.replace(/\/$/, "");
  const details = c.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;background:#f7f4ec;border:1px solid #e5dfcf;border-radius:6px;">${c.details
        .map(
          (d) =>
            `<tr><td style="padding:8px 14px;font-size:13px;color:#6b6659;width:110px;vertical-align:top;">${escapeHtml(
              d.label
            )}</td><td style="padding:8px 14px;font-size:14px;color:#0b0b0b;">${escapeHtml(d.value)}</td></tr>`
        )
        .join("")}</table>`
    : "";
  const button = c.buttonLabel
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(base)}" style="display:inline-block;background:#0b0b0b;color:#cfb991;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:6px;">${escapeHtml(
        c.buttonLabel
      )}</a></p>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
    c.heading
  )}</title></head>
<body style="margin:0;padding:0;background:#efeadc;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efeadc;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="background:#0b0b0b;padding:18px 24px;border-radius:8px 8px 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;"><img src="${escapeHtml(base)}/logo.png" width="48" height="48" alt="" style="display:block;border-radius:24px;"></td>
<td style="font-family:Georgia,'Times New Roman',serif;">
<div style="color:#cfb991;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Purdue</div>
<div style="color:#ffffff;font-size:14px;letter-spacing:1px;text-transform:uppercase;">National Security &amp; Defense Society</div>
</td></tr></table>
</td></tr>
<tr><td style="background:#daaa00;height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>
<tr><td style="background:#ffffff;padding:28px 28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">
<h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:#0b0b0b;">${escapeHtml(
    c.heading
  )}</h1>
${paragraphs(c.body)}${details}${button}
</td></tr>
<tr><td style="background:#faf8f2;padding:16px 28px;border-radius:0 0 8px 8px;border-top:1px solid #e5dfcf;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b6659;">
Sent by ${escapeHtml(c.senderName)} through the Purdue National Security &amp; Defense Society Task Planner. You&rsquo;re receiving this because you&rsquo;re a member of the society.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function renderEmailText(c: EmailContent): string {
  const details = c.details?.length ? "\n" + c.details.map((d) => `${d.label}: ${d.value}`).join("\n") + "\n" : "";
  const link = c.buttonLabel ? `\n${c.buttonLabel}: ${c.appUrl}\n` : "";
  return `${c.heading}\n\n${c.body.trim()}\n${details}${link}\n--\nSent by ${c.senderName} through the Purdue NSDS Task Planner.`;
}
