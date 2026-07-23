const SOURCE_URL = "https://www.psacard.com/info/backlog-tracker";

const fallback = {
  value: 11,
  label: "11 million",
  observedAt: "July 14, 2026",
  source: SOURCE_URL,
  live: false,
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
      headers: { "user-agent": "LunaSolGroup-EvidenceMonitor/1.0" },
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
    }, {
      headers: { "cache-control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return Response.json({ ...fallback, checkedAt: new Date().toISOString() }, {
      headers: { "cache-control": "public, max-age=300, s-maxage=900" },
    });
  }
}
