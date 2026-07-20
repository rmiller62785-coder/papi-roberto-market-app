import assert from "node:assert/strict";
import test from "node:test";

import {
  computeMooDecisionArtifactDigest,
  computeMooDecisionOutcomeDigest,
  freezeMooDecisionArtifact,
  sealMooDecisionArtifact,
  sealMooDecisionOutcome,
  validateMooDecisionArtifact,
  validateMooDecisionOutcome,
} from "../app/moo-artifact-store.ts";
import { computeMooFeatureManifestDigest, sealMooFeatureSnapshot } from "../app/moo-feature-snapshot.ts";
import { computeMooModelEntryDigest } from "../app/moo-model-registry.ts";
import { sealMooLocateProof } from "../app/moo-contract.ts";
import { sealMooRiskPolicy } from "../app/moo-risk-policy.ts";

const targetSession = "2026-07-20";
const frozenAt = Date.parse("2026-07-20T13:24:20Z");
const cutoffAt = Date.parse("2026-07-20T13:24:30Z");
const regularOpenAt = Date.parse("2026-07-20T13:30:00Z");

function locate(overrides = {}) {
  return sealMooLocateProof({
    schemaVersion: "moo-locate-proof-v1",
    broker: "fixture-broker",
    accountAlias: "Live short",
    symbol: "NVDA",
    targetSession,
    quantity: 2,
    locateId: "locate-artifact-1",
    availableAt: frozenAt - 1_000,
    validUntil: Date.parse("2026-07-20T13:29:00Z"),
    guaranteed: true,
    ...overrides,
  });
}

function feature() {
  const asOf = frozenAt - 2_000;
  return sealMooFeatureSnapshot({
    schemaVersion: "moo-feature-snapshot-v1",
    featureSchemaVersion: "features-v1",
    snapshotId: "feature-2026-07-20",
    targetSession,
    asOf,
    capturedAt: asOf + 100,
    openingCrossAt: regularOpenAt,
    maximumAvailableAt: asOf - 100,
    state: "QUALIFIED",
    manifest: {
      usLastCents: {
        scalarType: "NUMBER", required: true, sourceId: "US", requiredEntitlement: "REALTIME",
        requiredCoverage: "CONSOLIDATED_SIP", sessionBinding: "TARGET_SESSION", expectedSession: null,
        availabilityClass: "PREDICTION_INPUT",
      },
    },
    fields: {
      usLastCents: {
        value: 20_265, state: "FROZEN", reasonCode: "VALUE_PRESENT",
        provenance: {
          sourceId: "US", provider: "fixture", venue: "SIP", entitlement: "REALTIME",
          coverage: "CONSOLIDATED_SIP", sessionDate: targetSession,
          timestamps: {
            sourceAt: asOf - 500, receivedAt: asOf - 300, processedAt: asOf - 100,
            availableAt: asOf - 100, checkedAt: asOf, validUntil: frozenAt,
          },
        },
      },
    },
    quality: { state: "PASS", score: 94, threshold: 80, scoringVersion: "quality-v1", reasonCodes: [] },
  });
}

function model(overrides = {}) {
  const day = 86_400_000;
  const value = {
    schemaVersion: "moo-model-registry-v1",
    modelVersion: "model-v1",
    status: "PROMOTED",
    featureSchemaVersion: "features-v1",
    featureManifestHash: computeMooFeatureManifestDigest(feature().manifest),
    expectedTargetSession: targetSession,
    artifactHash: `sha256:${"b".repeat(64)}`,
    trainedThrough: frozenAt - 10 * day,
    folds: [
      { trainThrough: frozenAt - 40 * day, testFrom: frozenAt - 39 * day, testThrough: frozenAt - 30 * day, observations: 20 },
      { trainThrough: frozenAt - 30 * day, testFrom: frozenAt - 29 * day, testThrough: frozenAt - 20 * day, observations: 20 },
    ],
    baselines: [
      { baseline: "PREVIOUS_CLOSE", grossMaeCents: 120, assumedRoundTripCostCents: 0 },
      { baseline: "OVERNIGHT_MIDPOINT", grossMaeCents: 110, assumedRoundTripCostCents: 0 },
    ],
    modelGrossMaeCents: 100,
    assumedRoundTripCostCents: 3,
    minimumBaselineImprovementCents: 2,
    sampleSize: 40,
    calibration: { method: "isotonic-v1", sampleSize: 40, expectedCalibrationErrorPct: 4, calibratedThrough: frozenAt - 5 * day },
    promotedAt: frozenAt - 4 * day,
    promotedBy: "risk-reviewer",
    promotionPolicyVersion: "promotion-v1",
    retiredAt: null,
    ...overrides,
  };
  return { ...value, contentHash: computeMooModelEntryDigest(value) };
}

