import fs from "node:fs";
import path from "node:path";

const configPath = path.resolve(process.argv[2] ?? "wrangler.production.jsonc");
const source = fs.readFileSync(configPath, "utf8");
const failures = [];

if (/replace|changeme|placeholder|example\.(?:com|test)/i.test(source)) failures.push("placeholder values are forbidden");
if (!/"name"\s*:\s*"aperture-nvda-market-stream"/.test(source)) failures.push("production Worker name is missing");
if (!/"new_sqlite_classes"\s*:\s*\[\s*"NvdaMarketStream"\s*\]/.test(source)) failures.push("SQLite Durable Object migration is missing");
if (!/"SITES_INGESTION_AUDIENCE"\s*:\s*"[^"]+"/.test(source)) failures.push("ingestion audience is missing");
if (!/"BROWSER_ALLOWED_ORIGINS"\s*:\s*"https:\/\/[^"]+"/.test(source)) failures.push("production browser origin is missing");
const feed = /"ALPACA_FEED"\s*:\s*"([^"]+)"/.exec(source)?.[1];
if (feed !== "iex" && feed !== "sip") failures.push("ALPACA_FEED must be exactly iex or sip");
if (feed === "sip" && !/"SIP_ENTITLED"\s*:\s*"true"/.test(source)) failures.push("SIP requires explicit SIP_ENTITLED=true");
for (const secret of ["APCA_API_KEY_ID", "APCA_API_SECRET_KEY", "SITES_INGESTION_URL", "SITES_INGESTION_SECRET", "STREAM_CONTROL_SECRET", "BROWSER_ACCESS_SECRET"]) {
  if (new RegExp(`"${secret}"\\s*:`).test(source)) failures.push(`${secret} must be installed with wrangler secret put, not committed`);
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`preflight: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("preflight: configuration structure is production-safe; verify six Cloudflare secrets are installed before deploy\n");
}
