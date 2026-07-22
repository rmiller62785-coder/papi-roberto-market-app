import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_SECRET_NAMES = Object.freeze([
  "APCA_API_KEY_ID",
  "APCA_API_SECRET_KEY",
  "SITES_INGESTION_URL",
  "SITES_INGESTION_SECRET",
  "SITES_ACCESS_BYPASS_TOKEN",
  "STREAM_CONTROL_SECRET",
  "BROWSER_ACCESS_SECRET",
]);

export function missingRequiredSecretNames(secretList) {
  if (!Array.isArray(secretList)) throw new Error("secret list must be a JSON array");
  const installed = new Set(secretList.map((entry) => entry?.name).filter((name) => typeof name === "string"));
  return REQUIRED_SECRET_NAMES.filter((name) => !installed.has(name));
}

function run() {
  try {
    const source = fs.readFileSync(0, "utf8");
    const missing = missingRequiredSecretNames(JSON.parse(source));
    if (missing.length) throw new Error(`missing required Worker secrets: ${missing.join(", ")}`);
    process.stdout.write("preflight: all seven required Cloudflare secret names are installed\n");
  } catch (error) {
    process.stderr.write(`preflight: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) run();
