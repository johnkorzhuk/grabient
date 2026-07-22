// Assumptions under test come from TanStack router-core/src/scroll-restoration.ts:
// - history.scrollRestoration set to 'manual'.
// - positions stored in sessionStorage, keyed per history entry (random key on push,
//   href fallback for the initial entry), captured from a throttled scroll listener.
// - restore priority: cached position (back/forward) -> hash target -> top (new push).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { click, loadClient, page, respond } from "./setup";

let fetchMock;

beforeAll(async () => {
  fetchMock = await loadClient();
});

afterEach(() => {
  vi.useRealTimers();
  fetchMock.mockClear();
  fetchMock.mockImplementation(async (href) => respond(page("default", href), { maxAge: 300 }));
});

const setScroll = (x, y) => {
  Object.defineProperty(window, "scrollX", { value: x, configurable: true });
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
};

describe("scroll restoration", () => {
  it("disables native restoration", () => {
    expect(history.scrollRestoration).toBe("manual");
  });

  it("captures window scroll (throttled) into sessionStorage under the entry key", async () => {
    vi.useFakeTimers();
    setScroll(0, 444);
    document.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(101);
    const stored = JSON.parse(sessionStorage.getItem("gl-scroll-v1"));
    const key = (history.state && history.state.k) || location.pathname + location.search;
    expect(stored[key]).toEqual([0, 444]);
  });

  it("restores scroll INSIDE the swap (before app:swap fires), not after the transition", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<main>x</main><a id="l" href="/inside-swap">go</a>`;
    let scrolledAtSwapEvent = null;
    document.addEventListener(
      "app:swap",
      () => {
        scrolledAtSwapEvent = window.scrollTo.mock.calls.length > 0;
      },
      { once: true },
    );
    window.scrollTo.mockClear();
    click(document.getElementById("l"));
    await vi.advanceTimersByTimeAsync(10);
    expect(scrolledAtSwapEvent).toBe(true);
  });

  it("scrolls to top on push navigation, restores position on popstate", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<main>start</main><a id="l" href="/page-two">two</a>`;

    // Scroll on the current entry, captured under its key.
    setScroll(0, 800);
    document.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(101);
    const fromKey = (history.state && history.state.k) || location.pathname + location.search;
    const fromHref = location.pathname + location.search;

    // Push navigation -> reset to top.
    window.scrollTo.mockClear();
    click(document.getElementById("l"));
    await vi.advanceTimersByTimeAsync(10);
    expect(location.pathname).toBe("/page-two");
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);

    // Back -> popstate with the original entry; position restored.
    window.scrollTo.mockClear();
    history.pushState = history.pushState; // no-op, clarity
    // Simulate the browser going back to the original entry.
    history.replaceState(fromKey.length <= 8 ? { k: fromKey } : null, "", fromHref);
    dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    await vi.advanceTimersByTimeAsync(10);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 800);
  });
});
