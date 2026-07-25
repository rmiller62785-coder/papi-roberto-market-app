import { ensureOpsSchema, getD1 } from "../../../db";
import { getOperator } from "../../operator-auth";

export const dynamic = "force-dynamic";

const recordTypes = new Set(["lead", "engagement", "task", "decision", "deliverable", "risk", "evidence"]);

type OpsItem = {
  id: number;
  ownerEmail: string;
  recordType: string;
  title: string;
  client: string;
  status: string;
  priority: string;
  dueDate: string;
  notes: string;
  value: number;
  link: string;
  createdAt: string;
  updatedAt: string;
};

const selectColumns = `id, owner_email AS ownerEmail, record_type AS recordType, title, client, status, priority, due_date AS dueDate, notes, value, link, created_at AS createdAt, updated_at AS updatedAt`;

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 1_000_000_000)) : 0;
}

async function authorized() {
  const operator = await getOperator();
  return operator ? { operator, owner: operator.email.trim().toLowerCase() } : null;
}

export async function GET() {
  const auth = await authorized();
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureOpsSchema();
  const result = await getD1().prepare(`SELECT ${selectColumns} FROM ops_items WHERE owner_email = ? ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, CASE WHEN due_date = '' THEN 1 ELSE 0 END, due_date ASC, updated_at DESC LIMIT 500`).bind(auth.owner).all<OpsItem>();
  return Response.json({ items: result.results, operator: { name: auth.operator.displayName, email: auth.operator.email } });
}

export async function POST(request: Request) {
  const auth = await authorized();
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json() as Record<string, unknown>;
  await ensureOpsSchema();
  const db = getD1();

  if (payload.action === "seed") {
    const existing = await db.prepare("SELECT COUNT(*) AS count FROM ops_items WHERE owner_email = ?").bind(auth.owner).first<{ count: number }>();
    if ((existing?.count ?? 0) > 0) return Response.json({ ok: true, seeded: false });
    const now = new Date().toISOString();
    const starter = [
      ["engagement", "PSA · backlog stabilization", "PSA", "monitoring", "high", "", "Public evidence monitoring and recovery-control follow-through.", 0, "/work/psa"],
      ["engagement", "HopSkipDrive · operating foundation", "HopSkipDrive", "active", "high", "", "Dispatch, compliance, SOP, governance, technical requirements, and implementation roadmap.", 0, "/work/hopskipdrive"],
      ["engagement", "Maid of the Mist · guest-flow assessment", "Maid of the Mist", "follow-up", "medium", "", "Operational assessment and public planning-tool follow-through.", 0, "/work/maid-of-the-mist"],
      ["task", "Confirm next evidence-verification date", "PSA", "open", "high", "2026-07-31", "Check official backlog source and update claim registry if changed.", 0, "https://www.psacard.com/info/backlog-tracker"],
      ["decision", "Choose public distribution sequence", "Luna Sol", "open", "medium", "2026-08-01", "Decide whether to lead with case studies, products, or the Amazon retrospective in outbound distribution.", 0, ""],
      ["deliverable", "Executive Operations Studio", "Luna Sol", "live", "medium", "", "Public capacity, portfolio, and WBR product.", 0, "/tools/executive-operations-studio"],
      ["deliverable", "Implementation Workbench", "Luna Sol", "live", "medium", "", "Public launch, SOP/RACI, and risk-control product.", 0, "/tools/implementation-workbench"],
      ["evidence", "PSA official backlog tracker", "PSA", "verified", "high", "2026-07-31", "Primary operating evidence source; verify date and public checkpoint.", 0, "https://www.psacard.com/info/backlog-tracker"],
    ];
    await db.batch(starter.map((row) => db.prepare("INSERT INTO ops_items (owner_email, record_type, title, client, status, priority, due_date, notes, value, link, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(auth.owner, ...row, now, now)));
    return Response.json({ ok: true, seeded: true }, { status: 201 });
  }

  const recordType = text(payload.recordType, 30).toLowerCase();
  const title = text(payload.title, 220);
  if (!recordTypes.has(recordType) || !title) return Response.json({ error: "A valid record type and title are required." }, { status: 422 });
  const now = new Date().toISOString();
  const result = await db.prepare("INSERT INTO ops_items (owner_email, record_type, title, client, status, priority, due_date, notes, value, link, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(auth.owner, recordType, title, text(payload.client, 160), text(payload.status, 40) || "open", text(payload.priority, 20) || "medium", text(payload.dueDate, 30), text(payload.notes, 4000), amount(payload.value), text(payload.link, 500), now, now).run();
  const id = result.meta?.last_row_id;
  const item = id ? await db.prepare(`SELECT ${selectColumns} FROM ops_items WHERE id = ? AND owner_email = ?`).bind(id, auth.owner).first<OpsItem>() : null;
  return Response.json({ item }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await authorized();
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json() as Record<string, unknown>;
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "A valid record id is required." }, { status: 422 });
  await ensureOpsSchema();
  const db = getD1();
  const current = await db.prepare(`SELECT ${selectColumns} FROM ops_items WHERE id = ? AND owner_email = ?`).bind(id, auth.owner).first<OpsItem>();
  if (!current) return Response.json({ error: "Record not found." }, { status: 404 });
  const recordType = text(payload.recordType ?? current.recordType, 30).toLowerCase();
  if (!recordTypes.has(recordType)) return Response.json({ error: "Invalid record type." }, { status: 422 });
  const next = {
    recordType,
    title: text(payload.title ?? current.title, 220),
    client: text(payload.client ?? current.client, 160),
    status: text(payload.status ?? current.status, 40) || "open",
    priority: text(payload.priority ?? current.priority, 20) || "medium",
    dueDate: text(payload.dueDate ?? current.dueDate, 30),
    notes: text(payload.notes ?? current.notes, 4000),
    value: payload.value === undefined ? current.value : amount(payload.value),
    link: text(payload.link ?? current.link, 500),
  };
  if (!next.title) return Response.json({ error: "Title is required." }, { status: 422 });
  await db.prepare("UPDATE ops_items SET record_type = ?, title = ?, client = ?, status = ?, priority = ?, due_date = ?, notes = ?, value = ?, link = ?, updated_at = ? WHERE id = ? AND owner_email = ?").bind(next.recordType, next.title, next.client, next.status, next.priority, next.dueDate, next.notes, next.value, next.link, new Date().toISOString(), id, auth.owner).run();
  const item = await db.prepare(`SELECT ${selectColumns} FROM ops_items WHERE id = ? AND owner_email = ?`).bind(id, auth.owner).first<OpsItem>();
  return Response.json({ item });
}

export async function DELETE(request: Request) {
  const auth = await authorized();
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "A valid record id is required." }, { status: 422 });
  await ensureOpsSchema();
  await getD1().prepare("DELETE FROM ops_items WHERE id = ? AND owner_email = ?").bind(id, auth.owner).run();
  return Response.json({ ok: true });
}