function riskPolicy(overrides = {}) {
  const side = (accountAlias) => ({
    orderType: "MOO", sizingMode: "FIXED_QUANTITY", reserveMode: "FIXED_CASH", lossModel: "STOP_PLUS_SLIPPAGE",
    accountAlias, stopOffsetCents: 25, slippageAllowanceCents: 5, quantity: 2,
    reserveCents: 1_000, riskBudgetCents: 60, maximumLossCents: 60,
    timeStop: { hour: 10, minute: 0, timeZone: "America/New_York", action: "EXIT_POSITION" },
  });
  return sealMooRiskPolicy({
    schemaVersion: "moo-risk-policy-v1",
    policyVersion: "risk-v1",
    status: "ACTIVE",
    environment: "live",
    executionScope: "STRICT",
    effectiveFrom: frozenAt - 10_000,
    effectiveUntil: null,
    long: side("Live long"),
    short: side("Live short"),
    portfolioMaximumLossCents: 120,
    minimumConfidencePct: 60,
    minimumDataQualityScore: 80,
    approvedAt: frozenAt - 20_000,
    approvedBy: "risk-reviewer",
    retiredAt: null,
    ...overrides,
  });
}

function ticket(side, overrides = {}) {
  const favored = side === "SHORT";
  return {
    side, orderType: "MOO", favored, actionable: favored,
    thirdRole: favored ? "MAJOR" : "MINOR",
    assignedDistanceCents: favored ? 287 : 57,
    targetMoveCents: favored ? 277 : 47,
    estimatedFillCents: 20_265,
    estimatedTargetCents: favored ? 19_988 : 20_312,
    actualFillCents: null,
    rebasedTargetCents: null,
    stopOffsetCents: 25,
    quantity: 2,
    accountLabel: favored ? "Live short" : "Live long",
    reserveCents: 1_000,
    maximumLossCents: 60,
    timeStop: "10:00 ET",
    shortability: side === "SHORT" ? "AVAILABLE" : "NOT_APPLICABLE",
    ...overrides,
  };
}

function decisionSnapshot(proof = locate(), overrides = {}) {
  return {
    schemaVersion: "moo-phase1-v1",
    snapshotId: "frozen-2026-07-20",
    targetSession,
    generatedAt: frozenAt,
    frozenAt,
    lifecycle: "FROZEN",
    decision: "SHORT_FAVORED",
    decisionReasonCode: "DIRECTIONAL_EDGE",
    blockReason: "NONE",
    predictedOfficialOpenCents: 20_265,
    predictedOpenState: "FROZEN",
    actualOfficialOpenCents: null,
    officialOpenSource: null,
    predictionErrorCents: null,
    confidencePct: 68,
    confidenceState: "FROZEN",
    dataQualityScore: 94,
    dataQualityState: "FROZEN",
    modelVersion: "model-v1",
    featureSnapshotId: "feature-2026-07-20",
    featureSchemaVersion: "features-v1",
    actionCutoffAt: cutoffAt,
    deadlines: [],
    previousRangeCents: 868,
    premarketRangeCents: 169,
    previousEffectiveThirdCents: 287,
    premarketEffectiveThirdCents: 57,
    majorThirdCents: 287,
    minorThirdCents: 57,
    thirdPercentBasisPoints: 3300,
    tickSizeCents: 1,
    addOneTick: true,
    takeProfitCushionCents: 10,
    longTicket: ticket("LONG"),
    shortTicket: ticket("SHORT"),
    shortLocateProof: proof,
    sources: [{
      id: "US", label: "US SIP", venue: "SIP", provider: "fixture", entitlement: "REALTIME",
      coverage: "CONSOLIDATED_SIP", observedAt: frozenAt - 1_000, checkedAt: frozenAt - 900,
      ageMs: 1_000, state: "LIVE",
    }],
    requiredSourceIds: ["US"],
    warnings: [],
    ...overrides,
  };
}

function artifactInput(overrides = {}) {
  const proof = overrides.shortLocateProof ?? locate();
  return {
    schemaVersion: "moo-decision-artifact-v1",
    artifactId: "artifact-2026-07-20",
    targetSession,
    state: "READY",
    executionEnvironment: "live",
    evaluatedAt: frozenAt,
    cutoffAt,
    frozenAt,
    featureSnapshotId: "feature-2026-07-20",
    modelVersion: "model-v1",
    riskPolicyVersion: "risk-v1",
    featureSnapshot: feature(),
    model: model(),
    riskPolicy: riskPolicy(),
    shortLocateProof: proof,
    decisionSnapshot: decisionSnapshot(proof),
    ...overrides,
  };
}

function artifact(overrides = {}) {
  return sealMooDecisionArtifact(artifactInput(overrides));
}

