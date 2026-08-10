import { ensureOpsSchema, getD1 } from "../../../db";
import { operatorEmail } from "../../operator-auth";

type Inquiry = {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  problem?: unknown;
  website?: unknown;
};

function field(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function mailtoFor(inquiry: { name: string; email: string; company: string; problem: string }) {
  const subject = `Luna Sol inquiry — ${inquiry.company || inquiry.name || "operating scenario"}`;
  const body = [
    `Name: ${inquiry.name || "Not provided"}`,
    `Email: ${inquiry.email}`,
    `Company: ${inquiry.company || "Not provided"}`,
    "",
    "Operating problem / decision:",
    inquiry.problem,
  ].join("\n");
  const contactEmail = process.env.CONTACT_TO_EMAIL || "Rmiller62785@gmail.com";
  return `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function POST(request: Request) {
  let input: Inquiry;
  try {
    input = await request.json() as Inquiry;
  } catch {
    return Response.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  if (field(input.website, 200)) return Response.json({ ok: true });

  const inquiry = {
    name: field(input.name, 100),
    email: field(input.email, 160),
    company: field(input.company, 140),
    problem: field(input.problem, 2400),
  };
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email);
  if (!emailLooksValid || inquiry.problem.length < 20) {
    return Response.json({ ok: false, error: "Please complete the required fields." }, { status: 422 });
  }

  const fallback = mailtoFor(inquiry);
  let captured = false;
  try {
    await ensureOpsSchema();
    const db = getD1();
    const owner = operatorEmail();
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recent = await db.prepare("SELECT id FROM ops_items WHERE owner_email = ? AND record_type = 'lead' AND notes LIKE ? AND created_at >= ? LIMIT 1").bind(owner, `%Email: ${inquiry.email}%`, cutoff).first<{ id: number }>();
    if (!recent) {
      const now = new Date().toISOString();
      const leadTitle = inquiry.name
        ? `${inquiry.name}${inquiry.company ? ` · ${inquiry.company}` : ""}`
        : inquiry.company || inquiry.email;
      await db.prepare("INSERT INTO ops_items (owner_email, record_type, title, client, status, priority, due_date, notes, value, link, created_at, updated_at) VALUES (?, 'lead', ?, ?, 'new', 'high', '', ?, 0, ?, ?, ?)").bind(owner, leadTitle, inquiry.company, `Name: ${inquiry.name || "Not provided"}\nEmail: ${inquiry.email}\n\nOperating problem / decision:\n${inquiry.problem}`, `mailto:${inquiry.email}`, now, now).run();
    }
    captured = true;
  } catch {
    captured = false;
  }
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;
  const from = process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !to || !from) {
    if (captured) return Response.json({ ok: true, captured: true });
    return Response.json({ ok: false, fallback: true, mailto: fallback }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: inquiry.email,
        subject: `Luna Sol inquiry — ${inquiry.company || inquiry.name || "operating scenario"}`,
        text: [
          `Name: ${inquiry.name}`,
          `Email: ${inquiry.email}`,
          `Company: ${inquiry.company || "Not provided"}`,
          "",
          "Operating problem / decision:",
          inquiry.problem,
        ].join("\n"),
      }),
    });
    if (!response.ok) throw new Error("Email provider rejected request");
    return Response.json({ ok: true, captured });
  } catch {
    if (captured) return Response.json({ ok: true, captured: true, notification: "dashboard" });
    return Response.json({ ok: false, fallback: true, mailto: fallback }, { status: 502 });
  }
}
