import assert from "node:assert/strict";
import test from "node:test";

import {
  canPersistForecastFreeze,
  isAuthorizedScheduledForecastCapture,
} from "../app/forecast-freeze-boundary.ts";

test("public URLs can never receive forecast-freeze write authority", () => {
  for (const url of [
    new URL("https://aperture.example/api/forecast?targetDate=2026-07-20"),
    new URL("https://aperture.example/api/forecast?targetDate=2026-07-20&automation=123"),
    new URL("https://nvda-scheduler.internal/api/forecast?automation=browser"),
  ]) {
    assert.equal(isAuthorizedScheduledForecastCapture(url), false);
    assert.equal(canPersistForecastFreeze({ url, phase: "ACTIONABLE_WINDOW" }), false);
  }
});

test("an internal scheduled capture can write only in the actionable window", () => {
  const url = new URL("https://nvda-scheduler.internal/api/forecast?targetDate=2026-07-20&automation=1784553870000");
  assert.equal(isAuthorizedScheduledForecastCapture(url), true);
  assert.equal(canPersistForecastFreeze({ url, phase: "ACTIONABLE_WINDOW" }), true);
  for (const phase of ["BEFORE_TARGET_PREMARKET", "MONITORING_LOCKED", "CROSS_COMPLETE"]) {
    assert.equal(canPersistForecastFreeze({ url, phase }), false);
  }
});
