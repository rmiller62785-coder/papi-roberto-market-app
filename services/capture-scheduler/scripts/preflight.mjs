import fs from "node:fs";
import path from "node:path";

const configPath = path.resolve(process.argv[2] ?? "wrangler.production.jsonc");
const source = fs.readFileSync(configPath, "utf8");
const failures = [];

if (/replace|changeme|placeholder|example\.(?:com|test)/i.test(source)) failures.push("placeholder values are forbidden");
if (!/"name"\s*:\s*"aperture-nvda-capture-scheduler"/.test(source)) failures.push("production Worker name is missing");
if (!/"CAPTURE_SCHEDULER_URL"\s*:\s*"https:\/\/aperture-nvda-plan\.rmiller62785\.chatgpt\.site\/api\/internal\/scheduled-capture"/.test(source)) {
  failures.push("production Sites capture URL is not exact");
}
if (!/"CAPTURE_SCHEDULER_AUDIENCE"\s*:\s*"aperture-sites-capture-scheduler"/.test(source)) failures.push("scheduler audience is missing");
if (!/"crons"\s*:\s*\[\s*"\* \* \* \* \*"\s*\]/.test(source)) failures.push("one-minute cron is missing");
for (const secret of ["CAPTURE_SCHEDULER_SECRET", "SITES_ACCESS_BYPASS_TOKEN"]) {
  if (!new RegExp(`"required"[\\s\\S]*?"${secret}"`).test(source)) failures.push(`${secret} is not declared as required`);
  if (new RegExp(`"${secret}"\\s*:`).test(source)) failures.push(`${secret} must be installed with wrangler secret put, not committed`);
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`preflight: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("preflight: capture scheduler configuration is production-safe; verify two Cloudflare secrets before deploy\n");
}
