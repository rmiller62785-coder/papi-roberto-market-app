import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { missingRequiredSecretNames, REQUIRED_SECRET_NAMES } from "../scripts/verify-secret-list.mjs";

test("production and example configs declare the one-minute cron and fixed audience", async () => {
  const [production, example] = await Promise.all([
    readFile(new URL("../wrangler.production.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.example.jsonc", import.meta.url), "utf8"),
  ]);
  for (const source of [production, example]) {
    assert.match(source, /"crons"\s*:\s*\["\* \* \* \* \*"\]/);
    assert.match(source, /"CAPTURE_SCHEDULER_AUDIENCE"\s*:\s*"aperture-sites-capture-scheduler"/);
  }
  assert.match(production, /https:\/\/aperture-nvda-plan\.rmiller62785\.chatgpt\.site\/api\/internal\/scheduled-capture/);
});

test("secret-name verification never needs secret values", () => {
  assert.deepEqual(REQUIRED_SECRET_NAMES, ["CAPTURE_SCHEDULER_SECRET", "SITES_ACCESS_BYPASS_TOKEN"]);
  assert.deepEqual(missingRequiredSecretNames([{ name: "CAPTURE_SCHEDULER_SECRET" }]), ["SITES_ACCESS_BYPASS_TOKEN"]);
  assert.deepEqual(missingRequiredSecretNames(REQUIRED_SECRET_NAMES.map((name) => ({ name }))), []);
});
