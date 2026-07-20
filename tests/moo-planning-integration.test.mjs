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
  assert.match(page, /Research estimates below[\s\S]+never populate this snapshot/);
  assert.match(page, /mooSystemStatus\.decisionSnapshot/);
  assert.match(page, /previousNasdaqSession\(strictTargetSession, \{ inclusive: false \}\)/);
  assert.equal([...page.matchAll(/previousNasdaqSession\([^\n]*\{ inclusive: false \}\)/g)].length, 1);
  assert.match(page, /=== mooPlanningPreviousSession/);
  assert.match(page, /const mooPlanningInput = \{/);
  assert.match(page, /planning=\{mooPlanningInput\}/);
  assert.doesNotMatch(page, /planningSources\.planningInput = \{/);
  assert.match(page, /let timedOut = false/);
  assert.match(page, /timedOut = true; controller\.abort\(\)/);
  assert.match(page, /forecastEnvelope\?\.targetDate === mooTargetDate/);
  assert.doesNotMatch(page, /setStrictForecast\(null\)/);
  assert.match(page, /enumerateNearbyTargetSessions\(clockMs, \{ past: 5, future: 10 \}\)/);
});

test("paper planner consumes the flat public-safe broker status contract", async () => {
  const component = await readFile(componentUrl, "utf8");
  assert.match(component, /effectiveBrokerStatus\?\.configured/);
  assert.match(component, /summarizeMooReadiness\(snapshot, effectiveBrokerStatus\)/);
  assert.match(component, /brokerReadiness\.broker\.indicativeShortable/);
  assert.match(component, /effectiveBrokerStatus\.borrowStatus/);
  assert.doesNotMatch(component, /brokerStatus\?*\.account/);
  assert.doesNotMatch(component, /brokerStatus\?*\.nvda/);
  const readiness = await readFile(new URL("../app/moo-readiness.ts", import.meta.url), "utf8");
  assert.match(readiness, /locateGuaranteed === true/);
  assert.match(readiness, /snapshot\.decision === "SHORT_FAVORED"/);
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
