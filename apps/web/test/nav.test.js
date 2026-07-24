// Assumptions under test come from TanStack source:
// - load-matches.ts:781-868: SWR navigation — success+stale serves cached data
//   immediately and reloads async; fresh (age < staleTime) skips the loader.
// - router.ts:2444-2448: cache GC after 5 minutes.
// - load-matches.ts:296-327: pendingMs 1000 before pending UI, pendingMinMs 500 once shown.
// - retryer.ts:48-50,169: retry 3x, backoff min(1000*2^n, 30000).
// - query focusManager.ts:24: refetch driven by 'visibilitychange', only when stale.
// Staleness here is driven by each page's HTTP Cache-Control max-age.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { click, loadClient, page, respond } from "./setup";

let fetchMock;
const SEED = "_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKb";

beforeAll(async () => {
  fetchMock = await loadClient();
});

afterEach(() => {
  vi.useRealTimers();
  fetchMock.mockClear();
  fetchMock.mockImplementation(async (href) => respond(page("default", href)));
});

function link(href, label = "go") {
  document.body.innerHTML = `<main>start</main><a id="l" href="${href}">${label}</a>`;
  return document.getElementById("l");
}

describe("navigation", () => {
  it("intercepts same-origin left clicks: swaps body + title and pushes history", async () => {
    fetchMock.mockResolvedValueOnce(respond(page("Newest", "NEWCONTENT"), { maxAge: 300 }));
    click(link("/newest"));
    await vi.waitFor(() => expect(document.body.textContent).toContain("NEWCONTENT"));
    expect(document.title).toBe("Newest");
    expect(location.pathname).toBe("/newest");
  });

  it("falls back to a full load when the incoming page is from a different deploy", async () => {
    document.head.insertAdjacentHTML(
      "beforeend",
      `<script type="module" src="/assets/entry-OLDHASH.js"></script>`,
    );
    const reload = vi.fn();
    Object.defineProperty(location, "reload", { value: reload, configurable: true });
    fetchMock.mockResolvedValueOnce(
      respond(
        `<html><head><title>New</title><script type="module" src="/assets/entry-NEWHASH.js"></script></head><body><main>NEWDEPLOY</main></body></html>`,
        { maxAge: 300 },
      ),
    );
    click(link("/cross-deploy"));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    // The mixed-deploy body swap must NOT have happened.
    expect(document.body.textContent).not.toContain("NEWDEPLOY");
    document.querySelector('script[src="/assets/entry-OLDHASH.js"]').remove();
  });

  it("syncs the favicon from the incoming document on swap", async () => {
    document.head.insertAdjacentHTML("beforeend", `<link rel="icon" href="data:default">`);
    fetchMock.mockResolvedValueOnce(
      respond(
        `<html><head><title>Seed</title><link rel="icon" href="data:seed-gradient"></head><body><main>SEEDFAV</main></body></html>`,
        { maxAge: 600 },
      ),
    );
    click(link("/_favseed"));
    await vi.waitFor(() => expect(document.body.textContent).toContain("SEEDFAV"));
    expect(document.querySelector('link[rel="icon"]').getAttribute("href")).toBe(
      "data:seed-gradient",
    );
  });

  it("syncs canonical, description, robots, social metadata, and JSON-LD on swap", async () => {
    document.head.insertAdjacentHTML(
      "beforeend",
      `<meta name="description" content="old"><meta name="robots" content="index"><meta property="og:url" content="https://example.com/old"><link rel="canonical" href="https://example.com/old"><script type="application/ld+json">{"name":"Old"}</script>`,
    );
    fetchMock.mockResolvedValueOnce(
      respond(
        `<html><head><title>New metadata</title><meta name="description" content="new"><meta name="robots" content="noindex,nofollow"><meta property="og:url" content="https://example.com/new"><meta name="twitter:title" content="New metadata"><link rel="canonical" href="https://example.com/new"><script type="application/ld+json">{"name":"New"}</script></head><body><main>NEWHEAD</main></body></html>`,
        { maxAge: 300 },
      ),
    );
    click(link("/new-head"));
    await vi.waitFor(() => expect(document.body.textContent).toContain("NEWHEAD"));
    expect(document.querySelector('meta[name="description"]').content).toBe("new");
    expect(document.querySelector('meta[name="robots"]').content).toBe("noindex,nofollow");
    expect(document.querySelector('meta[property="og:url"]').content).toBe(
      "https://example.com/new",
    );
    expect(document.querySelector('meta[name="twitter:title"]').content).toBe("New metadata");
    expect(document.querySelector('link[rel="canonical"]').href).toBe(
      "https://example.com/new",
    );
    expect(document.querySelector('script[type="application/ld+json"]').textContent).toContain(
      '"name":"New"',
    );
  });

  it("does not intercept modified clicks (ctrl/meta) or external origins", () => {
    const a = link("/no-intercept");
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));
    document.body.innerHTML = `<a id="x" href="https://example.com/ext">e</a>`;
    const ext = document.getElementById("x");
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
    ext.dispatchEvent(evt);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not intercept plain-file links (llms.txt etc.) — the browser loads them natively", () => {
    document.body.innerHTML = `<a id="f" href="/llms.txt">llms.txt</a>`;
    const a = document.getElementById("f");
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(evt);
    // Not intercepted: no preventDefault, no swap fetch of the txt file.
    expect(evt.defaultPrevented).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns the palette search form into a shareable semantic route", async () => {
    history.replaceState({}, "", "/?style=radialGradient&page=3&export=true");
    document.body.innerHTML = `<form id="palette-search"><input name="q" value="Warm Sunset"></form>`;
    fetchMock.mockResolvedValueOnce(
      respond(page("Warm sunset palettes", "SEARCHRESULTS"), { maxAge: 0 }),
    );
    document
      .getElementById("palette-search")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("SEARCHRESULTS"));
    expect(location.pathname).toBe("/palettes/warm-sunset");
    expect(location.search).toBe("?style=radialGradient");
  });

  it("parses pasted Grabient links and applies their palette options", async () => {
    history.replaceState({}, "", "/newest?style=linearGradient&page=3");
    document.body.innerHTML = `<form id="palette-search"><input name="q" value="https://grabient-lite.jkorzhuk.workers.dev/${SEED}?style=radialGradient&angle=45&steps=11"></form>`;
    fetchMock.mockResolvedValueOnce(
      respond(page("Seed color palettes", "PARSEDLINKRESULTS"), { maxAge: 0 }),
    );
    document
      .getElementById("palette-search")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("PARSEDLINKRESULTS"));
    expect(location.pathname).toBe(`/palettes/${SEED}`);
    expect(location.search).toBe(
      "?style=radialGradient&sort=newest&angle=45&steps=11",
    );
  });

  it("reveals and operates the search clear control as the user types", () => {
    document.body.innerHTML = `<form><input id="palette-search-input"><button type="button" data-search-clear class="hidden">clear</button></form>`;
    const input = document.getElementById("palette-search-input");
    const clear = document.querySelector("[data-search-clear]");
    input.value = "sunset";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(clear.classList.contains("hidden")).toBe(false);
    clear.click();
    expect(input.value).toBe("");
    expect(clear.classList.contains("hidden")).toBe(true);
  });

  it("drag-scrolls the Popular tag rail without activating the dragged link", () => {
    history.replaceState({}, "", "/");
    document.body.innerHTML = `<nav data-drag-scroll><a href="/palettes/sunset">sunset</a></nav>`;
    const rail = document.querySelector("[data-drag-scroll]");
    const tag = rail.querySelector("a");
    rail.scrollLeft = 20;

    tag.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 120,
        pointerId: 7,
        pointerType: "mouse",
      }),
    );
    tag.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        clientX: 70,
        pointerId: 7,
        pointerType: "mouse",
      }),
    );
    tag.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: 70,
        pointerId: 7,
        pointerType: "mouse",
      }),
    );

    expect(rail.scrollLeft).toBe(70);
    const clickAfterDrag = new MouseEvent("click", { bubbles: true, cancelable: true });
    tag.dispatchEvent(clickAfterDrag);
    expect(clickAfterDrag.defaultPrevented).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps Popular tags clickable through normal pointer jitter", async () => {
    history.replaceState({}, "", "/");
    document.body.innerHTML = `<nav data-drag-scroll><a href="/palettes/sunset">sunset</a></nav>`;
    const tag = document.querySelector("[data-drag-scroll] a");
    fetchMock.mockResolvedValueOnce(
      respond(page("Sunset palettes", "SUNSETRESULTS"), { maxAge: 0 }),
    );

    tag.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 120,
        pointerId: 8,
        pointerType: "mouse",
      }),
    );
    tag.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        clientX: 115,
        pointerId: 8,
        pointerType: "mouse",
      }),
    );
    tag.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: 115,
        pointerId: 8,
        pointerType: "mouse",
      }),
    );
    tag.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(document.body.textContent).toContain("SUNSETRESULTS"));
    expect(location.pathname).toBe("/palettes/sunset");
  });

  it("sorts semantic results in place while preserving their view options", async () => {
    history.replaceState({}, "", "/palettes/sunset?style=linearSwatches&page=2");
    document.body.innerHTML = `<select id="query-sort"><option value="popular">Popular</option><option value="newest" selected>Newest</option></select>`;
    fetchMock.mockResolvedValueOnce(
      respond(page("Newest sunset palettes", "SORTEDRESULTS"), { maxAge: 0 }),
    );
    document
      .getElementById("query-sort")
      .dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("SORTEDRESULTS"));
    expect(location.pathname).toBe("/palettes/sunset");
    expect(location.search).toBe("?style=linearSwatches&sort=newest");
  });

  it("SWR: stale cached page renders instantly, then revalidates and re-swaps in background", async () => {
    vi.useFakeTimers();
    // Preload with maxAge 0 -> immediately stale for navigation purposes.
    fetchMock.mockResolvedValueOnce(respond(page("V1", "STALE-CONTENT"), { maxAge: 0 }));
    const a = link("/swr");
    a.dispatchEvent(new Event("focusin", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    let release;
    fetchMock.mockImplementationOnce(() => new Promise((r) => (release = r)));
    click(document.getElementById("l"));
    await vi.advanceTimersByTimeAsync(1);
    // Served from cache immediately (stale) while the background fetch is in flight.
    expect(document.body.textContent).toContain("STALE-CONTENT");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    release(respond(page("V2", "FRESH-CONTENT"), { maxAge: 300 }));
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain("FRESH-CONTENT");
    expect(document.title).toBe("V2");
  });

  it("fresh cached page (within max-age) does not revalidate", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(respond(page("Fresh", "FRESH-PAGE"), { maxAge: 300 }));
    const a = link("/fresh");
    a.dispatchEvent(new Event("focusin", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);
    click(document.getElementById("l"));
    await vi.advanceTimersByTimeAsync(50);
    expect(document.body.textContent).toContain("FRESH-PAGE");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts cache entries older than gcTime (5 min) so navigation refetches", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(respond(page("Old", "OLD"), { maxAge: 10_000 }));
    const a = link("/gc");
    a.dispatchEvent(new Event("focusin", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(301_000); // > 5 min
    fetchMock.mockResolvedValueOnce(respond(page("New", "REFETCHED"), { maxAge: 300 }));
    click(document.getElementById("l"));
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("REFETCHED");
  });

  it("shows pending bar only after 1000ms (pendingMs) and hides after load", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((r) =>
          setTimeout(() => r(respond(page("Slow", "SLOW-PAGE"), { maxAge: 300 })), 1500),
        ),
    );
    click(link("/slow"));
    await vi.advanceTimersByTimeAsync(900);
    expect(document.documentElement.classList.contains("pending")).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(document.documentElement.classList.contains("pending")).toBe(true);
    await vi.advanceTimersByTimeAsync(600); // fetch resolves at 1500ms
    await vi.advanceTimersByTimeAsync(600); // pendingMinMs window passes
    expect(document.documentElement.classList.contains("pending")).toBe(false);
    expect(document.body.textContent).toContain("SLOW-PAGE");
  });

  it("canonicalizes the URL when clicking a PRELOADED legacy/decimal seed link", async () => {
    vi.useFakeTimers();
    // Preload a legacy-seed href; fetch followed the server 301 to canonical.
    fetchMock.mockResolvedValueOnce(
      respond(page("Canon", "CANON-FROM-CACHE"), {
        maxAge: 600,
        url: "http://localhost/_CANONSEED",
      }),
    );
    const a = link("/legacy-lz-seed");
    a.dispatchEvent(new Event("focusin", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);

    click(document.getElementById("l"));
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain("CANON-FROM-CACHE");
    expect(location.pathname).toBe("/_CANONSEED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows canonical redirects: history is replaced with the response URL", async () => {
    fetchMock.mockResolvedValueOnce(
      respond(page("Canon", "CANON-PAGE"), {
        maxAge: 300,
        url: "http://localhost/_CANONICAL",
      }),
    );
    click(link("/legacy-seed"));
    await vi.waitFor(() => expect(document.body.textContent).toContain("CANON-PAGE"));
    expect(location.pathname).toBe("/_CANONICAL");
  });

  it("revalidates on visibilitychange only when stale, with retry/backoff on failure", async () => {
    vi.useFakeTimers();
    // Navigate somewhere with maxAge 0 so the current page is stale.
    fetchMock.mockResolvedValueOnce(respond(page("P", "PAGE-V1"), { maxAge: 0 }));
    click(link("/focus-reval"));
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain("PAGE-V1");
    fetchMock.mockClear();

    // Two failures then success: expect backoff 1000ms then 2000ms (min(1000*2^n, 30000)).
    fetchMock
      .mockRejectedValueOnce(new Error("net"))
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValueOnce(respond(page("P2", "PAGE-V2"), { maxAge: 300 }));

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(1); // attempt 1 fails
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_001); // backoff 1000 -> attempt 2 fails
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_001); // backoff 2000 -> attempt 3 succeeds
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.textContent).toContain("PAGE-V2");
  });

  it("skips focus revalidation while the current page is fresh", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(respond(page("F", "FRESH-CURRENT"), { maxAge: 600 }));
    click(link("/focus-fresh"));
    await vi.advanceTimersByTimeAsync(10);
    fetchMock.mockClear();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
