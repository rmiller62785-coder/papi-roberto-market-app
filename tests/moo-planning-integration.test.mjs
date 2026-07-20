import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const componentUrl = new URL("../app/components/MooDecisionSurface.tsx", import.meta.url);

test("Strict MOO uses the served forecast block and an exact prior session", async () => {
  const page = await readFile(pageUrl, "utf8");
  assert.match(page, /strictResearchForecast = selectedStrictForecast;/);
  assert.doesNotMatch(page, /strictResearchForecast = selectedStrictForecast\?\.researchForecast/);
  assert.doesNotMatch(page, /latestStrictCapture|selectedStrictForecast\?\.snapshots/);
  assert.match(page, /Generic research snapshots never populate that field/);
  assert.match(page, /previousNasdaqSession\(mooSnapshot\.targetSession, \{ inclusive: false \}\)/);
  assert.equal([...page.matchAll(/previousNasdaqSession\([^\n]*\{ inclusive: false \}\)/g)].length, 2);
  assert.match(page, /=== mooPlanningPreviousSession/);
  assert.match(page, /const mooPlanningInput = \{/);
  assert.match(page, /planning=\{mooPlanningInput\}/);
  assert.doesNotMatch(page, /planningSources\.planningInput = \{/);
  assert.match(page, /let timedOut = false/);
  assert.match(page, /timedOut = true; controller\.abort\(\)/);
});

test("paper planner consumes the flat public-safe broker status contract", async () => {
  const component = await readFile(componentUrl, "utf8");
  assert.match(component, /brokerStatus\?\.configured/);
  assert.match(component, /brokerStatus\.shortable/);
  assert.match(component, /brokerStatus\.borrowStatus/);
  assert.doesNotMatch(component, /brokerStatus\?*\.account/);
  assert.doesNotMatch(component, /brokerStatus\?*\.nvda/);
  assert.match(component, /locateGuaranteed === true/);
  assert.match(component, /Preview only[^\n]+never submits an order/);
  assert.match(component, /PAPER_PROFILE_STORAGE_KEY = "aperture-moo-paper-risk-profile:v2"/);
  assert.match(component, /stopOffset: "1\.00"/);
  assert.match(component, /riskBudget: "100\.00"/);
  assert.match(component, /slippageAllowance: "0\.10"/);
  assert.match(component, /maxShares: "25"/);
  assert.match(component, /timeStop: "10:00 ET"/);
  assert.match(component, /window\.localStorage\.getItem\(PAPER_PROFILE_STORAGE_KEY\)/);
  assert.match(component, /window\.localStorage\.setItem\(PAPER_PROFILE_STORAGE_KEY/);
  assert.match(component, /Missing: prior close/);
  assert.match(component, /Missing: premarket current/);
  assert.match(component, /Incomplete high\/low/);
});
