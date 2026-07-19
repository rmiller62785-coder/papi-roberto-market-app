import assert from "node:assert/strict";
import test from "node:test";

import { classifyMarketEvent, earningsImpactSession } from "../app/event-classification.ts";

for (const headline of ["NVIDIA hardware demand expands", "NVIDIA wins an industry award", "Analysts look forward to results"]) {
  test(`ordinary wording is not geopolitical: ${headline}`, () => {
    assert.notEqual(classifyMarketEvent(headline, "").category, "Geopolitical");
  });
}

test("war and airstrike headlines are geopolitical escalation", () => {
  assert.equal(classifyMarketEvent("Iran war expands after airstrike", "").category, "Geopolitical");
});

test("a clean ceasefire is de-escalation, not escalation", () => {
  assert.equal(classifyMarketEvent("Iran ceasefire deal signed", "").category, "Geopolitical de-escalation");
});

test("a collapsed ceasefire is escalation", () => {
  assert.equal(classifyMarketEvent("Iran ceasefire collapses", "").category, "Geopolitical");
});

for (const headline of [
  "Iran opens a technology conference",
  "Israel publishes new economic figures",
  "Retailers start a holiday price war",
  "Iran denies reports of an attack",
]) {
  test(`benign or negated geopolitical wording is not escalation: ${headline}`, () => {
    assert.notEqual(classifyMarketEvent(headline, "").category, "Geopolitical");
  });
}

test("earnings timing maps BMO to that session and AMC through the next-session calendar", () => {
  const nextSession = (date) => date === "2026-07-02" ? "2026-07-06" : "unexpected";
  assert.equal(earningsImpactSession("2026-07-02", "bmo", nextSession), "2026-07-02");
  assert.equal(earningsImpactSession("2026-07-02", "amc", nextSession), "2026-07-06");
});
