import { expect, test, vi } from "vitest";

// the browser's paths: Node resolves Solid's server build, where isServer is true
vi.mock("@solidjs/web", async original => ({
  ...(await original<typeof import("@solidjs/web")>()),
  isServer: false
}));

/** A browser's storage, in memory. */
const store = (entries: Record<string, string>) => {
  const kept = new Map(Object.entries(entries));
  return Object.assign(Object.create(null), Object.fromEntries(kept), {
    removeItem(key: string) {
      kept.delete(key);
      delete (this as Record<string, unknown>)[key];
    }
  });
};

test("what the old analytics kept goes from the browser, and nothing else does", async () => {
  const written: string[] = [];
  vi.stubGlobal("location", { hostname: "www.grabient.com" });
  vi.stubGlobal("document", {
    get cookie() {
      return "gb_attr=x; _ga=GA1.1.2; _ga_9Q353KKFZQ=GS1; ph_phc_key_posthog=1; grabient-locale=fr; better-auth.session_token=s";
    },
    set cookie(value: string) {
      written.push(value);
    }
  });
  const local = store({
    "consent-preferences": "{}",
    gb_login: "{}",
    ph_phc_key_posthog: "{}",
    "grabient-account": "{}",
    theme: "dark"
  });
  const session = store({ gb_su_ada: "1", "grabient-tab": "1" });
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  const { forgetOldAnalytics } = await import("./forget-analytics.ts");
  forgetOldAnalytics();
  const cleared = [...new Set(written.map(cookie => cookie.split("=")[0]))];
  expect(cleared).toEqual(["gb_attr", "_ga", "_ga_9Q353KKFZQ", "ph_phc_key_posthog"]);
  // on the host itself and on the site's domain, as either may have set it
  expect(written.filter(cookie => cookie.startsWith("gb_attr="))).toEqual([
    "gb_attr=; Path=/; Max-Age=0",
    "gb_attr=; Path=/; Max-Age=0; domain=www.grabient.com",
    "gb_attr=; Path=/; Max-Age=0; domain=.grabient.com"
  ]);
  expect(Object.keys(local).sort()).toEqual(["grabient-account", "removeItem", "theme"].sort());
  expect(Object.keys(session).sort()).toEqual(["grabient-tab", "removeItem"].sort());
  vi.unstubAllGlobals();
});
