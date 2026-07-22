import {
  CAPTURE_TRIGGER_BODY,
  signCaptureSchedulerRequest,
} from "./auth.ts";

export type CaptureSchedulerEnv = {
  CAPTURE_SCHEDULER_URL: string;
  CAPTURE_SCHEDULER_SECRET: string;
  CAPTURE_SCHEDULER_AUDIENCE: string;
  SITES_ACCESS_BYPASS_TOKEN: string;
};

type ScheduledControllerLike = { scheduledTime: number };
type ExecutionContextLike = { waitUntil(promise: Promise<unknown>): void };

const encoder = new TextEncoder();

function configuredTarget(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("CAPTURE_SCHEDULER_URL_INVALID"); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || (local && !["http:", "https:"].includes(url.protocol)) ||
      url.pathname !== "/api/internal/scheduled-capture" || url.search || url.hash) {
    throw new Error("CAPTURE_SCHEDULER_URL_INVALID");
  }
  return url.toString();
}

export function validateCaptureSchedulerEnv(env: CaptureSchedulerEnv) {
  const url = configuredTarget(env.CAPTURE_SCHEDULER_URL);
  if (encoder.encode(env.CAPTURE_SCHEDULER_SECRET ?? "").byteLength < 32) throw new Error("CAPTURE_SCHEDULER_SECRET_TOO_SHORT");
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(env.CAPTURE_SCHEDULER_AUDIENCE ?? "")) throw new Error("CAPTURE_SCHEDULER_AUDIENCE_INVALID");
  if (typeof env.SITES_ACCESS_BYPASS_TOKEN !== "string" || env.SITES_ACCESS_BYPASS_TOKEN.length < 16) {
    throw new Error("SITES_ACCESS_BYPASS_TOKEN_INVALID");
  }
  return { url, audience: env.CAPTURE_SCHEDULER_AUDIENCE };
}

export async function sendCaptureTrigger(
  env: CaptureSchedulerEnv,
  input: { now?: number; fetcher?: typeof fetch; nonce?: string } = {},
) {
  const { url, audience } = validateCaptureSchedulerEnv(env);
  const now = input.now ?? Date.now();
  const nonce = input.nonce ?? crypto.randomUUID().replaceAll("-", "");
  const headers = await signCaptureSchedulerRequest({
    secret: env.CAPTURE_SCHEDULER_SECRET,
    audience,
    timestamp: now,
    nonce,
    method: "POST",
    url,
    body: CAPTURE_TRIGGER_BODY,
  });
  headers.set("OAI-Sites-Authorization", `Bearer ${env.SITES_ACCESS_BYPASS_TOKEN}`);
  const fetcher = input.fetcher ?? ((request: RequestInfo | URL, init?: RequestInit) => fetch(request, init));
  const response = await fetcher(url, {
    method: "POST",
    headers,
    body: CAPTURE_TRIGGER_BODY,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status >= 300 && response.status < 400) throw new Error("CAPTURE_SCHEDULER_REDIRECT_REJECTED");
  if (!response.ok) throw new Error(`CAPTURE_SCHEDULER_HTTP_${response.status}`);
  return response.json() as Promise<unknown>;
}

const worker = {
  fetch() {
    return Response.json({ error: "SCHEDULED_ONLY" }, { status: 404 });
  },
  scheduled(_controller: ScheduledControllerLike, env: CaptureSchedulerEnv, ctx: ExecutionContextLike) {
    // The controller's scheduledTime is deliberately not serialized. The Sites
    // receiver derives the admitted minute from its own clock after HMAC/replay checks.
    ctx.waitUntil(sendCaptureTrigger(env).then(
      (result) => console.log("NVDA capture scheduler accepted", result),
      (error) => console.error("NVDA capture scheduler failed", error instanceof Error ? error.message : error),
    ));
  },
};

export default worker;
