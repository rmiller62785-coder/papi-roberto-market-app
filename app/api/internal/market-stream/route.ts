import { env } from "cloudflare:workers";
import { handleMarketStreamPost, type IngestionEnv } from "./handler.ts";

export async function POST(request: Request) {
  return handleMarketStreamPost(request, env as unknown as IngestionEnv);
}
