import "server-only";

// Sends email through Resend (https://resend.com), using its HTTP API so no
// extra package is needed. Configure with:
//   RESEND_API_KEY  – from the Resend dashboard
//   EMAIL_FROM      – a sender on a domain verified in Resend,
//                     e.g. "Sascan Meditech <quotations@sascan.in>"

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export type OutgoingEmail = {
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
};

export async function sendEmail(email: OutgoingEmail): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { ok: false, error: "Email isn't set up yet." };

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: email.to,
        cc: email.cc?.length ? email.cc : undefined,
        reply_to: email.replyTo || undefined,
        subject: email.subject,
        text: email.text,
        attachments: email.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
      }),
    });
  } catch (error) {
    console.error("Email request failed:", error);
    return { ok: false, error: "The email service couldn't be reached. Please try again." };
  }

  const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!response.ok) {
    console.error("Email rejected:", response.status, body);
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "The email service rejected the sender. Check RESEND_API_KEY and that EMAIL_FROM's domain is verified." };
    }
    if (response.status === 422) return { ok: false, error: body?.message ?? "The email service rejected this email." };
    if (response.status === 429) return { ok: false, error: "Too many emails just now. Wait a minute and try again." };
    return { ok: false, error: "The email couldn't be sent. Please try again." };
  }
  return { ok: true, id: body?.id ?? null };
}
