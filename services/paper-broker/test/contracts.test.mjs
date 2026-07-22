import assert from "node:assert/strict";
import test from "node:test";

import {
  ALPACA_PAPER_ORIGIN,
  deterministicClientOrderId,
  newYorkWallTimeUtc,
  validatePaperBrokerEnv,
  validatePaperMooCommand,
} from "../src/contracts.ts";
import { command, environment, NOW } from "./helpers.mjs";

test("checked-in environment semantics are paper-only and default off", () => {
  const config = validatePaperBrokerEnv(environment());
  assert.equal(ALPACA_PAPER_ORIGIN, "https://paper-api.alpaca.markets");
  assert.equal(config.submissionEnabled, false);
  assert.equal(config.shortsEnabled, false);
  assert.equal(config.maximumShares, 1);
  assert.deepEqual([...config.admins], ["owner@example.test"]);
});

test("environment rejects weak secrets, malformed flags, empty admins, and excessive caps", () => {
  assert.throws(() => validatePaperBrokerEnv(environment({ PAPER_COMMAND_SECRET: "weak" })), /TOO_SHORT/);
  assert.throws(() => validatePaperBrokerEnv(environment({ PAPER_ORDER_SUBMISSION_ENABLED: "yes" })), /INVALID/);
  assert.throws(() => validatePaperBrokerEnv(environment({ PAPER_ORDER_ADMIN_EMAILS: "" })), /ADMIN_EMAILS_INVALID/);
  assert.throws(() => validatePaperBrokerEnv(environment({ PAPER_MAX_SHARES: "101" })), /MAX_SHARES_INVALID/);
});

test("only an explicit owner-confirmed whole-share NVDA market+opg command passes", () => {
  const config = validatePaperBrokerEnv(environment());
  assert.equal(validatePaperMooCommand(command(), config, NOW).valid, true);
  const cases = [
    command({ actorEmail: "viewer@example.test" }),
    command({ order: { ...command().order, symbol: "AAPL" } }),
    command({ order: { ...command().order, quantity: 2 }, confirmation: { ...command().confirmation, phrase: "PAPER NVDA BUY 2" } }),
    command({ order: { ...command().order, type: "limit" } }),
    command({ order: { ...command().order, timeInForce: "day" } }),
    command({ order: { ...command().order, extendedHours: true } }),
    command({ confirmation: { ...command().confirmation, explicit: false } }),
    command({ confirmation: { ...command().confirmation, phrase: "yes" } }),
  ];
  for (const candidate of cases) assert.equal(validatePaperMooCommand(candidate, config, NOW).valid, false);
});

test("short commands remain blocked until a separate deployment flag is enabled", () => {
  const short = command({
    order: { ...command().order, side: "sell" },
    confirmation: { ...command().confirmation, phrase: "PAPER NVDA SELL 1" },
  });
  assert.ok(validatePaperMooCommand(short, validatePaperBrokerEnv(environment()), NOW).errors.includes("SHORTS_DISABLED"));
  assert.equal(validatePaperMooCommand(short, validatePaperBrokerEnv(environment({ PAPER_SHORTS_ENABLED: "true" })), NOW).valid, true);
});

test("freeze and submission cutoffs are exact and DST-safe", () => {
  const config = validatePaperBrokerEnv(environment());
  const freeze = newYorkWallTimeUtc("2026-07-20", 9, 24, 30);
  const cutoff = newYorkWallTimeUtc("2026-07-20", 9, 25, 0);
  assert.equal(freeze, Date.parse("2026-07-20T13:24:30Z"));
  assert.equal(newYorkWallTimeUtc("2026-01-20", 9, 24, 30), Date.parse("2026-01-20T14:24:30Z"));
  const before = command({ confirmation: { ...command().confirmation, confirmedAt: freeze - 1, expiresAt: freeze + 1_000 } });
  assert.ok(validatePaperMooCommand(before, config, freeze - 1).errors.includes("DECISION_NOT_FROZEN"));
  assert.equal(validatePaperMooCommand(command(), config, cutoff - 1).valid, true);
  assert.ok(validatePaperMooCommand(command(), config, cutoff).errors.includes("SUBMISSION_WINDOW_CLOSED"));
});

test("weekends, unproved sessions, expired confirmations, and future confirmations fail closed", () => {
  const config = validatePaperBrokerEnv(environment());
  const weekend = command({ targetSession: "2026-07-19" });
  assert.ok(validatePaperMooCommand(weekend, config, NOW).errors.includes("TARGET_SESSION_NOT_WEEKDAY"));
  assert.ok(validatePaperMooCommand(command({ calendar: { ...command().calendar, isTradingSession: false } }), config, NOW).errors.includes("TRADING_SESSION_PROOF_INVALID"));
  assert.ok(validatePaperMooCommand(command(), config, NOW + 30_000).errors.includes("CONFIRMATION_TIME_INVALID"));
  const future = command({ confirmation: { ...command().confirmation, confirmedAt: NOW + 2_000, expiresAt: NOW + 20_000 } });
  assert.ok(validatePaperMooCommand(future, config, NOW).errors.includes("CONFIRMATION_TIME_INVALID"));
});

test("client order IDs are deterministic, bounded, and identity-sensitive", async () => {
  const first = await deterministicClientOrderId(command());
  const repeated = await deterministicClientOrderId(command());
  const changed = await deterministicClientOrderId(command({ intentId: "intent-20260720-0002" }));
  assert.equal(first, repeated);
  assert.notEqual(first, changed);
  assert.match(first, /^apnvda-20260720-b-[0-9a-f]{32}$/);
  assert.ok(first.length <= 128);
});
