import { BUILD_VERSION } from "../../build-version";

export const GET = async () => Response.json(
  { version: BUILD_VERSION },
  { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
);
