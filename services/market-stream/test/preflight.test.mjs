import assert from "node:assert/strict";
import test from "node:test";

import { REQUIRED_SECRET_NAMES, missingRequiredSecretNames } from "../scripts/verify-secret-list.mjs";

test("deployment secret preflight requires all seven names without inspecting values", () => {
  const installed = REQUIRED_SECRET_NAMES.map((name) => ({ name, type: "secret_text" }));
  assert.deepEqual(missingRequiredSecretNames(installed), []);
  assert.deepEqual(missingRequiredSecretNames(installed.filter(({ name }) => name !== "SITES_ACCESS_BYPASS_TOKEN")), ["SITES_ACCESS_BYPASS_TOKEN"]);
  assert.throws(() => missingRequiredSecretNames({ secrets: installed }), /JSON array/);
});
