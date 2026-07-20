import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        url: "data:text/javascript,export%20const%20env%20%3D%20%7B%7D%3B",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  quarantineInvalidLibrarySessionsPage,
  serveLibraryRead,
} = await import("../app/api/library/route.ts");

function readDatabase(rows = [], failure = null) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async all() {
          if (failure) throw failure;
          return { results: rows };
        },
        async first() {
          if (failure) throw failure;
          if (/moo_safety_schema_state/i.test(sql)) return { schema_version: 1 };
          return rows[0] ?? null;
        },
      };
    },
  };
}

function maintenanceDatabase(rows) {
  const prepares = [];
  const batches = [];
  return {
    prepares,
    batches,
    prepare(sql) {
      const statement = {
        sql,
        bindings: [],
        bind(...bindings) {
          this.bindings = bindings;
          return this;
        },
        async all() {
          return { results: rows };
        },
      };
      prepares.push(statement);
      return statement;
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
}

test("public Library GET is read-only, bounded, deterministic, and cursor-driven", async () => {
  const database = readDatabase([
    { date: "2026-07-20", signal: "WAIT" },
    { date: "2026-07-19", signal: "LONG" },
    { date: "2026-07-17", signal: "SHORT" },
  ]);
  const response = await serveLibraryRead(
    database,
    new Request("https://example.test/api/library?limit=2"),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(payload.plans.map((plan) => plan.date), ["2026-07-20"]);
  assert.equal(payload.quarantined, 0);
  assert.equal(payload.hasMore, true);
  assert.equal(payload.nextCursor, "2026-07-19");
  assert.equal(payload.limit, 2);
  assert.equal(database.calls.length, 2);
  assert.match(database.calls[0].sql, /moo_safety_schema_state/);
  assert.match(database.calls[1].sql, /ORDER BY library_plans\.date DESC\s+LIMIT \?/);
  assert.deepEqual(database.calls[1].bindings, [3]);
  assert.ok(database.calls.every((call) => !/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(call.sql)));
});

test("cursor pagination binds data rather than interpolating it", async () => {
  const database = readDatabase([{ date: "2026-07-17", signal: "WAIT" }]);
  const response = await serveLibraryRead(
    database,
    new Request("https://example.test/api/library?limit=1&cursor=2026-07-19"),
  );
  assert.equal(response.status, 200);
  assert.match(database.calls[1].sql, /library_plans\.date < \?/);
  assert.doesNotMatch(database.calls[1].sql, /2026-07-19/);
  assert.deepEqual(database.calls[1].bindings, ["2026-07-19", 2]);
});

test("oversized, malformed, and injection-shaped pagination never reaches D1", async () => {
  for (const query of [
    "limit=101",
    "limit=1.5",
    "limit=-1",
    "cursor=2026-02-30",
    `cursor=${encodeURIComponent("2026-07-20' OR 1=1--")}`,
  ]) {
    const database = readDatabase();
    const response = await serveLibraryRead(
      database,
      new Request(`https://example.test/api/library?${query}`),
    );
    assert.equal(response.status, 400, query);
    assert.equal(database.calls.length, 0, query);
    assert.equal((await response.json()).error, "INVALID_LIBRARY_PAGE", query);
  }
});

test("missing Library schema fails closed without leaking the D1 error", async () => {
  const database = readDatabase([], new Error("D1_ERROR: no such table: session_quarantine"));
  const response = await serveLibraryRead(database, new Request("https://example.test/api/library"));
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.deepEqual(JSON.parse(body), { error: "LIBRARY_SCHEMA_UNAVAILABLE" });
  assert.doesNotMatch(body, /session_quarantine|D1_ERROR|no such table/i);
  assert.equal(database.calls.length, 1);
  assert.doesNotMatch(database.calls[0].sql, /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|REPLACE)\b/i);
});

test("authenticated maintenance helper scans one bounded page and preserves source rows", async () => {
  const database = maintenanceDatabase([
    { date: "2026-07-20", signal: "WAIT", actualOpen: null, firstMinuteClose: null },
    { date: "2026-07-19", signal: "LONG", actualOpen: 200, firstMinuteClose: 201 },
    { date: "2026-07-17", signal: "SHORT", actualOpen: null, firstMinuteClose: null },
  ]);
  const result = await quarantineInvalidLibrarySessionsPage(database, null, 2);

  assert.deepEqual(result, {
    scanned: 2,
    quarantined: 1,
    nextCursor: "2026-07-19",
    hasMore: true,
  });
  assert.match(database.prepares[0].sql, /ORDER BY date DESC\s+LIMIT \?/);
  assert.deepEqual(database.prepares[0].bindings, [3]);
  assert.equal(database.batches.length, 1);
  assert.equal(database.batches[0].length, 1);
  assert.match(database.batches[0][0].sql, /^INSERT INTO session_quarantine/);
  assert.match(database.batches[0][0].sql, /ON CONFLICT\(record_id\) DO NOTHING/);
  assert.doesNotMatch(database.batches[0][0].sql, /\b(?:DELETE|UPDATE|DROP|ALTER)\b/i);
  assert.equal(database.batches[0][0].bindings[0], "library_plans:2026-07-19");
});

test("source contract keeps all DDL and quarantine writes outside public GET", async () => {
  const source = await readFile(new URL("../app/api/library/route.ts", import.meta.url), "utf8");
  const getBody = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function PUT"));
  const putBody = source.slice(source.indexOf("export async function PUT"), source.indexOf("export async function POST"));

  assert.doesNotMatch(getBody, /ensureSchema|quarantineInvalidLibrarySessionsPage|\b(?:CREATE|INSERT|UPDATE|DELETE|DROP|ALTER)\b/);
  assert.ok(putBody.indexOf("libraryWriteError(request)") < putBody.indexOf("database()"));
  assert.ok(putBody.indexOf("libraryWriteError(request)") < putBody.indexOf("ensureSchema(db)"));
  assert.match(putBody, /quarantineInvalidLibrarySessionsPage\(db, page\.cursor, page\.limit\)/);
});
