import { flush } from "solid-js";
import { beforeAll, expect, it, vi } from "vitest";
import { READ_TIMEOUT } from "../../lib/query.ts";
import redirects from "./fixtures/redirects.json" with { type: "json" };

// the browser's paths: Node resolves Solid's server build, where isServer is true
vi.mock("@solidjs/web", async original => ({
  ...(await original<typeof import("@solidjs/web")>()),
  isServer: false
}));
// the page's analytics read the address bar as they load; these tests count nothing
vi.mock("../analytics/analytics.ts", () => ({
  setAnalyticsInternal: () => {},
  setAnalyticsUser: () => {},
  trackEvent: () => {}
}));

const kept = new Map<string, string>();
let session: typeof import("./session.ts");
beforeAll(async () => {
  vi.stubGlobal("addEventListener", () => {});
  vi.stubGlobal("location", { pathname: "/", search: "" });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => kept.set(key, String(value)),
    removeItem: (key: string) => kept.delete(key)
  });
  session = await import("./session.ts");
});

it("leads back only to a path on this site, as grabient4 did", () => {
  for (const [input, safe, login] of redirects) {
    const raw = input === "(undefined)" ? undefined : input;
    expect([input, session.safeRedirect(raw), session.loginHref(raw ?? "/")]).toEqual([
      input,
      safe,
      login
    ]);
  }
});

it("gives up a session check the server never answers, and stands on the account kept here", async () => {
  kept.set("grabient-account", JSON.stringify({ id: "kept-reader", name: "Ada" }));
  // a connection that holds the request open: it ends only when the page gives it up
  vi.stubGlobal("fetch", (_path: string, init: RequestInit) => {
    const signal = init.signal;
    return new Promise((_, reject) =>
      signal?.addEventListener("abort", () => reject(signal.reason))
    );
  });
  const gaveUp = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(gaveUp.signal);
  void session.refreshSession();
  expect(timeout).toHaveBeenCalledWith(READ_TIMEOUT);
  flush();
  expect(session.sessionReady()).toBe(false);
  gaveUp.abort(new DOMException("The read took too long.", "TimeoutError"));
  await vi.waitFor(() => {
    flush();
    expect(session.sessionReady()).toBe(true);
  });
  expect(session.account()?.id).toBe("kept-reader");
});
