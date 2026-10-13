import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* The counts beside the hearts, with the page's clock in the test's hands: what is asked of the server, when, and in
   how many requests, and which count a card shows. */

// the browser's paths: Node resolves Solid's server build, where isServer is true
vi.mock("@solidjs/web", async original => ({
  ...(await original<typeof import("@solidjs/web")>()),
  isServer: false
}));
// the page's analytics read the address bar as they load; these tests count nothing
vi.mock("../analytics/analytics.ts", () => ({
  setAnalyticsInternal: () => {},
  setAnalyticsUser: () => {},
  trackEvent: () => {},
  trackSignInPrompt: () => {}
}));

let asked: string[][] = [];
let answer: (keys: string[]) => Promise<Response> = async keys =>
  Response.json({ counts: Object.fromEntries(keys.map(key => [key, 7])) });
const kept = new Map<string, string>();

let likes: typeof import("./likes.ts");
let state: typeof import("./state.ts");
beforeAll(async () => {
  vi.stubGlobal("addEventListener", () => {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => kept.set(key, String(value)),
    removeItem: (key: string) => kept.delete(key)
  });
  vi.stubGlobal("fetch", async (url: string) => {
    const keys = decodeURIComponent(new URL(url, "https://g.test").searchParams.get("keys") ?? "");
    asked.push(keys.split(","));
    return answer(keys.split(","));
  });
  likes = await import("./likes.ts");
  state = await import("./state.ts");
});
let n = 0;
/** a palette no other test has counted */
const seed = () => `kTest${++n}`;
const NOW = Date.UTC(2026, 9, 13, 12);
beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date", "setTimeout"] });
  asked = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the counts beside the hearts", () => {
  it("shows the page's count until it knows a newer one", async () => {
    const a = seed();
    expect(likes.likeCount(a, 3)).toBe(3);
    await likes.readLikeCounts([a]);
    expect(asked).toEqual([[a]]);
    expect(likes.likeCount(a, 3)).toBe(7);
  });

  it("asks again for a count only five minutes after it was read", async () => {
    const a = seed();
    likes.noteCounts([{ seed: a, likes: 3 }], NOW);
    await likes.readLikeCounts([a]);
    expect(asked).toEqual([]);
    vi.setSystemTime(NOW + 300_000);
    await likes.readLikeCounts([a]);
    expect(asked).toEqual([[a]]);
  });

  it("never makes an old count fresh when the page draws it again", async () => {
    const a = seed();
    likes.noteCounts([{ seed: a, likes: 3 }], NOW - 600_000);
    // a card mounted again over the same data: no read time, so the count keeps its age
    likes.noteCounts([{ seed: a, likes: 3 }]);
    await likes.readLikeCounts([a]);
    expect(asked).toEqual([[a]]);
  });

  it("gathers the asks of cards drawn together into one request, each palette once", async () => {
    const [a, b, c] = [seed(), seed(), seed()];
    const first = likes.readLikeCounts([a, b]);
    const second = likes.readLikeCounts([b, c]);
    await Promise.all([first, second]);
    expect(asked).toEqual([[a, b, c]]);
  });

  it("asks 96 at a time", async () => {
    const many = Array.from({ length: 100 }, seed);
    await likes.readLikeCounts(many);
    expect(asked.map(keys => keys.length)).toEqual([96, 4]);
  });

  it("lets every waiting count be asked again when a request fails", async () => {
    const [a, b] = [seed(), seed()];
    answer = async () => new Response(null, { status: 503 });
    await expect(likes.readLikeCounts([a, b])).rejects.toThrow();
    answer = async keys => Response.json({ counts: Object.fromEntries(keys.map(key => [key, 2])) });
    await likes.readLikeCounts([a, b]);
    expect(asked).toEqual([
      [a, b],
      [a, b]
    ]);
    expect(likes.likeCount(b, 0)).toBe(2);
  });

  it("keeps a settled like's count a quarter of an hour over list data read before it", async () => {
    const view = { style: "linearGradient", steps: 7, angle: 90 } as const;
    const a = seed();
    state.showView(
      { likes: new Map([[a, { seed: a, ...view, at: NOW, likes: 9 }]]), collections: new Map() },
      new Map([[a, true]])
    );
    state.tellSettled([{ seed: a, liked: true, likesCount: 9, view }]);
    expect(likes.likeCount(a, 8)).toBe(9);
    expect(JSON.parse(kept.get("grabient-like-counts") ?? "{}")[a]).toEqual({ count: 9, at: NOW });
    // after a reload, over list data the edge read a minute before the like: the like's count, a task later
    const b = seed();
    kept.set("grabient-like-counts", JSON.stringify({ [b]: { count: 9, at: NOW } }));
    likes.noteCounts([{ seed: b, likes: 8 }], NOW - 60_000);
    expect(likes.likeCount(b, 8)).toBe(8);
    await vi.advanceTimersByTimeAsync(0);
    expect(likes.likeCount(b, 8)).toBe(9);
    // a quarter of an hour on, data read then stands
    vi.setSystemTime(NOW + 16 * 60_000);
    likes.noteCounts([{ seed: b, likes: 10 }], NOW + 16 * 60_000);
    expect(likes.likeCount(b, 8)).toBe(10);
  });
});
