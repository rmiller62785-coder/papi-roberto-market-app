import { env } from "cloudflare:workers";
import { GET as forecastGet } from "../../forecast/route.ts";
import { GET as marketGet } from "../../market/route.ts";
import { handleScheduledCapturePost, type CaptureRouteEnv } from "./handler.ts";

async function fetchApp(path: string) {
  const request = new Request(new URL(path, "https://nvda-scheduler.internal"));
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/market") return marketGet(request);
  if (pathname === "/api/forecast") return forecastGet(request);
  return Response.json({ error: "INTERNAL_ROUTE_NOT_ALLOWED" }, { status: 404 });
}

export async function POST(request: Request) {
  return handleScheduledCapturePost(request, env as unknown as CaptureRouteEnv, { fetchApp });
}
