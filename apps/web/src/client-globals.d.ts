// Globals injected on the client by third parties rather than by our bundle.
//
// Zaraz is loaded by Cloudflare, and only on grabient.com (see html.ts), so
// every access has to stay optional — on staging and in tests it is absent.
// window.posthog is set by analytics.js itself to match PostHog's standard
// snippet, which gives consent and debug tooling one canonical instance.
export {};

declare global {
  interface Window {
    zaraz?: {
      track?: (eventName: string, properties?: Record<string, unknown>) => void;
      set?: (key: string, value: unknown) => void;
    };
    posthog?: unknown;
  }
}
