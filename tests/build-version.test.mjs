import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the client detects a newly published build and reloads automatically", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/version/route.ts", import.meta.url), "utf8");
  assert.match(page, /fetch\(`\/api\/version\?t=\$\{Date\.now\(\)\}`/);
  assert.match(page, /payload\.version !== BUILD_VERSION\) window\.location\.reload\(\)/);
  assert.match(route, /no-store, no-cache, must-revalidate/);
});
