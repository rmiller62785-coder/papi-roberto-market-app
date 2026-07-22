const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let parsed;
try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
catch { throw new Error("wrangler secret list did not return JSON"); }
const names = new Set((Array.isArray(parsed) ? parsed : parsed?.secrets ?? []).map((value) => typeof value === "string" ? value : value?.name));
const missing = ["APCA_API_KEY_ID", "APCA_API_SECRET_KEY", "PAPER_COMMAND_SECRET"].filter((name) => !names.has(name));
if (missing.length) throw new Error(`missing Worker secrets: ${missing.join(", ")}`);
console.log("Paper broker secrets are present");
