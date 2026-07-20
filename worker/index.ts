/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ensureMooSafetySchemaOnce } from "../app/d1-schema";
import { createD1ScheduledCaptureStore, runScheduledCapture } from "../app/scheduled-capture";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const store = createD1ScheduledCaptureStore(env.DB);
    ctx.waitUntil(
      ensureMooSafetySchemaOnce(env.DB, controller.scheduledTime)
        .then(() => runScheduledCapture({
          scheduledTime: controller.scheduledTime,
          fetchApp: (path) =>
            handler.fetch(new Request(new URL(path, "https://nvda-scheduler.internal")), env, ctx),
          store,
        }))
        .then((result) => console.log("NVDA scheduled capture", result))
        .catch((error) => console.error("NVDA scheduled capture failed", error)),
    );
  },
};

export default worker;
