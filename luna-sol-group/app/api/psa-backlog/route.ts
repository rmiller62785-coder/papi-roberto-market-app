const SOURCE_URL = "https://www.psacard.com/info/backlog-tracker";
const CORROBORATING_URL = "https://www.si.com/collectibles/psa-bi-weekly-update-shows-11-million-cards-still-backlogged";

const fallback = {
  value: 11,
  label: "11 million",
  observedAt: "July 14, 2026",
  source: SOURCE_URL,
  live: false,
  authority: "published-checkpoint",
};

function textFromHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}

export async function GET() {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; LunaSolGroup-EvidenceMonitor/1.0; +https://luna-sol-group.rmiller62785.chatgpt.site)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) throw new Error(`PSA tracker returned ${response.status}`);

    const text = textFromHtml(await response.text());
    const update = text.match(/([A-Z][a-z]+\s+\d{1,2},\s+2026)\s+Update[\s\S]{0,220}?backlog currently stands at\s+([\d.]+)\s+million/i);
    if (!update) throw new Error("No current backlog checkpoint found");

    const value = Number(update[2]);
    if (!Number.isFinite(value) || value < 1 || value > 100) throw new Error("Invalid backlog value");

    return Response.json({
      value,
      label: `${value} million`,
      observedAt: update[1],
      checkedAt: new Date().toISOString(),
      source: SOURCE_URL,
      live: true,
      authority: "official",
    }, {
      headers: { "cache-control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    try {
      const response = await fetch(CORROBORATING_URL, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; LunaSolGroup-EvidenceMonitor/1.0)" },
      });
      if (!response.ok) throw new Error(`Corroborating source returned ${response.status}`);
      const text = textFromHtml(await response.text());
      const valueMatch = text.match(/(?:total drop to|there are still|shows?)\s+(\d+(?:\.\d+)?)\s+million/i)
        ?? text.match(/(\d+(?:\.\d+)?)\s+million\s+(?:cards|items).*?backlog/i);
      const value = Number(valueMatch?.[1]);
      if (!Number.isFinite(value) || value < 1 || value > 100) throw new Error("No corroborated backlog value found");

      return Response.json({
        value,
        label: `${value} million`,
        observedAt: "July 14, 2026",
        checkedAt: new Date().toISOString(),
        source: CORROBORATING_URL,
        live: true,
        authority: "corroborated",
      }, {
        headers: { "cache-control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400" },
      });
    } catch {
      return Response.json({ ...fallback, checkedAt: new Date().toISOString() }, {
        headers: { "cache-control": "public, max-age=300, s-maxage=900" },
      });
    }
  }
}
