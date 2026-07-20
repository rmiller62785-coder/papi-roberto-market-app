import { env } from "cloudflare:workers";
import {
  ensureMooSafetySchemaOnce,
  MooSafetySchemaUnavailableError,
  requireMooSafetySchema,
} from "../../d1-schema.ts";
import { isNasdaqSessionDate, nasdaqSessionSchedule } from "../../market-session.ts";

type Signal = "LONG" | "SHORT" | "WAIT";

type PlanInput = {
  date: string;
  strategyKind: "LEGACY_931_CONFIRMATION" | "MOO_PLANNER";
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
  actualOpenSource?: "NASDAQ_OFFICIAL_CROSS" | null;
  firstMinuteClose?: number | null;
};

const createTableSql = `CREATE TABLE IF NOT EXISTS library_plans (
  date TEXT PRIMARY KEY NOT NULL,
  strategy_kind TEXT NOT NULL DEFAULT 'LEGACY_931_CONFIRMATION',
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
  actual_open_source TEXT,
  first_minute_close REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const createQuarantineTableSql = `CREATE TABLE IF NOT EXISTS session_quarantine (
  record_id TEXT PRIMARY KEY NOT NULL,
  source_table TEXT NOT NULL,
  source_key TEXT NOT NULL,
  session_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  quarantined_at INTEGER NOT NULL,
  details_json TEXT NOT NULL
)`;

const createDateIndexSql =
  "CREATE INDEX IF NOT EXISTS library_plans_date_idx ON library_plans (date DESC)";

const DEFAULT_LIBRARY_PAGE_SIZE = 100;
const MAX_LIBRARY_PAGE_SIZE = 100;

function database() {
  if (!env.DB) throw new Error("Library database is unavailable");
  return env.DB;
}

async function ensureSchema(db: D1Database) {
  await ensureMooSafetySchemaOnce(db);
  await db.batch([
    db.prepare(createTableSql),
    db.prepare(createDateIndexSql),
    db.prepare(createQuarantineTableSql),
    db.prepare("CREATE INDEX IF NOT EXISTS session_quarantine_date_idx ON session_quarantine (session_date)"),
  ]);
}

const easternDate = (nowMs = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));

type LibraryMaintenancePage = {
  scanned: number;
  quarantined: number;
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * Bounded legacy-data repair for the authenticated maintenance path. Public
 * reads must never invoke this function: it deliberately writes quarantine
 * records while preserving the original Library row.
 */
export async function quarantineInvalidLibrarySessionsPage(
  db: D1Database,
  cursor: string | null,
  limit: number,
): Promise<LibraryMaintenancePage> {
  const cursorClause = cursor ? "WHERE date < ?" : "";
  const statement = db.prepare(`SELECT date,signal,actual_open AS actualOpen,first_minute_close AS firstMinuteClose
      FROM library_plans
      ${cursorClause}
      ORDER BY date DESC
      LIMIT ?`);
  const rows = await (cursor
    ? statement.bind(cursor, limit + 1)
    : statement.bind(limit + 1))
    .all<{ date: string; signal: string; actualOpen: number | null; firstMinuteClose: number | null }>();
  const hasMore = rows.results.length > limit;
  const page = rows.results.slice(0, limit);
  const invalid = page.filter((row) => !validSessionDate(row.date));
  let quarantined = 0;
  if (invalid.length) {
    const quarantinedAt = Date.now();
    const results = await db.batch(
      invalid.map((row) => db.prepare(
        `INSERT INTO session_quarantine (
          record_id,source_table,source_key,session_date,reason,quarantined_at,details_json
        ) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(record_id) DO NOTHING`,
      ).bind(
        `library_plans:${row.date}`,
        "library_plans",
        row.date,
        row.date,
        "NOT_A_NASDAQ_SESSION",
        quarantinedAt,
        JSON.stringify({
          signal: row.signal,
          hadActualOpen: row.actualOpen != null,
          hadFirstMinuteClose: row.firstMinuteClose != null,
        }),
      )),
    );
    quarantined = results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
  }
  return {
    scanned: page.length,
    quarantined,
    nextCursor: hasMore ? page.at(-1)?.date ?? null : null,
    hasMore,
  };
}

type LibraryReadPage = {
  cursor: string | null;
  limit: number;
};

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function parseLibraryReadPage(request?: Request): LibraryReadPage | string {
  const url = new URL(request?.url ?? "https://library.internal/api/library");
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit == null ? DEFAULT_LIBRARY_PAGE_SIZE : Number(rawLimit);
  if (
    (rawLimit != null && !/^\d+$/.test(rawLimit)) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIBRARY_PAGE_SIZE
  ) {
    return `limit must be an integer from 1 to ${MAX_LIBRARY_PAGE_SIZE}`;
  }
  const cursor = url.searchParams.get("cursor");
  if (cursor != null && !validIsoDate(cursor)) return "cursor must use YYYY-MM-DD";
  return { cursor, limit };
}

function missingLibrarySchema(error: unknown) {
  if (error instanceof MooSafetySchemaUnavailableError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /no such (?:table|column)|has no column named/i.test(message);
}

function noStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(body, { ...init, headers });
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validSessionDate(value: string) {
  try {
    return isNasdaqSessionDate(value);
  } catch {
    return false;
  }
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
  if (!validSessionDate(plan.date)) return "date must be a valid Nasdaq trading session";
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
    strategyKind: plan.strategyKind === "MOO_PLANNER" ? "MOO_PLANNER" : "LEGACY_931_CONFIRMATION",
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
    actualOpenSource: null,
    firstMinuteClose: (plan.firstMinuteClose as number | null | undefined) ?? null,
  };
}

const selectColumns = `
  date, strategy_kind AS strategyKind, signal,
  open_range_low AS openRangeLow,
  open_range_high AS openRangeHigh,
  entry, stop, target,
  expected_move AS expectedMove,
  confidence, rationale,
  actual_open AS actualOpen,
  actual_open_source AS actualOpenSource,
  first_minute_close AS firstMinuteClose,
  created_at AS createdAt,
  updated_at AS updatedAt`;

export async function serveLibraryRead(db: D1Database, request?: Request) {
  const page = parseLibraryReadPage(request);
  if (typeof page === "string") {
    return noStore({ error: "INVALID_LIBRARY_PAGE", detail: page }, { status: 400 });
  }
  try {
    await requireMooSafetySchema(db);
    const cursorClause = page.cursor ? "AND library_plans.date < ?" : "";
    const statement = db.prepare(`SELECT ${selectColumns} FROM library_plans
        WHERE NOT EXISTS (
          SELECT 1 FROM session_quarantine quarantine
          WHERE quarantine.record_id = 'library_plans:' || library_plans.date
        )
        ${cursorClause}
        ORDER BY library_plans.date DESC
        LIMIT ?`);
    const result = await (page.cursor
      ? statement.bind(page.cursor, page.limit + 1)
      : statement.bind(page.limit + 1))
      .all<Record<string, unknown> & { date: string }>();
    const hasMore = result.results.length > page.limit;
    const consumed = result.results.slice(0, page.limit);
    // Defense in depth for a fresh or partially backfilled database. Invalid
    // sessions remain hidden without turning this public request into a write.
    const plans = consumed.filter((row) => validSessionDate(row.date));
    return noStore({
      plans,
      // Kept for compatibility with existing clients. Public reads no longer
      // create quarantine records, so this value is always zero.
      quarantined: 0,
      nextCursor: hasMore ? consumed.at(-1)?.date ?? null : null,
      hasMore,
      limit: page.limit,
    });
  } catch (error) {
    console.error("library GET failed", error instanceof Error ? error.message : error);
    return noStore(
      { error: missingLibrarySchema(error) ? "LIBRARY_SCHEMA_UNAVAILABLE" : "LIBRARY_UNAVAILABLE" },
      { status: 503 },
    );
  }
}

export async function GET(request?: Request) {
  try {
    return await serveLibraryRead(database(), request);
  } catch (error) {
    console.error("library GET failed", error instanceof Error ? error.message : error);
    return noStore({ error: "LIBRARY_UNAVAILABLE" }, { status: 503 });
  }
}

/**
 * Authenticated, cursor-driven maintenance endpoint for legacy invalid-session
 * rows. Each call scans at most 100 rows, preserves source rows, and returns the
 * cursor required to continue the backfill.
 */
export async function PUT(request: Request) {
  try {
    const authorizationError = libraryWriteError(request);
    if (authorizationError) return authorizationError;
    const page = parseLibraryReadPage(request);
    if (typeof page === "string") {
      return noStore({ error: "INVALID_LIBRARY_PAGE", detail: page }, { status: 400 });
    }
    const db = database();
    await ensureSchema(db);
    const maintenance = await quarantineInvalidLibrarySessionsPage(db, page.cursor, page.limit);
    return noStore({ maintenance: "LIBRARY_SESSION_QUARANTINE", ...maintenance });
  } catch (error) {
    console.error("library PUT failed", error instanceof Error ? error.message : error);
    return noStore(
      { error: missingLibrarySchema(error) ? "LIBRARY_SCHEMA_UNAVAILABLE" : "LIBRARY_MAINTENANCE_UNAVAILABLE" },
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
        date, strategy_kind, signal, open_range_low, open_range_high, entry, stop, target,
        expected_move, confidence, rationale, actual_open, actual_open_source, first_minute_close,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        -- Freeze the original forecast/plan. Later writes may attach outcomes
        -- but must never rewrite the recommendation with hindsight.
        actual_open = COALESCE(library_plans.actual_open, excluded.actual_open),
        first_minute_close = COALESCE(library_plans.first_minute_close, excluded.first_minute_close),
        updated_at = excluded.updated_at`)
      .bind(
        parsed.date,
        parsed.strategyKind,
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
        parsed.actualOpenSource,
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
    console.error("library POST failed", error instanceof Error ? error.message : error);
    return noStore(
      { error: "LIBRARY_WRITE_UNAVAILABLE" },
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
    if (!validSessionDate(body.date)) {
      return noStore({ error: "date must be a valid Nasdaq trading session" }, { status: 400 });
    }
    if (body.date > easternDate()) {
      return noStore({ error: "Future-dated outcomes are not allowed" }, { status: 409 });
    }
    if (Date.now() < nasdaqSessionSchedule(body.date).regularOpenAt) {
      return noStore({ error: "The target session has not opened; outcomes are not available" }, { status: 409 });
    }
    const actualOpen = body.actualOpen == null ? null : body.actualOpen;
    const firstMinuteClose = body.firstMinuteClose == null ? null : body.firstMinuteClose;
    if ((actualOpen != null && !finite(actualOpen)) || (firstMinuteClose != null && !finite(firstMinuteClose))) {
      return noStore({ error: "Outcomes must be finite numbers or null" }, { status: 400 });
    }
    if (actualOpen == null && firstMinuteClose == null) {
      return noStore({ error: "At least one outcome is required" }, { status: 400 });
    }
    const actualOpenSource = body.actualOpenSource === "NASDAQ_OFFICIAL_CROSS"
      ? "NASDAQ_OFFICIAL_CROSS"
      : null;
    if (actualOpen != null && actualOpenSource == null) {
      return noStore({
        error: "actualOpen requires actualOpenSource=NASDAQ_OFFICIAL_CROSS; a regular bar open is not official",
      }, { status: 409 });
    }
    const db = database();
    await ensureSchema(db);
    const result = await db
      .prepare(`UPDATE library_plans SET
        actual_open = COALESCE(actual_open, ?),
        actual_open_source = COALESCE(actual_open_source, ?),
        first_minute_close = COALESCE(first_minute_close, ?),
        updated_at = ?
        WHERE date = ?`)
      .bind(actualOpen, actualOpenSource, firstMinuteClose, Date.now(), body.date)
      .run();
    if (!result.meta.changes) {
      return noStore({ error: "No frozen pre-open plan exists for this date" }, { status: 404 });
    }
    const saved = await db.prepare(`SELECT ${selectColumns} FROM library_plans WHERE date = ?`).bind(body.date).first();
    return noStore({ plan: saved });
  } catch (error) {
    if (error instanceof SyntaxError) return noStore({ error: "Request body must be valid JSON" }, { status: 400 });
    console.error("library PATCH failed", error instanceof Error ? error.message : error);
    return noStore({ error: "LIBRARY_OUTCOME_WRITE_UNAVAILABLE" }, { status: 503 });
  }
}
