// Assumptions under test come from TanStack source:
// - react-router/src/link.tsx: mouseenter starts a preload timer, mouseleave cancels it,
//   focus/touchstart preload immediately, timers are per-element (WeakMap).
// - router-core/src/router.ts:925 defaultPreloadDelay = 50ms.
// - load-matches.ts:805 preloadStaleTime default 30_000ms (preload skipped while fresh).
// - query-core query.ts:386-406: concurrent fetches for one key share one in-flight promise.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadClient, mouse } from "./setup";

let fetchMock;

beforeAll(async () => {
  fetchMock = await loadClient();
});

afterEach(() => {
  vi.useRealTimers();
  fetchMock.mockClear();
});

function link(href) {
  document.body.innerHTML = `<a id="l" href="${href}"><span id="inner">x</span></a>`;
  return document.getElementById("l");
}

describe("intent preloading", () => {
  it("preloads 50ms after hover, not before (defaultPreloadDelay=50)", async () => {
    vi.useFakeTimers();
    const a = link("/hover-delay");
    mouse("mouseover", a);
    await vi.advanceTimersByTimeAsync(49);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/hover-delay");
  });

  it("cancels the pending preload when the pointer leaves before the delay", async () => {
    vi.useFakeTimers();
    const a = link("/hover-cancel");
    mouse("mouseover", a);
    await vi.advanceTimersByTimeAsync(30);
    mouse("mouseout", a);
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not cancel when the pointer moves between children of the same link", async () => {
    vi.useFakeTimers();
    const a = link("/hover-children");
    const inner = document.getElementById("inner");
    mouse("mouseover", a);
    mouse("mouseout", a, inner); // relatedTarget inside the link
    await vi.advanceTimersByTimeAsync(60);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preloads immediately on focus (no delay)", async () => {
    const a = link("/focus-now");
    a.dispatchEvent(new Event("focusin", { bubbles: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/focus-now");
  });

  it("preloads immediately on touchstart", async () => {
    const a = link("/touch-now");
    a.dispatchEvent(new Event("touchstart", { bubbles: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips re-preload while entry is fresh (preloadStaleTime=30s) and refetches after", async () => {
    vi.useFakeTimers();
    const a = link("/preload-fresh");
    mouse("mouseover", a);
    await vi.advanceTimersByTimeAsync(60);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    mouse("mouseout", a);
    await vi.advanceTimersByTimeAsync(29_000);
    mouse("mouseover", a);
    await vi.advanceTimersByTimeAsync(60);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still fresh at <30s

    mouse("mouseout", a);
    await vi.advanceTimersByTimeAsync(2_000); // now >30s since fetch
    mouse("mouseover", a);
    await vi.advanceTimersByTimeAsync(60);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent preloads into one in-flight fetch", async () => {
    vi.useFakeTimers();
    let release;
    fetchMock.mockImplementationOnce(
      () => new Promise((r) => (release = r)),
    );
    const a = link("/dedup");
    mouse("mouseover", a);
    await vi.advanceTimersByTimeAsync(60);
    a.dispatchEvent(new Event("focusin", { bubbles: true }));
    a.dispatchEvent(new Event("touchstart", { bubbles: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release({ text: async () => "<html></html>", url: "", headers: new Headers() });
  });
});
