type ChartResult = {
  meta?: { currency?: string; exchangeTimezoneName?: string; regularMarketPrice?: number; regularMarketTime?: number; dataGranularity?: string };
  timestamp?: number[];
  indicators?: { quote?: Array<{ high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> };
};

const demoDaily = [
  { date: "Jul 01", high: 199.23, low: 193.72, close: 197.92 },
  { date: "Jul 02", high: 200.04, low: 192.41, close: 194.43 },
  { date: "Jul 06", high: 197.14, low: 192.65, close: 196.43 },
  { date: "Jul 07", high: 198.40, low: 191.14, close: 196.93 },
];

async function chart(symbol: string, interval: string, range: string, prepost = false): Promise<ChartResult> {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.searchParams.set("interval", interval);
  url.searchParams.set("range", range);
  url.searchParams.set("includePrePost", String(prepost));
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Aperture/1.0", Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Feed returned ${response.status}`);
  const json = await response.json() as { chart?: { result?: ChartResult[] } };
  const result = json.chart?.result?.[0];
  if (!result) throw new Error("No quote data");
  return result;
}

function easternParts(epoch: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(epoch * 1000));
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

export async function GET(request: Request) {
  const symbol = (new URL(request.url).searchParams.get("symbol") || "NVDA").toUpperCase().replace(/[^A-Z.-]/g, "");
  try {
    const [dailyChart, minuteChart] = await Promise.all([chart(symbol, "1d", "1mo"), chart(symbol, "1m", "1d", true)]);
    const dailyQuote = dailyChart.indicators?.quote?.[0];
    const daily = (dailyChart.timestamp ?? []).map((time, i) => ({
      date: new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "2-digit" }).format(new Date(time * 1000)),
      high: dailyQuote?.high?.[i], low: dailyQuote?.low?.[i], close: dailyQuote?.close?.[i],
    })).filter((bar): bar is { date: string; high: number; low: number; close: number } => [bar.high, bar.low, bar.close].every((v) => typeof v === "number"));
    const quote = minuteChart.indicators?.quote?.[0];
    const rows = (minuteChart.timestamp ?? []).map((time, i) => ({ time, parts: easternParts(time), high: quote?.high?.[i], low: quote?.low?.[i], close: quote?.close?.[i], volume: quote?.volume?.[i] ?? 0 })).filter((row) => typeof row.close === "number");
    const today = rows.at(-1)?.parts;
    const sameDay = (r: typeof rows[number]) => r.parts.year === today?.year && r.parts.month === today?.month && r.parts.day === today?.day;
    const pre = rows.filter((r) => sameDay(r) && Number(r.parts.hour) < 9 || sameDay(r) && Number(r.parts.hour) === 9 && Number(r.parts.minute) < 30);
    const first = rows.find((r) => sameDay(r) && Number(r.parts.hour) === 9 && Number(r.parts.minute) === 30);
    const last = rows.at(-1);
    return Response.json({
      symbol, asOf: new Date().toISOString(), currency: dailyChart.meta?.currency ?? "USD", exchangeTimezone: dailyChart.meta?.exchangeTimezoneName ?? "America/New_York",
      daily: daily.slice(-8),
      premarket: { high: pre.length ? Math.max(...pre.map((r) => r.high ?? r.close!)) : null, low: pre.length ? Math.min(...pre.map((r) => r.low ?? r.close!)) : null, price: pre.at(-1)?.close ?? last?.close ?? minuteChart.meta?.regularMarketPrice ?? null, volume: pre.reduce((sum, r) => sum + r.volume, 0), asOf: pre.at(-1) ? new Date(pre.at(-1)!.time * 1000).toISOString() : null },
      firstMinute: { close: first?.close ?? null, volume: first?.volume ?? 0, asOf: first ? new Date(first.time * 1000).toISOString() : null },
      source: "Public market feed · verify with broker",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ symbol, asOf: new Date().toISOString(), currency: "USD", exchangeTimezone: "America/New_York", daily: demoDaily, premarket: { high: 197.42, low: 195.88, price: 196.74, volume: 1843200, asOf: null }, firstMinute: { close: null, volume: 0, asOf: null }, source: "Sample data", demo: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
