// Consent store + settings toggles (client): geo defaults, persistence,
// hydration, Zaraz sync. Ports the semantics of the original's
// stores/consent-store.ts — same localStorage key + schema version.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { click, loadClient } from "./setup";

const CONSENT_KEY = "consent-preferences";

const SWITCH = (name) =>
  `<button type="button" role="switch" id="consent-${name}" data-consent="${name}" data-state="unchecked" aria-checked="false"><span data-state="unchecked"></span></button>`;

function settingsDom(gdpr) {
  document.body.innerHTML =
    `<div id="auth-slot"></div>` +
    `<section id="privacy" data-gdpr="${gdpr ? "1" : "0"}">` +
    SWITCH("analytics") +
    SWITCH("sessionReplay") +
    SWITCH("advertising") +
    `</section>`;
}

const boot = () => document.dispatchEvent(new Event("app:swap"));
const stored = () => JSON.parse(localStorage.getItem(CONSENT_KEY));
const checked = (name) =>
  document.getElementById(`consent-${name}`).getAttribute("aria-checked") === "true";

let fetchMock;

// This happy-dom build's localStorage is a bare object without Storage
// methods — install a real shim for the consent store to exercise.
const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorage,
  configurable: true,
  writable: true,
});

beforeAll(async () => {
  localStorage.clear();
  fetchMock = await loadClient();
});

beforeEach(() => {
  fetchMock.mockClear();
  delete globalThis.zaraz;
});

describe("consent boot (settings page)", () => {
  it("GDPR geo defaults everything off and stores the choice", () => {
    settingsDom(true);
    boot();
    expect(checked("analytics")).toBe(false);
    expect(checked("sessionReplay")).toBe(false);
    expect(checked("advertising")).toBe(false);
    const s = stored();
    expect(s.version).toBe(3);
    expect(s.hasInteracted).toBe(false);
    expect(s.isGdprRegion).toBe(true);
    expect(s.categories.analytics).toBe(false);
    // Geo came from the page's data-gdpr — no /api/geo fetch needed.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/geo"))).toBe(false);
  });

  it("a toggle click flips the switch, persists hasInteracted, and syncs Zaraz", () => {
    const set = vi.fn();
    const sendQueuedEvents = vi.fn();
    globalThis.zaraz = {
      consent: {
        APIReady: true,
        purposes: { HdWd: {}, mxdH: {}, daJQ: {} },
        set,
        sendQueuedEvents,
      },
    };
    settingsDom(true);
    boot();
    click(document.getElementById("consent-analytics"));
    expect(checked("analytics")).toBe(true);
    expect(
      document.getElementById("consent-analytics").dataset.state,
    ).toBe("checked");
    expect(
      document.getElementById("consent-analytics").firstElementChild.dataset.state,
    ).toBe("checked");
    const s = stored();
    expect(s.hasInteracted).toBe(true);
    expect(s.categories.analytics).toBe(true);
    expect(s.categories.sessionReplay).toBe(false);
    // Zaraz got the purpose IDs, not the category names.
    expect(set).toHaveBeenCalledWith({ HdWd: true, mxdH: false, daJQ: false });
    expect(sendQueuedEvents).toHaveBeenCalled();
  });

  it("hydrates toggles from the stored choice on the next visit (no geo refetch)", () => {
    settingsDom(true);
    boot();
    // analytics was stored ON by the previous test.
    expect(checked("analytics")).toBe(true);
    expect(checked("advertising")).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/geo"))).toBe(false);
  });

  it("toggling back off persists", () => {
    settingsDom(true);
    boot();
    click(document.getElementById("consent-analytics"));
    expect(checked("analytics")).toBe(false);
    expect(stored().categories.analytics).toBe(false);
    expect(stored().hasInteracted).toBe(true);
  });
});

describe("consent boot (fresh module, non-GDPR)", () => {
  it("defaults analytics + marketing on (legitimate interest), replay off", async () => {
    localStorage.clear();
    vi.resetModules();
    settingsDom(false);
    await import("../src/app.client.js");
    expect(checked("analytics")).toBe(true);
    expect(checked("sessionReplay")).toBe(false);
    expect(checked("advertising")).toBe(true);
    expect(stored().isGdprRegion).toBe(false);
  });

  it("non-settings pages fetch /api/geo once when nothing is stored", async () => {
    localStorage.clear();
    vi.resetModules();
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/api/geo"))
        return { ok: true, json: async () => ({ isGdprRegion: true }) };
      return { ok: true, json: async () => ({}) };
    });
    document.body.innerHTML = `<div id="auth-slot"></div>`;
    await import("../src/app.client.js");
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/geo"))).toBe(true);
    expect(stored().isGdprRegion).toBe(true);
    expect(stored().categories.analytics).toBe(false);
  });

  it("ignores invalid stored JSON (resets to defaults)", async () => {
    localStorage.setItem(CONSENT_KEY, "{not json");
    vi.resetModules();
    settingsDom(false);
    await import("../src/app.client.js");
    expect(checked("analytics")).toBe(true);
    expect(stored().version).toBe(3);
  });

  it("ignores a stored blob from a different schema version", async () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        version: 2,
        timestamp: 1,
        categories: { necessary: true, analytics: false, sessionReplay: false, advertising: false },
        hasInteracted: true,
      }),
    );
    vi.resetModules();
    settingsDom(false);
    await import("../src/app.client.js");
    // v2 blob discarded → non-GDPR defaults apply.
    expect(checked("analytics")).toBe(true);
    expect(stored().hasInteracted).toBe(false);
  });
});