function rehash(value) {
  value.contentHash = computeMooDecisionArtifactDigest(value);
  return value;
}

test("a READY artifact is reproducible from qualified nested contracts and a guaranteed locate", () => {
  const value = artifact();
  assert.deepEqual(validateMooDecisionArtifact(value), { valid: true, errors: [] });
  assert.equal(value.decisionSnapshot.longTicket.actionable, false);
  assert.equal(value.decisionSnapshot.shortTicket.actionable, true);
});

test("noncanonical cutoffs, lifecycle drift, and paper-to-strict promotion fail closed", () => {
  const badCutoff = rehash(structuredClone(artifact()));
  badCutoff.cutoffAt += 1;
  badCutoff.decisionSnapshot.actionCutoffAt += 1;
  rehash(badCutoff);
  assert.ok(validateMooDecisionArtifact(badCutoff).errors.includes("CUTOFF_NOT_CANONICAL"));

  const badLifecycle = rehash(structuredClone(artifact()));
  badLifecycle.decisionSnapshot.lifecycle = "CROSS_COMPLETE";
  rehash(badLifecycle);
  assert.ok(validateMooDecisionArtifact(badLifecycle).errors.includes("SNAPSHOT_LIFECYCLE_INVALID"));

  const paper = rehash(structuredClone(artifact()));
  paper.executionEnvironment = "paper";
  rehash(paper);
  assert.ok(validateMooDecisionArtifact(paper).errors.includes("READY_RISK_POLICY_NOT_STRICT"));
});

test("artifact validation rechecks strict feed coverage and resolved risk-ticket fields", () => {
  const iex = structuredClone(artifact());
  iex.decisionSnapshot.sources[0].coverage = "IEX_SINGLE_EXCHANGE";
  rehash(iex);
  assert.ok(validateMooDecisionArtifact(iex).errors.includes("SNAPSHOT_REQUIRED_SOURCE_NOT_STRICT:US"));

  const substitutedRisk = structuredClone(artifact());
  substitutedRisk.decisionSnapshot.shortTicket.quantity = 1;
  rehash(substitutedRisk);
  const errors = validateMooDecisionArtifact(substitutedRisk).errors;
  assert.ok(errors.includes("READY_TICKET_RISK_POLICY_MISMATCH"));
  assert.ok(errors.includes("READY_SHORT_LOCATE_INVALID") === false, "a larger locate alone cannot hide risk-ticket drift");
});

test("READY artifacts cannot replace mandatory US SIP with another or unknown source", () => {
  const noUs = structuredClone(artifact());
  noUs.decisionSnapshot.requiredSourceIds = ["NOII"];
  noUs.decisionSnapshot.sources = [{
    id: "NOII", label: "NOII", venue: "NASDAQ", provider: "fixture", entitlement: "REALTIME",
    coverage: "NASDAQ_NOII", observedAt: frozenAt - 500, checkedAt: frozenAt - 400, ageMs: 500, state: "LIVE",
  }];
  rehash(noUs);
  assert.ok(validateMooDecisionArtifact(noUs).errors.includes("SOURCE_POLICY:REQUIRED_US_SOURCE_MISSING"));

  const unknown = structuredClone(noUs);
  unknown.decisionSnapshot.requiredSourceIds = ["US", "BOGUS"];
  unknown.decisionSnapshot.sources.push({
    id: "BOGUS", label: "bogus", venue: null, provider: "fixture", entitlement: "REALTIME",
    observedAt: frozenAt - 1, checkedAt: frozenAt - 1, ageMs: 1, state: "LIVE",
  });
  rehash(unknown);
  assert.ok(validateMooDecisionArtifact(unknown).errors.includes("SOURCE_POLICY:REQUIRED_SOURCE_ID_INVALID"));
});

test("READY artifacts recompute source freshness and bind feature availability to evaluation", () => {
  const stale = structuredClone(artifact());
  stale.decisionSnapshot.sources[0].observedAt = frozenAt - 60_000;
  stale.decisionSnapshot.sources[0].checkedAt = frozenAt - 59_900;
  stale.decisionSnapshot.sources[0].ageMs = 1;
  rehash(stale);
  assert.ok(validateMooDecisionArtifact(stale).errors.includes("SNAPSHOT_REQUIRED_SOURCE_STALE:US"));

  const timeTravel = structuredClone(artifact());
  timeTravel.evaluatedAt = frozenAt - 1_950;
  timeTravel.decisionSnapshot.generatedAt = timeTravel.evaluatedAt;
  rehash(timeTravel);
  assert.ok(validateMooDecisionArtifact(timeTravel).errors.includes("FEATURE_AVAILABLE_AFTER_EVALUATION"));
});

