import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the NVDA decision dashboard instead of the starter preview", async () => {
  const [page, layout, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(page, /Nvidia/);
  assert.match(page, /Transparent forecast bridge/);
  assert.match(page, /SessionChart/);
  assert.match(page, /research-alert/);
  assert.match(page, /Finnhub quote updated/);
  assert.match(page, /checkedAt:string/);
  assert.match(page, /setLastRefreshAt\(/);
  assert.match(page, /function ApiStamp/);
  assert.match(page, /Market API pulled/);
  assert.match(page, /Weighted APIs pulled/);
  assert.match(page, /f\.lastChecked/);
  assert.match(page, /Event Repository/);
  assert.match(page, /Weight Open Market/);
  assert.match(page, /Source \/ Knowledge/);
  assert.match(page, /type ContributionSource=/);
  assert.match(page, /source\.knowledgeBase\.path/);
  assert.match(page, /source\.apiBacked/);
  assert.match(page, /API checked/);
  assert.match(page, /No external API required/);
  assert.match(page, /firstMinute:\{close:number\|null;high:number\|null;low:number\|null;volume:number;complete:boolean;observedAt\?:string\|null\}/);
  assert.match(page, /firstMinuteComplete:manualMode\?false:data\.firstMinute\.complete/);
  assert.match(page, /FORMING_931/);
  assert.match(page, /FORMING BAR — WAIT FOR 9:31 CLOSE/);
  assert.match(page, /INSUFFICIENT_TARGET_SESSION/);
  assert.match(page, /targetSessionEvidence/);
  assert.match(page, /Two linked views, one safety gate/);
  assert.match(page, /Base-band method and limitation/);
  assert.match(page, /appliedRangePct/);
  assert.match(page, /MANUAL SCENARIO — NOT A LIVE ORDER/);
  assert.match(page, /STALE DATA — WAIT FOR RECOVERY/);
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
  assert.doesNotMatch(page, /SkeletonPreview/);
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
  assert.match(forecast, /earlyCloseDate/);
  assert.match(forecast, /safetyCapApplied/);
  assert.match(forecast, /Opening forecasts freeze at 09:30 ET/);
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
  assert.match(library, /Freeze the original forecast\/plan/);
  assert.match(library, /export async function PATCH/);
  assert.match(library, /libraryWriteError/);
});
