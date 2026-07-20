import { pullAlpacaBrokerStatus } from "../../../alpaca-broker-status.ts";

export async function GET() {
  const status = await pullAlpacaBrokerStatus();
  return Response.json(status, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
