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
  assert.match(page, /Expected open range/);
  assert.match(page, /SessionChart/);
  assert.match(page, /research-alert/);
  assert.match(page, /Last checked/);
  assert.match(page, /Finnhub quote time/);
  assert.match(page, /setLastRefreshAt\(Date\.now\(\)\)/);
  assert.match(page, /Event Repository/);
  assert.match(page, /Weight Open Market/);
  assert.match(page, /language-toggle/);
  assert.match(styles, /\.research-alert/);
  assert.match(styles, /\.live-candle-card/);
  assert.doesNotMatch(page, /SkeletonPreview/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
});

test("pairs free event, calendar, filing, and cross-market sources", async () => {
  const forecast = await readFile(new URL("app/api/forecast/route.ts", root), "utf8");

  assert.match(forecast, /Finnhub news/);
  assert.match(forecast, /GDELT global news/);
  assert.match(forecast, /SEC EDGAR/);
  assert.match(forecast, /BLS calendar/);
  assert.match(forecast, /QQQ \+ SOXX/);
  assert.match(forecast, /clusterEvents/);
  assert.match(forecast, /buildFlag/);
  assert.match(forecast, /DIRECTION UNCONFIRMED/);
});
