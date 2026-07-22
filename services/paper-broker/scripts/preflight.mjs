import { readFile } from "node:fs/promises";

const configPath = process.argv[2];
if (!configPath) throw new Error("usage: node scripts/preflight.mjs <wrangler-config>");
const config = await readFile(new URL(`../${configPath}`, import.meta.url), "utf8");
const source = await Promise.all([
  "auth.ts", "contracts.ts", "alpaca-paper.ts", "storage.ts", "index.ts",
].map((file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8"))).then((values) => values.join("\n"));
const failures = [];
if (!/"name"\s*:\s*"aperture-nvda-paper-broker"/.test(config)) failures.push("production worker name is not pinned");
if (!/"PAPER_ORDER_SUBMISSION_ENABLED"\s*:\s*"(?:true|false)"/.test(config)) failures.push("submission flag must be explicit");
if (!/"PAPER_SHORTS_ENABLED"\s*:\s*"(?:true|false)"/.test(config)) failures.push("shorts flag must be explicit");
if (!/"PAPER_MAX_SHARES"\s*:\s*"\d+"/.test(config)) failures.push("maximum shares must be explicit");
for (const secret of ["APCA_API_KEY_ID", "APCA_API_SECRET_KEY", "PAPER_COMMAND_SECRET"]) {
  if (!config.includes(`"${secret}"`)) failures.push(`missing required secret ${secret}`);
}
if (!source.includes('https://paper-api.alpaca.markets')) failures.push("Alpaca paper origin is not pinned");
if (source.includes('https://api.alpaca.markets')) failures.push("live Alpaca trading origin is forbidden");
if (/triggers["']?\s*:|scheduled\s*\(/.test(config + source)) failures.push("automatic scheduling is forbidden");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Paper broker preflight passed");
}
