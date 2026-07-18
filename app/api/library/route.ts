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
    const parsed = parsePlan(await request.json());
    if (typeof parsed === "string") return noStore({ error: parsed }, { status: 400 });

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
        signal = excluded.signal,
        open_range_low = excluded.open_range_low,
        open_range_high = excluded.open_range_high,
        entry = excluded.entry,
        stop = excluded.stop,
        target = excluded.target,
        expected_move = excluded.expected_move,
        confidence = excluded.confidence,
        rationale = excluded.rationale,
        actual_open = excluded.actual_open,
        first_minute_close = excluded.first_minute_close,
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
