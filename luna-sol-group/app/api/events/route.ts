import { ensureOpsSchema, getD1 } from "../../../db";

export const dynamic = "force-dynamic";

const allowedEvents = new Set([
  "calculator_loaded",
  "preset_selected",
  "input_changed",
  "no_recovery_shown",
  "scenario_link_copied",
  "artifact_downloaded",
  "inquiry_started",
  "inquiry_submitted",
  "inquiry_failed",
  "constraint_cta_clicked",
  "psa_case_clicked",
]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanProps(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean: Record<string, string | number | boolean> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 12)) {
    const key = rawKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    if (!key || /email|name|company|message|note|url/i.test(key)) continue;
    if (typeof rawValue === "boolean") clean[key] = rawValue;
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) clean[key] = Math.max(-1_000_000_000, Math.min(1_000_000_000, rawValue));
    if (typeof rawValue === "string") clean[key] = rawValue.trim().slice(0, 80);
  }
  return clean;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ ok: false }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) return Response.json({ ok: false }, { status: 413 });

  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const name = cleanText(input.name, 60);
  const path = cleanText(input.path, 180);
  if (!allowedEvents.has(name) || !path.startsWith("/tools/backlog-recovery-calculator")) {
    return Response.json({ ok: false }, { status: 422 });
  }

  try {
    await ensureOpsSchema();
    await getD1().prepare("INSERT INTO site_events (event_name, path, props, created_at) VALUES (?, ?, ?, ?)")
      .bind(name, path, JSON.stringify(cleanProps(input.props)), new Date().toISOString()).run();
    return Response.json({ ok: true }, { status: 201 });
  } catch {
    // Product telemetry must never interrupt the decision tool. A transient or
    // local binding failure is acknowledged without pretending the event persisted.
    return Response.json({ ok: false, captured: false }, { status: 202 });
  }
}
