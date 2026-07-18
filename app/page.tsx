"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DailyBar = { date: string; high: number; low: number; close: number };
type MarketPayload = {
  symbol: string;
  asOf: string;
  currency: string;
  exchangeTimezone: string;
  delayedBy?: number;
  daily: DailyBar[];
  premarket: { high: number | null; low: number | null; price: number | null; volume: number; asOf: string | null };
  firstMinute: { close: number | null; volume: number; asOf: string | null };
  source: string;
  demo?: boolean;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function fmt(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : usd.format(value);
}

export default function Home() {
  const [data, setData] = useState<MarketPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(4);
  const [account, setAccount] = useState(25000);
  const [riskPct, setRiskPct] = useState(0.5);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/market?symbol=NVDA", { cache: "no-store" });
      if (!response.ok) throw new Error("Market feed is temporarily unavailable.");
      setData(await response.json());
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh market data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("nvda-plan-settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAccount(Number(parsed.account) || 25000);
        setRiskPct(Number(parsed.riskPct) || 0.5);
        setDays(parsed.days === 3 ? 3 : 4);
      } catch { /* use defaults */ }
    }
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem("nvda-plan-settings", JSON.stringify({ account, riskPct, days }));
  }, [account, riskPct, days]);

  const plan = useMemo(() => {
    if (!data?.daily.length) return null;
    const bars = data.daily.slice(-days);
    const high = Math.max(...bars.map((bar) => bar.high));
    const low = Math.min(...bars.map((bar) => bar.low));
    const close = bars[bars.length - 1].close;
    const blockPivot = (high + low + close) / 3;
    const weights = bars.map((_, index) => index + 1);
    const weightTotal = weights.reduce((a, b) => a + b, 0);
    const weightedPivot = bars.reduce((sum, bar, index) => sum + ((bar.high + bar.low + bar.close) / 3) * weights[index], 0) / weightTotal;
    const lowerThird = low + (high - low) / 3;
    const upperThird = low + ((high - low) * 2) / 3;
    const pivotLow = Math.min(blockPivot, weightedPivot);
    const pivotHigh = Math.max(blockPivot, weightedPivot);
    const observed = data.firstMinute.close ?? data.premarket.price;
    let signal: "LONG" | "WAIT" | "DEFENSIVE" | "PENDING" = "PENDING";
    if (observed != null) {
      signal = observed > upperThird ? "LONG" : observed < lowerThird ? "DEFENSIVE" : "WAIT";
    }
    const entry = signal === "LONG" ? Math.max(upperThird, observed ?? upperThird) : upperThird;
    const stop = upperThird - Math.max(0.25, (high - low) * 0.03);
    const riskDollars = account * (riskPct / 100);
    const shares = Math.max(0, Math.floor(Math.min(account / entry, riskDollars / Math.max(entry - stop, 0.01))));
    return { bars, high, low, close, blockPivot, weightedPivot, lowerThird, upperThird, pivotLow, pivotHigh, signal, observed, entry, stop, shares, riskDollars };
  }, [data, days, account, riskPct]);

  const signalCopy = plan?.signal === "LONG"
    ? { eyebrow: "Bullish confirmation", title: "Upper third reclaimed", body: `Price is above ${fmt(plan.upperThird)}. Look for a hold or clean retest before entering; do not chase an opening spike.` }
    : plan?.signal === "DEFENSIVE"
      ? { eyebrow: "Capital protection", title: "Lower third lost", body: `Price is below ${fmt(plan.lowerThird)}. For a cash-only long plan, stand aside rather than forcing a trade.` }
      : plan?.signal === "WAIT"
        ? { eyebrow: "No-trade zone", title: "Patience is the position", body: `Price is inside the middle third. Watch ${fmt(plan.pivotLow)}–${fmt(plan.pivotHigh)} for a reaction and wait for direction.` }
        : { eyebrow: "Before the bell", title: "Waiting for 9:31 AM", body: "Premarket builds the context. The first completed regular-session minute confirms the signal." };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Aperture home"><span className="brandMark">A</span><span>APERTURE</span></a>
        <div className="marketState"><span className="pulse" /> NVDA MORNING PLAN</div>
        <button className="refresh" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh data"}</button>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="kicker">Automated opening analysis · Cash shares only</p>
          <h1>Know your level.<br /><em>Then wait.</em></h1>
          <p className="lede">A disciplined NVDA plan built from recent official-session structure, premarket pressure, and the first completed minute after the open.</p>
        </div>
        <div className={`signalCard ${plan?.signal?.toLowerCase() ?? "pending"}`}>
          <div className="signalTop"><span>{signalCopy.eyebrow}</span><span>{plan?.signal ?? "PENDING"}</span></div>
          <h2>{signalCopy.title}</h2>
          <p>{signalCopy.body}</p>
          <div className="observed"><span>Observed price</span><strong>{fmt(plan?.observed)}</strong></div>
        </div>
      </section>

      {error && <div className="alert">{error} <button onClick={refresh}>Try again</button></div>}
      {data?.demo && <div className="demo">Live feed unavailable — showing clearly labeled sample data so the planner remains usable.</div>}

      <section className="levels" aria-label="Key trading levels">
        <article><span>Structural high</span><strong>{fmt(plan?.high)}</strong><small>Profit reference</small></article>
        <article className="accent"><span>Upper third</span><strong>{fmt(plan?.upperThird)}</strong><small>Long trigger</small></article>
        <article><span>Pivot cluster</span><strong>{fmt(plan?.pivotLow)}–{fmt(plan?.pivotHigh)}</strong><small>Decision zone</small></article>
        <article className="red"><span>Lower third</span><strong>{fmt(plan?.lowerThird)}</strong><small>Stand-aside line</small></article>
        <article><span>Structural low</span><strong>{fmt(plan?.low)}</strong><small>Range floor</small></article>
      </section>

      <section className="grid">
        <div className="panel mapPanel">
          <div className="panelHead"><div><p className="sectionNo">01 / RANGE MAP</p><h3>The market in thirds</h3></div><div className="segmented" aria-label="Lookback days"><button className={days === 3 ? "active" : ""} onClick={() => setDays(3)}>3 days</button><button className={days === 4 ? "active" : ""} onClick={() => setDays(4)}>4 days</button></div></div>
          <div className="rangeMap">
            <div className="zone upper"><span>UPPER THIRD · BUYER CONTROL</span><b>{fmt(plan?.high)}</b><b>{fmt(plan?.upperThird)}</b></div>
            <div className="zone middle"><span>MIDDLE THIRD · ROTATION</span><b>{fmt(plan?.upperThird)}</b><div className="pivotLine">PIVOT {fmt(plan?.pivotLow)}–{fmt(plan?.pivotHigh)}</div><b>{fmt(plan?.lowerThird)}</b></div>
            <div className="zone lower"><span>LOWER THIRD · STRUCTURAL WEAKNESS</span><b>{fmt(plan?.lowerThird)}</b><b>{fmt(plan?.low)}</b></div>
          </div>
        </div>

        <aside className="panel tape">
          <p className="sectionNo">02 / LIVE CONTEXT</p><h3>Premarket tape</h3>
          <dl>
            <div><dt>Premarket high</dt><dd>{fmt(data?.premarket.high)}</dd></div>
            <div><dt>Current / last</dt><dd>{fmt(data?.premarket.price)}</dd></div>
            <div><dt>Premarket low</dt><dd>{fmt(data?.premarket.low)}</dd></div>
            <div><dt>Premarket volume</dt><dd>{data ? num.format(data.premarket.volume) : "—"}</dd></div>
            <div className="firstMinute"><dt>9:30–9:31 close</dt><dd>{fmt(data?.firstMinute.close)}</dd></div>
          </dl>
          <p className="source">Source: {data?.source ?? "Connecting…"}<br />{data?.asOf ? `Updated ${new Date(data.asOf).toLocaleString()}` : ""}</p>
        </aside>
      </section>

      <section className="grid lowerGrid">
        <div className="panel">
          <p className="sectionNo">03 / POSITION SIZER</p><h3>Risk before reward</h3>
          <div className="inputs"><label>Cash available<input type="number" min="0" value={account} onChange={(e) => setAccount(Number(e.target.value))} /></label><label>Max risk<input type="number" min="0.1" max="5" step="0.1" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} /><span>%</span></label></div>
          <div className="sizing"><div><span>Maximum shares</span><strong>{plan?.shares ?? 0}</strong></div><div><span>Planned entry</span><strong>{fmt(plan?.entry)}</strong></div><div><span>Protective stop</span><strong>{fmt(plan?.stop)}</strong></div><div><span>Max planned loss</span><strong>{fmt(plan?.riskDollars)}</strong></div></div>
          <p className="fineprint">Sizing uses the smaller of cash capacity and risk capacity. Slippage can increase realized loss.</p>
        </div>
        <div className="panel checklist">
          <p className="sectionNo">04 / EXECUTION CHECKLIST</p><h3>Permission to trade</h3>
          <ol><li><span>1</span><div><b>Before 9:30</b><p>Map the thirds and premarket location. No order yet.</p></div></li><li><span>2</span><div><b>At 9:31</b><p>Wait for the first one-minute candle to complete.</p></div></li><li><span>3</span><div><b>Confirm, don’t predict</b><p>Only consider a long above the upper-third line with a hold or retest.</p></div></li><li><span>4</span><div><b>Honor the stop</b><p>Size first. If the setup fails, exit without negotiation.</p></div></li></ol>
        </div>
      </section>

      <section className="history panel">
        <div><p className="sectionNo">INPUT DATA</p><h3>{days}-session calculation</h3></div>
        <div className="tableWrap"><table><thead><tr><th>Session</th><th>High</th><th>Low</th><th>Close</th><th>Daily pivot</th></tr></thead><tbody>{plan?.bars.map((bar) => <tr key={bar.date}><td>{bar.date}</td><td>{fmt(bar.high)}</td><td>{fmt(bar.low)}</td><td>{fmt(bar.close)}</td><td>{fmt((bar.high + bar.low + bar.close) / 3)}</td></tr>)}</tbody></table></div>
      </section>

      <footer><div><b>APERTURE</b><span>Opening discipline for active investors.</span></div><p>Educational planning tool only. Not investment advice. Quotes may be delayed or incomplete; verify all prices with your broker before trading.</p><span>{lastRefresh ? `Auto-refreshing every minute · Last checked ${lastRefresh.toLocaleTimeString()}` : "Connecting…"}</span></footer>
    </main>
  );
}
