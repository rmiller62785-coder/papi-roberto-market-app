import { env } from "cloudflare:workers";
import { readSchedulerHealth } from "../../../scheduler-health.ts";

const HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    if (!env.DB) throw new Error("D1 binding unavailable");
    // Deliberately read-only. Schema convergence belongs to migrations and
    // internal write paths, never a public browser GET.
    return Response.json(
      await readSchedulerHealth(env.DB),
      { headers: HEADERS },
    );
  } catch (error) {
    console.error("scheduler health GET failed", error instanceof Error ? error.message : error);
    return Response.json(
      { error: "SCHEDULER_HEALTH_UNAVAILABLE" },
      { status: 503, headers: HEADERS },
    );
  }
}