test("short artifacts reject account, quantity, time-window, and digest substitution", () => {
  for (const proof of [
    locate({ accountAlias: "Different account" }),
    locate({ quantity: 1 }),
    locate({ availableAt: frozenAt + 1 }),
    locate({ validUntil: Date.parse("2026-07-20T13:27:59Z") }),
    locate({ targetSession: "2026-07-21" }),
  ]) {
    const value = artifactInput({ shortLocateProof: proof, decisionSnapshot: decisionSnapshot(proof) });
    value.contentHash = computeMooDecisionArtifactDigest(value);
    assert.ok(validateMooDecisionArtifact(value).errors.includes("READY_SHORT_LOCATE_INVALID"));
  }

  const tampered = structuredClone(artifact());
  tampered.shortLocateProof.quantity = 999;
  tampered.decisionSnapshot.shortLocateProof.quantity = 999;
  rehash(tampered);
  assert.ok(validateMooDecisionArtifact(tampered).errors.some((error) => error === "LOCATE:LOCATE_CONTENT_HASH_MISMATCH"));
});

test("nested feature and artifact hashes detect mutation before persistence", () => {
  const nested = structuredClone(artifact());
  nested.featureSnapshot.fields.usLastCents.value = 1;
  rehash(nested);
  assert.ok(validateMooDecisionArtifact(nested).errors.includes("FEATURE:CONTENT_HASH_MISMATCH"));

  const nestedModel = structuredClone(artifact());
  nestedModel.model.promotedBy = "substituted";
  rehash(nestedModel);
  assert.ok(validateMooDecisionArtifact(nestedModel).errors.includes("MODEL:CONTENT_HASH_MISMATCH"));

  const topLevel = structuredClone(artifact());
  topLevel.state = "BLOCKED";
  assert.ok(validateMooDecisionArtifact(topLevel).errors.includes("CONTENT_HASH_MISMATCH"));
});

test("decision artifacts deeply freeze nested records and outcomes remain separate", () => {
  const value = freezeMooDecisionArtifact(artifact());
  assert.equal(Object.isFrozen(value.featureSnapshot.fields.usLastCents), true);
  assert.throws(() => { value.decisionSnapshot.shortTicket.quantity = 999; }, TypeError);

  const outcome = sealMooDecisionOutcome({
    schemaVersion: "moo-decision-outcome-v1",
    artifactId: value.artifactId,
    targetSession,
    actualOfficialOpenCents: 20_270,
    officialOpenSource: "NASDAQ_OFFICIAL_CROSS",
    longFillCents: null,
    shortFillCents: 20_271,
    capturedAt: regularOpenAt + 1_000,
  }, value);
  assert.deepEqual(validateMooDecisionOutcome(outcome, value), { valid: true, errors: [] });
  assert.equal(value.decisionSnapshot.actualOfficialOpenCents, null);
});

test("outcomes enforce source allowlist, post-cross timing, artifact identity, and favored side", () => {
  const value = artifact();
  const base = {
    schemaVersion: "moo-decision-outcome-v1",
    artifactId: value.artifactId,
    targetSession,
    actualOfficialOpenCents: 20_270,
    officialOpenSource: "OTHER_PROVIDER",
    longFillCents: 20_269,
    shortFillCents: null,
    capturedAt: regularOpenAt - 1,
    contentHash: `sha256:${"0".repeat(64)}`,
  };
  const errors = validateMooDecisionOutcome(base, value).errors;
  assert.ok(errors.includes("OFFICIAL_OPEN_SOURCE_INVALID"));
  assert.ok(errors.includes("OUTCOME_BEFORE_OPENING_CROSS"));
  assert.ok(errors.includes("OPPOSITE_SIDE_FILL_INVALID"));
  assert.ok(validateMooDecisionOutcome({ ...base, artifactId: "other" }, value).errors.includes("OUTCOME_ARTIFACT_MISMATCH"));
  assert.ok(validateMooDecisionOutcome(base).errors.includes("OUTCOME_ARTIFACT_REQUIRED"));

  const forgedParent = { artifactId: value.artifactId, targetSession, state: "READY", decisionSnapshot: { decision: "LONG_FAVORED" } };
  const forgedBase = {
    schemaVersion: "moo-decision-outcome-v1", artifactId: value.artifactId, targetSession,
    actualOfficialOpenCents: null, officialOpenSource: null, longFillCents: 20_269, shortFillCents: null,
    capturedAt: regularOpenAt + 1,
  };
  const forged = { ...forgedBase, contentHash: computeMooDecisionOutcomeDigest(forgedBase) };
  assert.ok(validateMooDecisionOutcome(forged, forgedParent).errors.includes("OUTCOME_ARTIFACT_INVALID"));
});
