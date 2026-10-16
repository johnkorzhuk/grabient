import { afterEach, beforeEach, expect, test, vi } from "vitest";

/* consent.ts and analytics.ts as a page on grabient.com meets them: its storage, its cookies, its listeners, Zaraz's
   loader and /api/geo's answer, each a stand-in here. Each test loads both modules fresh, as a page does. */

vi.mock("@solidjs/web", async () => ({
  ...(await vi.importActual<object>("@solidjs/web")),
  isServer: false
}));

class Storage {
  #items = new Map<string, string>();
  getItem = (key: string) => this.#items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.#items.set(key, value);
  removeItem = (key: string) => void this.#items.delete(key);
  key = (index: number) => [...this.#items.keys()][index] ?? null;
  get length() {
    return this.#items.size;
  }
}

/** A page at `href` whose /api/geo answers `answer`, in a browser that sends Global Privacy Control when `gpc`. */
function browser(options: { answer?: unknown; gpc?: boolean; href?: string } = {}) {
  const page = new EventTarget();
  const presses = new Map<string, (event: Event) => void>();
  const cookies = new Map<string, string>();
  /* every cookie the page set, in order, a cleared one included */
  const written: string[] = [];
  const loaded: string[] = [];
  const zaraz = { set: vi.fn() };
  vi.stubGlobal("window", Object.assign(page, { zaraz: undefined as unknown }));
  vi.stubGlobal("addEventListener", page.addEventListener.bind(page));
  vi.stubGlobal("dispatchEvent", page.dispatchEvent.bind(page));
  vi.stubGlobal("location", new URL(options.href ?? "https://grabient.com/palettes"));
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15",
    doNotTrack: null,
    globalPrivacyControl: options.gpc ?? false
  });
  vi.stubGlobal("localStorage", new Storage());
  vi.stubGlobal("sessionStorage", new Storage());
  vi.stubGlobal("document", {
    referrer: "https://news.example/",
    title: "Palettes",
    documentElement: { lang: "en" },
    head: { append: (script: { src: string }) => loaded.push(script.src) },
    createElement: () => ({}),
    addEventListener: (type: string, listener: (event: Event) => void) =>
      presses.set(type, listener),
    removeEventListener: (type: string) => presses.delete(type),
    get cookie() {
      return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(cookie: string) {
      written.push(cookie);
      const [pair, ...rest] = cookie.split(";");
      const [name, value] = pair.split("=");
      if (rest.some(part => part.trim() === "Max-Age=0")) cookies.delete(name);
      else cookies.set(name, value);
    }
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      options.answer === undefined
        ? new Response(null, { status: 503 })
        : Response.json(options.answer)
    )
  );
  /** A press the reader makes, on the privacy banner or elsewhere on the page. */
  const press = (onBanner = false) =>
    presses.get("pointerdown")?.({
      isTrusted: true,
      target: {
        closest: (selector: string) => (onBanner && selector === "[data-consent]" ? {} : null)
      }
    } as unknown as Event);
  return { press, cookies, written, loaded, zaraz };
}

const settled = () => new Promise(resolve => setTimeout(resolve, 0));
const ALL_OFF = { necessary: true, analytics: false, sessionReplay: false, marketing: false };

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("a reader who has not chosen starts by the region's rule, and with everything off where the browser said no", async () => {
  browser();
  const { defaults } = await import("./consent.ts");
  expect(defaults("ask")).toMatchObject({
    hasInteracted: false,
    isGdprRegion: true,
    categories: ALL_OFF
  });
  expect(defaults("tell")).toMatchObject({
    isGdprRegion: false,
    categories: { ...ALL_OFF, analytics: true }
  });
  expect(defaults("none")).toMatchObject({
    isGdprRegion: false,
    categories: { ...ALL_OFF, analytics: true, marketing: true }
  });
  vi.stubGlobal("navigator", { globalPrivacyControl: true });
  for (const rule of ["ask", "tell", "none"] as const)
    expect(defaults(rule).categories).toEqual(ALL_OFF);
});

test("Google's consent mode hears Analytics, and the ads' signals stay refused whatever Marketing says", async () => {
  const { zaraz } = browser();
  Object.assign(window, { zaraz });
  const { defaults, tellZaraz } = await import("./consent.ts");
  const refused = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
  tellZaraz(defaults("none"));
  expect(zaraz.set).toHaveBeenLastCalledWith("google_consent_update", {
    analytics_storage: "granted",
    ...refused
  });
  tellZaraz(defaults("ask"));
  expect(zaraz.set).toHaveBeenLastCalledWith("google_consent_update", {
    analytics_storage: "denied",
    ...refused
  });
});

