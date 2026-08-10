export type ProductEventName =
  | "calculator_loaded"
  | "preset_selected"
  | "input_changed"
  | "no_recovery_shown"
  | "scenario_link_copied"
  | "artifact_downloaded"
  | "inquiry_started"
  | "inquiry_submitted"
  | "inquiry_failed"
  | "constraint_cta_clicked"
  | "psa_case_clicked";

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string | number | boolean> }) => void;
  }
}

export function trackProductEvent(name: ProductEventName, props: Record<string, string | number | boolean> = {}) {
  if (typeof window === "undefined" || window.navigator.doNotTrack === "1") return;
  window.plausible?.(name, { props });
  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, path: window.location.pathname, props }),
    keepalive: true,
  }).catch(() => undefined);
}
