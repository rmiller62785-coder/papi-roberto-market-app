import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the NVDA decision dashboard instead of the starter preview", async () => {
  const [page, layout, styles, mooSurface, strictJourney] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/components/MooDecisionSurface.tsx", root), "utf8"),
    readFile(new URL("app/components/StrictMooJourney.tsx", root), "utf8"),
  ]);

  assert.match(page, /Aperture/);
  assert.match(page, /NVDA MARKET INTELLIGENCE/);
  assert.doesNotMatch(`${page}\n${layout}`, /Papi[\s._-]*Roberto/i);
  assert.match(page, /Transparent forecast bridge/);
  assert.match(page, /SessionChart/);
  assert.match(page, /research-alert/);
  assert.match(page, /ALPACA IEX/);
  assert.match(page, /Provider observation/);
  assert.match(page, /checkedAt:\s*string/);
  assert.match(page, /setLastRefreshAt\(/);
  assert.match(page, /function ApiStamp/);
  assert.match(page, /Market API pulled/);
  assert.match(page, /Weighted APIs pulled/);
  assert.match(page, /f\.lastChecked/);
  assert.match(page, /Evidence/);
  assert.match(page, /Model Lab/);
  assert.match(page, /Strict MOO Gate/);
  assert.match(page, /RecentSessionsTable/);
  assert.match(page, /Past opens, highs, lows and closes/);
  assert.match(page, /History API pulled/);
  assert.match(page, /Full Dashboard/);
  assert.match(page, /setWorkflow\("confirmation"\)/);
  assert.match(page, /useState<(?:Workflow|"moo"\s*\|\s*"confirmation")>\("confirmation"\)/);
  assert.match(page, /Sessions/);
  assert.match(page, /Evidence/);
  assert.match(page, /Model Lab/);
  assert.match(page, /API & Strict MOO Health/);
  assert.match(mooSurface, /Strict MOO execution entitlements/);
  assert.match(page, /researchForecast/);
  assert.match(page, /NON-ACTIONABLE RESEARCH/);
  assert.match(page, /Decision trade date/);
  assert.match(page, /strictForecastPollRef\.current\.controller/);
  assert.match(page, /enumerateNearbyTargetSessions/);
  assert.match(page, /Research directional lean/);
  assert.match(page, /LONG LEAN/);
  assert.match(page, /SHORT LEAN/);
  assert.match(page, /NO EDGE/);
  assert.match(page, /central-estimate/);
  assert.match(page, /German NVD · Tradegate BSX \(XGAT\)/);
  assert.match(page, /Polymarket currently widens event uncertainty only/);
  assert.match(mooSurface, /PLANNING \/ RESEARCH SOURCES/);
  assert.match(mooSurface, /API REQUIRED/);
  assert.match(page, /openingPlan\?\.plan\.status\s*===\s*"CONFIRMED"/);
  assert.match(page, /aggregateForecastContributions/);
  assert.match(page, /DRAFT PREVIEW · NOT SAVED/);
  assert.match(page, /displaySession/);
  assert.match(page, /Latest 120 available bars/);
  assert.match(page, /Latest minute bar observed/);
  assert.match(page, /Market API checked/);
  assert.match(page, /marketPollRef\.current\.controller/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /aria-selected=/);
  assert.match(page, /workflow\s*===\s*"moo"\s*\?\s*<>\s*<section className="moo-session-picker[\s\S]*?<MooDecisionSurface/);
  assert.match(page, /mooSystemStatus\.decisionSnapshot/);
  assert.doesNotMatch(page, /buildMooDecisionSnapshot/);
  assert.match(strictJourney, /Predicted official open/);
  assert.match(strictJourney, /NO TRADE/);
  assert.match(mooSurface, /StrictMooJourney/);
  assert.match(mooSurface, /DETAILED STRICT AUDIT/);
  assert.match(mooSurface, /Source entitlements and strict ticket fields/);
  assert.match(strictJourney, /Source health/);
  assert.match(strictJourney, /Model readiness/);
  assert.match(strictJourney, /Fill \/ audit/);
  assert.match(strictJourney, /Modify \/ cancel cutoff/);
  assert.doesNotMatch(strictJourney, /Decision freeze · 09:24:30 ET/);
  assert.match(strictJourney, /PERMANENT UPSTREAM/);
  assert.match(strictJourney, /STRICT QUOTE/);
  assert.match(strictJourney, /BROWSER DELIVERY/);
  assert.match(strictJourney, /ARTIFACT STORAGE UNAVAILABLE/);
  assert.match(strictJourney, /PAPER REVIEW ONLY · NO ORDER/);
  assert.match(strictJourney, /Execution is not commissioned, so no order can be submitted/);
  assert.match(strictJourney, /WHY STRICT FIELDS ARE EMPTY/);
  assert.match(strictJourney, /Any retained quote is audit-only/);
  assert.match(strictJourney, /POR QUÉ LOS CAMPOS ESTRICTOS ESTÁN VACÍOS/);
  assert.match(strictJourney, /commissioning\?\.blockers \?\? \[\]/);
  assert.match(page, /isNasdaqSessionDate\(strictTargetSession\)[\s\S]*?previousNasdaqSession\(strictTargetSession/);
  assert.match(strictJourney, /The entitled SIP source has not produced a current observation/);
  assert.doesNotMatch(strictJourney, /execution entitlement and freshness checks/);
  assert.match(strictJourney, /Research estimates cannot fill these strict fields/);
  assert.match(strictJourney, /Browser-local paper planner values never become a strict ticket/);
  assert.match(strictJourney, /This surface cannot submit an order or claim a fill/);
  assert.equal([...strictJourney.matchAll(/aria-live=/g)].length, 1);
  assert.match(mooSurface, /Long opening ticket/);
  assert.match(mooSurface, /Short opening ticket/);
  assert.match(mooSurface, /Maximum loss/);
  assert.match(mooSurface, /Shortability/);
  assert.match(page, /Tradegate BSX \(XGAT\)/);
  assert.match(mooSurface, /Not configured/);
  assert.match(styles, /\.moo-decision-surface/);
  assert.match(styles, /\.strict-stage-list/);
  assert.match(styles, /\.strict-connection-lanes/);
  assert.match(styles, /\.strict-command\.state-closed/);
  assert.match(styles, /\.strict-store-alert/);
  assert.match(styles, /@media\(max-width:390px\)/);
  assert.doesNotMatch(mooSurface, />\$0\.00</);
  assert.match(page, /Source \/ Knowledge/);
  assert.match(page, /type\s+ContributionSource\s*=/);
  assert.match(page, /source\.knowledgeBase\.path/);
  assert.match(page, /source\.apiBacked/);
  assert.match(page, /API checked/);
  assert.match(page, /No external API required/);
  assert.match(page, /firstMinute:\s*\{[^}]*complete:\s*boolean;[^}]*observedAt\?:\s*string\s*\|\s*null/);
  assert.match(page, /firstMinuteComplete:\s*manualMode\s*\?\s*false\s*:\s*data\.firstMinute\.complete/);
  assert.match(page, /FORMING_931/);
  assert.match(page, /FORMING BAR/);
  assert.match(page, /INSUFFICIENT_TARGET_SESSION/);
  assert.match(page, /targetSessionEvidence/);
  assert.match(page, /Two linked views, one safety gate/);
  assert.match(page, /Base-band method and limitation/);
  assert.match(page, /appliedRangePct/);
  assert.match(page, /MANUAL SCENARIO — NOT LIVE/);
  assert.match(page, /STALE — DO NOT ACT/);
  assert.match(page, /Capture mode: unattended server schedule/);
  assert.match(page, /forecast\?\.automation\?\.lastSuccessAt/);
  assert.doesNotMatch(page, /outcomeRef|snapshotRef|savedPlanRef/);
  assert.match(page, /COMPLETED BAR/);
  assert.match(page, /language-toggle/);
  assert.match(styles, /\.research-alert/);
  assert.match(styles, /\.live-candle-card/);
  assert.match(styles, /\.source-badge\.api/);
  assert.match(styles, /\.source-cell/);
  assert.match(styles, /\.estimate-state\.forming/);
  assert.match(styles, /\.central-estimate/);
  assert.match(styles, /\.moo-session-picker/);
  assert.match(page, /isUnavailableDecisionFreezeResponse/);
  assert.match(page, /No point-in-time freeze archive exists for this session/);
  assert.match(styles, /\.external-effect-grid/);
  assert.doesNotMatch(page, /SkeletonPreview/);
  assert.doesNotMatch(page, /APCA_API_SECRET_KEY/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
});

test("pairs free event, calendar, filing, and cross-market sources", async () => {
  const [forecast, market, library] = await Promise.all([
    readFile(new URL("app/api/forecast/route.ts", root), "utf8"),
    readFile(new URL("app/api/market/route.ts", root), "utf8"),
    readFile(new URL("app/api/library/route.ts", root), "utf8"),
  ]);

  assert.match(forecast, /Finnhub news/);
  assert.match(forecast, /GDELT global news/);
  assert.match(forecast, /SEC EDGAR/);
  assert.match(forecast, /BLS calendar/);
  assert.match(forecast, /QQQ \+ SOXX/);
  assert.match(forecast, /Polymarket Gamma \+ CLOB/);
  assert.match(forecast, /NQ \+ ES overnight futures/);
  assert.match(forecast, /aggregateForecastContributions/);
  assert.match(forecast, /DEGRADED_RANGE_ONLY/);
  assert.match(forecast, /clusterEvents/);
  assert.match(forecast, /buildFlag/);
  assert.match(forecast, /DIRECTION UNCONFIRMED/);
  assert.match(forecast, /factorSourceDefinitions/);
  assert.match(forecast, /apiBacked/);
  assert.match(forecast, /knowledgeBase/);
  assert.match(forecast, /feedIds/);
  assert.match(forecast, /factorSource\(weight\.key/);
  assert.match(forecast, /oai-authenticated-user-email/);
  assert.match(forecast, /WEIGHTS_ADMIN_EMAILS/);
  assert.match(forecast, /researchWriteError/);
  assert.match(forecast, /ON CONFLICT\(target_date,interval_label\) DO NOTHING/);
  assert.match(forecast, /COALESCE\(actual_open/);
  assert.match(forecast, /Math\.min\(\.\.\.checks\)/);
  assert.match(forecast, /newYorkWallTime/);
  assert.match(forecast, /nasdaqSessionSchedule/);
  assert.match(forecast, /safetyCapApplied/);
  assert.match(forecast, /Actionable MOO forecasts freeze at 09:24:30 ET/);
  assert.match(forecast, /forecast_preopen_freezes/);
  assert.match(forecast, /PREOPEN_FROZEN_RESEARCH/);
  assert.match(forecast, /No pre-open feature snapshot exists/);
  assert.match(forecast, /automation_capture_health/);
  assert.match(forecast, /lastPreopenAt/);
  assert.match(market, /analysisBars/);
  assert.match(market, /targetSession/);
  assert.match(market, /regularCloseMinute/);
  assert.match(market, /historyWindowStartObservedAt/);
  assert.match(market, /quoteObservedAtMs != null \? "ok" : "stale"/);
  assert.match(market, /data\.alpaca\.markets\/v2\/stocks\/NVDA\/snapshot\?feed=iex/);
  assert.match(market, /APCA-API-KEY-ID/);
  assert.match(market, /APCA-API-SECRET-KEY/);
  assert.match(market, /preferred_reference_quote/);
  assert.match(market, /alpaca_sip_history/);
  assert.match(market, /completed_daily_history/);
  assert.match(market, /url\.searchParams\.set\("feed", "sip"\)/);
  assert.match(market, /previousCloseExpectedSession/);
  assert.match(market, /previousCloseStatus/);
  assert.match(market, /usedInForecast: Boolean\(verifiedPreviousClose\)/);
  assert.match(market, /Never substitute an older or undated/);
  assert.doesNotMatch(
    market.slice(market.indexOf("const previousClose ="), market.indexOf("const price =")),
    /daily\.at\(-1\)|liveQuote\?\.pc|chartPreviousClose/,
    "forecast-critical previousClose must only use date-verified evidence",
  );
  assert.match(library, /Freeze the original forecast\/plan/);
  assert.match(library, /export async function PATCH/);
  assert.match(library, /libraryWriteError/);
});