test("Zaraz's Marketing purpose rides on Analytics, as the page's does", async () => {
  const { zaraz } = browser();
  const purposes = {
    APIReady: true,
    purposes: { HdWd: {}, mxdH: {}, daJQ: {} },
    set: vi.fn(),
    sendQueuedEvents: vi.fn()
  };
  Object.assign(window, { zaraz: { ...zaraz, consent: purposes } });
  const { defaults, tellZaraz } = await import("./consent.ts");
  const none = defaults("none");
  tellZaraz({ ...none, categories: { ...none.categories, analytics: false } });
  expect(purposes.set).toHaveBeenLastCalledWith({ HdWd: false, mxdH: false, daJQ: false });
  tellZaraz(none);
  expect(purposes.set).toHaveBeenLastCalledWith({ HdWd: true, mxdH: false, daJQ: true });
});

test("in another site's frame, which shows no banner, nothing runs where the rule tells until the reader chooses", async () => {
  browser({ answer: { rule: "tell", isGdprRegion: false } });
  Object.assign(window, { self: {}, top: {} });
  const consent = await import("./consent.ts");
  await consent.initConsent();
  expect(consent.consent().categories).toEqual(ALL_OFF);
});

test("the banner is due where the rule asks or tells, until the reader answers, and never where it need not be", async () => {
  const due = async (options: Parameters<typeof browser>[0], stored?: unknown) => {
    vi.resetModules();
    browser(options);
    if (stored) localStorage.setItem("consent-preferences", JSON.stringify(stored));
    const consent = await import("./consent.ts");
    await consent.initConsent();
    return consent.consentDue();
  };
  expect(await due({ answer: { rule: "ask", isGdprRegion: true } })).toBe(true);
  expect(await due({ answer: { rule: "tell", isGdprRegion: false } })).toBe(true);
  expect(await due({ answer: { rule: "none", isGdprRegion: false } })).toBe(false);
  // a browser that says no, an answer that never came, and a choice this browser kept
  expect(await due({ answer: { rule: "ask" }, gpc: true })).toBe(false);
  expect(await due({})).toBe(false);
  const chosen = {
    version: 3,
    timestamp: Date.now(),
    hasInteracted: true,
    isGdprRegion: true,
    categories: ALL_OFF
  };
  expect(await due({ answer: { rule: "ask" } }, chosen)).toBe(false);
});

test("an answer to the banner is one choice for every category, kept in this browser; defaults are never kept", async () => {
  browser({ answer: { rule: "tell", isGdprRegion: false } });
  const consent = await import("./consent.ts");
  await consent.initConsent();
  expect(consent.consent().categories).toEqual({ ...ALL_OFF, analytics: true });
  expect(localStorage.getItem("consent-preferences")).toBeNull();
  consent.setAllConsent(false);
  expect(consent.consentDue()).toBe(false);
  expect(JSON.parse(localStorage.getItem("consent-preferences") ?? "null")).toMatchObject({
    version: 3,
    hasInteracted: true,
    isGdprRegion: false,
    categories: ALL_OFF
  });
  consent.setAllConsent(true);
  expect(consent.consent().categories).toEqual({
    necessary: true,
    analytics: true,
    sessionReplay: true,
    marketing: true
  });
});

test("a press on the banner is no use of the page: analytics starts at the next press", async () => {
  const { press, loaded } = browser({ answer: { rule: "tell", isGdprRegion: false } });
  const { initializeAnalytics } = await import("./analytics.ts");
  initializeAnalytics();
  await settled();
  press(true);
  expect(loaded).toEqual([]);
  press();
  expect(loaded).toEqual(["/cdn-cgi/zaraz/i.js"]);
});

test("how the reader first came is kept under Marketing alone, and goes with it", async () => {
  const { press, cookies, written, loaded } = browser({
    answer: { rule: "tell", isGdprRegion: false }
  });
  localStorage.setItem("gb_login", JSON.stringify({ method: "google", at: Date.now() }));
  const { initializeAnalytics, trackLoginStart } = await import("./analytics.ts");
  const consent = await import("./consent.ts");
  initializeAnalytics();
  await settled();
  press();
  // Analytics runs under tell; Marketing waits for a yes, and nothing links the visit to its person
  expect(loaded).toEqual(["/cdn-cgi/zaraz/i.js"]);
  expect(written.filter(cookie => cookie.startsWith("gb_attr=%"))).toEqual([]);
  expect(localStorage.getItem("gb_login")).toBeNull();
  trackLoginStart("google");
  expect(localStorage.getItem("gb_login")).toBeNull();
  consent.setAllConsent(true);
  expect(JSON.parse(decodeURIComponent(cookies.get("gb_attr") ?? "null"))).toMatchObject({
    l: "/palettes",
    r: "news.example"
  });
  trackLoginStart("google");
  expect(localStorage.getItem("gb_login")).not.toBeNull();
  consent.setConsentCategory("marketing", false);
  expect(cookies.has("gb_attr")).toBe(false);
  expect(localStorage.getItem("gb_login")).toBeNull();
});
