import { env } from "cloudflare:workers";

type Signal = "LONG" | "SHORT" | "WAIT";

type PlanInput = {
  date: string;
  signal: Signal;
  openRangeLow: number;
  openRangeHigh: number;
  entry: number | null;
  stop: number | null;
  target: number | null;
  expectedMove: number;
  confidence: number;
  rationale: string;
  actualOpen?: number | null;
  firstMinuteClose?: number | null;
};

const createTableSql = `CREATE TABLE IF NOT EXISTS library_plans (
  date TEXT PRIMARY KEY NOT NULL,
  signal TEXT NOT NULL CHECK (signal IN ('LONG', 'SHORT', 'WAIT')),
  open_range_low REAL NOT NULL,
  open_range_high REAL NOT NULL,
  entry REAL,
  stop REAL,
  target REAL,
  expected_move REAL NOT NULL,
  confidence REAL NOT NULL,
  rationale TEXT NOT NULL,
  actual_open REAL,
  first_minute_close REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const createDateIndexSql =
  "CREATE INDEX IF NOT EXISTS library_plans_date_idx ON library_plans (date DESC)";

function database() {
  if (!env.DB) throw new Error("Library database is unavailable");
  return env.DB;
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(createTableSql),
    db.prepare(createDateIndexSql),
  ]);
}

function noStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return Response.json(body, { ...init, headers });
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function libraryWriteError(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const configured = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.WEIGHTS_ADMIN_EMAILS ?? "";
  const allowed = new Set(configured.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (!email) return noStore({ error: "Authentication required for Library writes" }, { status: 401 });
  if (!allowed.has(email)) return noStore({ error: "This account is not authorized for Library writes" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) {
        return noStore({ error: "Cross-origin Library writes are not allowed" }, { status: 403 });
      }
    } catch {
      return noStore({ error: "Invalid request origin" }, { status: 403 });
    }
  }
  return null;
}

function parsePlan(value: unknown): PlanInput | string {
  if (!value || typeof value !== "object") return "A JSON plan is required";
  const plan = value as Record<string, unknown>;
  if (typeof plan.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date))
    return "date must use YYYY-MM-DD";
  if (!(["LONG", "SHORT", "WAIT"] as const).includes(plan.signal as Signal))
    return "signal must be LONG, SHORT, or WAIT";
  for (const field of [
    "openRangeLow",
    "openRangeHigh",
    "expectedMove",
    "confidence",
  ] as const) {
    if (!finite(plan[field])) return `${field} must be a finite number`;
  }
  for (const field of ["entry", "stop", "target"] as const) {
    if (plan[field] !== null && !finite(plan[field]))
      return `${field} must be a finite number or null`;
  }
  if (plan.signal !== "WAIT" && [plan.entry, plan.stop, plan.target].some((value) => value === null))
    return "entry, stop, and target are required for LONG and SHORT plans";
  if ((plan.openRangeLow as number) > (plan.openRangeHigh as number))
    return "openRangeLow cannot exceed openRangeHigh";
  if ((plan.confidence as number) < 0 || (plan.confidence as number) > 100)
    return "confidence must be between 0 and 100";
  if (typeof plan.rationale !== "string" || !plan.rationale.trim())
    return "rationale is required";
  for (const field of ["actualOpen", "firstMinuteClose"] as const) {
    if (plan[field] !== undefined && plan[field] !== null && !finite(plan[field]))
      return `${field} must be a finite number or null`;
  }
  return {
    date: plan.date,
    signal: plan.signal as Signal,
    openRangeLow: plan.openRangeLow as number,
    openRangeHigh: plan.openRangeHigh as number,
    entry: plan.entry as number | null,
    stop: plan.stop as number | null,
    target: plan.target as number | null,
    expectedMove: plan.expectedMove as number,
    confidence: plan.confidence as number,
    rationale: plan.rationale.trim(),
    actualOpen: (plan.actualOpen as number | null | undefined) ?? null,
    firstMinuteClose: (plan.firstMinuteClose as number | null | undefined) ?? null,
  };
}

const selectColumns = `
  date, signal,
  open_range_low AS openRangeLow,
  open_range_high AS openRangeHigh,
  entry, stop, target,
  expected_move AS expectedMove,
  confidence, rationale,
  actual_open AS actualOpen,
  first_minute_close AS firstMinuteClose,
  created_at AS createdAt,
  updated_at AS updatedAt`;

export async function GET() {
  try {
    const db = database();
    await ensureSchema(db);
    const result = await db
      .prepare(`SELECT ${selectColumns} FROM library_plans ORDER BY date DESC`)
      .all();
    return noStore({ plans: result.results });
  } catch (error) {
    return noStore(
      { error: error instanceof Error ? error.message : "Library unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorizationError = libraryWriteError(request);
    if (authorizationError) return authorizationError;
    const parsed = parsePlan(await request.json());
    if (typeof parsed === "string") return noStore({ error: parsed }, { status: 400 });
    if (parsed.actualOpen != null || parsed.firstMinuteClose != null) {
      return noStore({ error: "Create the point-in-time plan before outcomes; use PATCH to attach outcomes." }, { status: 409 });
    }

    const db = database();
    await ensureSchema(db);
    const now = Date.now();
    await db
      .prepare(`INSERT INTO library_plans (
        date, signal, open_range_low, open_range_high, entry, stop, target,
        expected_move, confidence, rationale, actual_open, first_minute_close,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        -- Freeze the original forecast/plan. Later writes may attach outcomes
        -- but must never rewrite the recommendation with hindsight.
        actual_open = COALESCE(library_plans.actual_open, excluded.actual_open),
        first_minute_close = COALESCE(library_plans.first_minute_close, excluded.first_minute_close),
        updated_at = excluded.updated_at`)
      .bind(
        parsed.date,
        parsed.signal,
        parsed.openRangeLow,
        parsed.openRangeHigh,
        parsed.entry,
        parsed.stop,
        parsed.target,
        parsed.expectedMove,
        parsed.confidence,
        parsed.rationale,
        parsed.actualOpen,
        parsed.firstMinuteClose,
        now,
        now,
      )
      .run();

    const saved = await db
      .prepare(`SELECT ${selectColumns} FROM library_plans WHERE date = ?`)
      .bind(parsed.date)
      .first();
    return noStore({ plan: saved }, { status: 200 });
  } catch (error) {
    if (error instanceof SyntaxError)
      return noStore({ error: "Request body must be valid JSON" }, { status: 400 });
    return noStore(
      { error: error instanceof Error ? error.message : "Unable to save plan" },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authorizationError = libraryWriteError(request);
    if (authorizationError) return authorizationError;
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return noStore({ error: "date must use YYYY-MM-DD" }, { status: 400 });
    }
    const actualOpen = body.actualOpen == null ? null : body.actualOpen;
    const firstMinuteClose = body.firstMinuteClose == null ? null : body.firstMinuteClose;
    if ((actualOpen != null && !finite(actualOpen)) || (firstMinuteClose != null && !finite(firstMinuteClose))) {
      return noStore({ error: "Outcomes must be finite numbers or null" }, { status: 400 });
    }
    if (actualOpen == null && firstMinuteClose == null) {
      return noStore({ error: "At least one outcome is required" }, { status: 400 });
    }
    const db = database();
    await ensureSchema(db);
    const result = await db
      .prepare(`UPDATE library_plans SET
        actual_open = COALESCE(actual_open, ?),
        first_minute_close = COALESCE(first_minute_close, ?),
        updated_at = ?
        WHERE date = ?`)
      .bind(actualOpen, firstMinuteClose, Date.now(), body.date)
      .run();
    if (!result.meta.changes) {
      return noStore({ error: "No frozen pre-open plan exists for this date" }, { status: 404 });
    }
    const saved = await db.prepare(`SELECT ${selectColumns} FROM library_plans WHERE date = ?`).bind(body.date).first();
    return noStore({ plan: saved });
  } catch (error) {
    if (error instanceof SyntaxError) return noStore({ error: "Request body must be valid JSON" }, { status: 400 });
    return noStore({ error: error instanceof Error ? error.message : "Unable to attach outcomes" }, { status: 503 });
  }
}
