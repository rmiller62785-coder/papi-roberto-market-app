"use client";

import { useEffect, useState } from "react";

type BacklogState = {
  value: number;
  label: string;
  observedAt: string;
  checkedAt?: string;
  source: string;
  live: boolean;
};

const fallback: BacklogState = {
  value: 11,
  label: "11 million",
  observedAt: "July 14, 2026",
  source: "https://www.psacard.com/info/backlog-tracker",
  live: false,
};

export function LiveBacklog({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<BacklogState>(fallback);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/psa-backlog")
      .then((response) => response.json())
      .then((next) => {
        if (active && typeof next?.value === "number") setData(next);
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  if (compact) {
    return (
      <div className="live-backlog compact" aria-live="polite">
        <span><i className={data.live ? "live-dot" : "static-dot"} /> {loading ? "Checking official tracker" : data.live ? "Official tracker checked" : "Last official checkpoint"}</span>
        <strong>{data.label}</strong>
        <small>Published {data.observedAt}</small>
      </div>
    );
  }

  return (
    <aside className="live-backlog" aria-live="polite">
      <div className="live-heading">
        <span><i className={data.live ? "live-dot" : "static-dot"} /> PSA official backlog</span>
        <small>{loading ? "Checking source…" : data.live ? "Source check complete" : "Published checkpoint"}</small>
      </div>
      <div className="live-value">{data.value}<em>m</em></div>
      <p>active units reported · {data.observedAt}</p>
      <a href={data.source} target="_blank" rel="noreferrer">Open the management-reviewed tracker <span aria-hidden="true">↗</span></a>
    </aside>
  );
}
