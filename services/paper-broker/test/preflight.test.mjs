import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production configuration is default-off, paper-only, unscheduled, and declares every secret", async () => {
  const config = await readFile(new URL("../wrangler.production.jsonc", import.meta.url), "utf8");
  assert.match(config, /"PAPER_ORDER_SUBMISSION_ENABLED"\s*:\s*"false"/);
  assert.match(config, /"PAPER_SHORTS_ENABLED"\s*:\s*"false"/);
  assert.match(config, /"PAPER_MAX_SHARES"\s*:\s*"1"/);
  for (const secret of ["APCA_API_KEY_ID", "APCA_API_SECRET_KEY", "PAPER_COMMAND_SECRET"]) assert.ok(config.includes(`"${secret}"`));
  assert.doesNotMatch(config, /"triggers"/);
  const preflight = await readFile(new URL("../scripts/preflight.mjs", import.meta.url), "utf8");
  assert.match(preflight, /live Alpaca trading origin is forbidden/);
  assert.match(preflight, /automatic scheduling is forbidden/);
});

test("service has no scheduled or automatic submission entrypoint", async () => {
  const source = await Promise.all(["index.ts", "contracts.ts", "alpaca-paper.ts"].map((file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8"))).then((parts) => parts.join("\n"));
  assert.doesNotMatch(source, /\bscheduled\s*\(/);
  assert.doesNotMatch(source, /setAlarm\s*\(/);
  assert.match(source, /automaticSubmission:\s*false/);
});
