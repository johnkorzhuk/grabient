import { encodePalette } from "@grabient/engine";
import { anchorsFromHexes } from "@grabient/engine/spec.ts";
import { run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { setFlag } from "@grabient/server/flags/flags.ts";
import { describe, expect, it } from "vitest";
import { accountSearchResponse } from "../src/server/search/account.ts";
import {
  pruneSearchCounts,
  refreshPopular,
  searchedResponse
} from "../src/server/search/counts.ts";
import {
  listScheduled,
  pruneScheduled,
  removeScheduled,
  scheduleSearches
} from "../src/server/search/schedule.ts";
import { searchPalettes } from "../src/server/search/search.ts";
import { snapshotStatus } from "../src/server/search/snapshot.ts";
import { syncSnapshot } from "../src/server/search/sync.ts";
import { popularSearches } from "../src/server/search/tags.ts";
import { searchVotesResponse } from "../src/server/search/votes.ts";
import {
  address,
  bodyOf,
  count,
  get,
  makeAccount,
  post,
  type TestEnv,
  testEnv,
  unique,
  watchLimits
} from "./helpers.ts";

const DAY = 86_400_000;
const today = () => Math.floor(Date.now() / DAY);
const seedOf = (...hexes: string[]) => encodePalette(anchorsFromHexes(hexes)!);

/* the same bindings seen by another isolate: its own assets binding, so it holds no snapshot or files yet */
const freshIsolate = (env: TestEnv): TestEnv => ({
  ...env,
  ASSETS: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => env.ASSETS.fetch(input, init)
  } as Fetcher
});

/* a binding seen through a new object, as another isolate holds it, with every call it makes told to `heard` */
function overheard<T extends object>(
  binding: T,
  heard: (name: string, args: unknown[]) => void = () => {}
): T {
  return new Proxy(binding, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        heard(String(key), args);
        return value.apply(target, args);
      };
    }
  });
}

describe("counting a search made with Enter", () => {
  const counted = (env: Env, table: string, words: string, page = "palettes") =>
    count(
      env,
      `SELECT COALESCE(SUM(count), 0) AS n FROM ${table} WHERE day = ? AND page = ? AND words = ?`,
      today(),
      page,
      words
    );
  const send = (
    env: Env,
    words: unknown,
    init: Parameters<typeof post>[2] & { page?: unknown } = {}
  ) => searchedResponse(post("/api/searched", { words, page: init.page ?? "palettes" }, init), env);

  it("counts known words once per address, page and day, as their tag says them", async () => {
    const env = testEnv();
    const ip = address();
    const before = await counted(env, "k_search_counts", "sunset");
    expect((await send(env, "atardecer", { ip })).status).toBe(204);
    await send(env, "Sunset", { ip });
    await send(env, "sunset", { ip, page: "home" });
    expect(await counted(env, "k_search_counts", "sunset")).toBe(before + 1);
    expect(await counted(env, "k_search_counts", "sunset", "home")).toBeGreaterThanOrEqual(1);
    await send(env, "sunset", { ip: address() });
    expect(await counted(env, "k_search_counts", "sunset")).toBe(before + 2);
  });

  it("counts other words apart, and only letters", async () => {
    const env = testEnv();
    const words = `zorblax ${unique("w").replace(/[^a-z]/g, "")}`;
    await send(env, words, { ip: address() });
    expect(await counted(env, "k_search_unread", words)).toBe(1);
    for (const kept of ["12345 blue", "🍆💦", "https://example.test/a"])
      await send(env, kept, { ip: address() });
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM k_search_unread WHERE words IN ('12345 blue', '🍆💦')"
      )
    ).toBe(0);
  });

  it("counts nothing from another site, a crawler, another page or a body that is not one", async () => {
    const env = testEnv();
    const before = await counted(env, "k_search_counts", "cyberpunk");
    expect((await searchedResponse(get("/api/searched"), env)).status).toBe(405);
    expect((await searchedResponse(get("/api/searched"), env)).headers.get("Allow")).toBe("POST");
    await send(env, "cyberpunk", { origin: "https://elsewhere.test" });
    await send(env, "cyberpunk", { origin: null });
    await send(env, "cyberpunk", { headers: { "User-Agent": "Googlebot/2.1" } });
    await send(env, "cyberpunk", { page: "saved" });
    await send(env, "", {});
    await send(env, "cyberpunk ".repeat(120), {});
    expect(await counted(env, "k_search_counts", "cyberpunk")).toBe(before);
  });

  it("counts thirty searches an hour from one address, and an IPv6 /64 is one address", async () => {
    const env = testEnv();
    const ip = address();
    const letters = (i: number) =>
      `qxzv${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`;
    for (let i = 0; i < 31; i++) await send(env, letters(i), { ip });
    expect(await counted(env, "k_search_unread", letters(29))).toBe(1);
    expect(await counted(env, "k_search_unread", letters(30))).toBe(0);
    const net = address().replace(/::1$/, "");
    const words = `qxzvnet ${unique("n").replace(/[^a-z]/g, "")}`;
    await send(env, words, { ip: `${net}::1` });
    await send(env, words, { ip: `${net}::2` });
    expect(await counted(env, "k_search_unread", words)).toBe(1);
  });

  it("keeps no count past ninety days", async () => {
    const env = testEnv();
    const words = unique("old");
    for (const table of ["k_search_counts", "k_search_unread"]) {
      for (const day of [today() - 90, today() - 89]) {
        await run(
          env.DB,
          `INSERT INTO ${table} (day, page, words, count) VALUES (?, 'palettes', ?, 1)`,
          day,
          words
        );
      }
    }
    expect(await pruneSearchCounts(env)).toBeGreaterThanOrEqual(2);
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_search_counts WHERE words = ?", words)
    ).toBe(1);
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_search_unread WHERE words = ?", words)
    ).toBe(1);
  });

  it("writes the Popular tags once a day from the last four weeks", async () => {
    const env = testEnv();
    const now = Date.now();
    for (const [ago, n] of [
      [0, 4],
      [2, 5],
      [12, 1]
    ]) {
      await run(
        env.DB,
        "INSERT INTO k_search_counts (day, page, words, count) VALUES (?, 'palettes', 'halloween', ?) ON CONFLICT DO UPDATE SET count = excluded.count",
        today() - ago,
        n
      );
    }
    const report = await refreshPopular(env, { now, force: true });
    expect(report.ran).toBe(true);
    expect(report.rising).toContain("halloween");
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_popular_searches WHERE kind = 'palettes'")
    ).toBe(48);
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_popular_searches WHERE computed_at = ?", now)
    ).toBeGreaterThan(48);
    expect((await refreshPopular(env, { now: now + 60_000 })).ran).toBe(false);
  });
});

describe("search fit votes", () => {
  const seed = seedOf("#112233", "#ddeeff");

  it("are an account's own, read and cast for one search's words", async () => {
    const env = testEnv();
    const { cookie } = await makeAccount(env);
    const signedOut = await searchVotesResponse(get("/api/me/search-votes?q=sunset"), env);
    expect([signedOut.status, await bodyOf(signedOut)]).toEqual([
      401,
      { error: "Sign in to continue." }
    ]);
    expect(signedOut.headers.get("Cache-Control")).toBe("private, no-store");

    const vote = (body: unknown, init: Parameters<typeof post>[2] = {}) =>
      searchVotesResponse(post("/api/me/search-votes", body, { cookie, ...init }), env);
    const read = async (q: string) =>
      bodyOf<{ votes: Record<string, string> }>(
        await searchVotesResponse(
          get(`/api/me/search-votes?q=${encodeURIComponent(q)}`, { cookie }),
          env
        )
      );

    expect(await read("sunset")).toEqual({ votes: {} });
    const cast = await vote({ q: "  Sunset ", seed, vote: "up" });
    expect([cast.status, await bodyOf(cast)]).toEqual([200, { q: "sunset", seed, vote: "up" }]);
    expect(await read("SUNSET")).toEqual({ votes: { [seed]: "up" } });
    await vote({ q: "sunset", seed, vote: "down" });
    expect(await read("sunset")).toEqual({ votes: { [seed]: "down" } });
    await vote({ q: "sunset", seed, vote: null });
    expect(await read("sunset")).toEqual({ votes: {} });
    expect(await read("")).toEqual({ votes: {} });
  });

  it("refuses another site, a palette that is none, and a vote that is neither", async () => {
    const env = testEnv();
    const { cookie } = await makeAccount(env);
    const vote = (body: unknown, init: Parameters<typeof post>[2] = {}) =>
      searchVotesResponse(post("/api/me/search-votes", body, { cookie, ...init }), env);
    expect(
      (await vote({ q: "blue", seed, vote: "up" }, { origin: "https://elsewhere.test" })).status
    ).toBe(403);
    for (const body of [
      { q: "blue", seed: "nope", vote: "up" },
      { q: "blue", seed, vote: "maybe" },
      { q: "", seed, vote: "up" },
      { q: "blue", seed }
    ]) {
      const refused = await vote(body);
      expect([refused.status, await bodyOf(refused)]).toEqual([400, { error: "Invalid vote." }]);
    }
    expect(
      (
        await searchVotesResponse(
          new Request("https://grabient.test/api/me/search-votes", { method: "DELETE" }),
          env
        )
      ).status
    ).toBe(405);
  });

  it("count against the account's fit votes and the site's day", async () => {
    const watched = watchLimits(testEnv());
    const { cookie } = await makeAccount(watched.env);
    await searchVotesResponse(
      post("/api/me/search-votes", { q: "blue", seed, vote: "up" }, { cookie }),
      watched.env
    );
    expect(watched.asked).toEqual(["fitVote", "fitVoteDaily", "searchVotesSite"]);
  });

  it("wait while an admin has saving off, and the account's votes still read", async () => {
    const { env, asked } = watchLimits(testEnv());
    const account = await makeAccount(env);
    const vote = () =>
      searchVotesResponse(
        post("/api/me/search-votes", { q: "teal", seed, vote: "up" }, { cookie: account.cookie }),
        env
      );
    await setFlag(env, "saving", false, unique("admin"));
    try {
      const paused = await vote();
      expect([paused.status, paused.headers.get("Retry-After"), await bodyOf(paused)]).toEqual([
        503,
        "300",
        { error: "Couldn't save." }
      ]);
      expect(asked).toEqual([]);
      expect(
        await count(env, "SELECT COUNT(*) AS n FROM k_search_votes WHERE user_id = ?", account.id)
      ).toBe(0);
      const read = await searchVotesResponse(
        get("/api/me/search-votes?q=teal", { cookie: account.cookie }),
        env
      );
      expect([read.status, await bodyOf(read)]).toEqual([200, { votes: {} }]);
    } finally {
      await setFlag(env, "saving", true, unique("admin"));
    }
    expect((await vote()).status).toBe(200);
  });
});

describe("an account's own search", () => {
  it("answers a signed-in account alone, and never kept", async () => {
    const env = testEnv();
    const signedOut = await accountSearchResponse(get("/api/me/search?q=blue"), env);
    expect(signedOut.status).toBe(401);
    const { cookie } = await makeAccount(env);
    const answer = await accountSearchResponse(
      get("/api/me/search?q=blue&limit=3", { cookie }),
      env
    );
    expect(answer.status).toBe(200);
    expect(answer.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await bodyOf(answer)).toMatchObject({ query: "blue", tier: "vocabulary" });
  });

  it("buys words nothing free reads from the account's own allowance", async () => {
    const watched = watchLimits(testEnv());
    const AI = {
      run: async (_: string, input: { text: string[] }) => ({
        data: input.text.map(() => Array.from({ length: 768 }, (_, i) => Math.sin(i)))
      })
    } as unknown as Ai;
    const env = { ...watched.env, AI };
    const { cookie } = await makeAccount(env);
    const answer = await accountSearchResponse(
      get(`/api/me/search?q=${unique("zxq").replace(/[^a-z]/g, "")}`, { cookie }),
      env
    );
    expect(await bodyOf(answer)).toMatchObject({ tier: "model" });
    expect(watched.asked).toEqual(["searchAccount", "searchAccountDaily", "searchBudget"]);
  });
});

describe("the snapshot kept current", () => {
  it("builds when something public changes, idles on one query and one look at R2, and isolates find it", async () => {
    const env = testEnv();
    const now = Date.now();
    const gallery = [
      seedOf("#ff0099", "#00ffcc", "#3300ff"),
      seedOf("#123456", "#fedcba"),
      seedOf("#000000", "#ffffff")
    ];
    const member = seedOf("#ffcc00", "#cc00ff", "#00ccff");
    for (const [i, seed] of gallery.entries()) {
      await run(
        env.DB,
        "INSERT INTO k_palettes (seed, style, steps, angle, created_at) VALUES (?, 'linearGradient', 7, 90, ?)",
        seed,
        now + i
      );
    }
    await run(
      env.DB,
      "INSERT INTO k_palette_texts (seed, title, embed, created_at, updated_at) VALUES (?, 'Zorblax fizz', '', ?, ?)",
      gallery[0],
      now,
      now
    );
    await run(
      env.DB,
      `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, description, tags, visibility, item_count, created_at, updated_at)
       VALUES ('c-quib', 'quibble-nights', 'agent', 'a', 'Quibble nights', '', '["glimmerwave"]', 'public', 1, ?, ?)`,
      now,
      now
    );
    await run(
      env.DB,
      "INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at) VALUES ('c-quib', 0, ?, 'radialSwatches', 3, 90, ?)",
      member,
      now
    );

    const built = await syncSnapshot(env);
    expect(built).toMatchObject({
      status: "built",
      palettes: 4,
      measured: 4,
      titled: 1,
      collections: 1
    });
    const meta = (await env.SEARCH_SNAPSHOTS!.head("snapshot-v1.bin"))?.customMetadata;
    expect(meta).toMatchObject({ palettes: "4", collections: "1", pending: "0" });

    // an idle run reads the counts once and the stored copy's metadata once, and writes nothing
    const queries: string[] = [];
    const store: string[] = [];
    const DB = overheard(env.DB, (name, args) => {
      if (name === "prepare") queries.push(String(args[0]));
    });
    const SEARCH_SNAPSHOTS = overheard(env.SEARCH_SNAPSHOTS!, name => {
      store.push(name);
    });
    expect(await syncSnapshot({ ...env, DB, SEARCH_SNAPSHOTS })).toMatchObject({
      status: "unchanged"
    });
    expect(queries.filter(sql => !sql.includes("k_flags"))).toHaveLength(1);
    expect(store).toEqual(["head"]);

    // an isolate takes the stored copy, and finds the new palettes by title, tag and colors with no model
    const isolate = freshIsolate(env);
    expect(await snapshotStatus(isolate)).toMatchObject({
      available: true,
      from: "store",
      palettes: 4,
      titled: 1
    });
    const byTitle = await searchPalettes(isolate, "zorblax");
    expect(byTitle.tier).toBe("named");
    expect(byTitle.items[0].kseed).toBe(gallery[0]);
    const byTag = await searchPalettes(isolate, "glimmerwave");
    expect(byTag.items[0]).toMatchObject({
      kseed: member,
      style: "radialSwatches",
      tags: ["quibble nights"]
    });
    const byColors = await searchPalettes(isolate, "#ff0099 #00ffcc #3300ff");
    expect(byColors.items[0].kseed).toBe(gallery[0]);

    // a title written moves the mark; a palette gone from D1 is never shown, whatever the snapshot holds
    await run(
      env.DB,
      "UPDATE k_palette_texts SET title = 'Zorblax fizz two', updated_at = ? WHERE seed = ?",
      now + 10,
      gallery[0]
    );
    expect(await syncSnapshot(env)).toMatchObject({ status: "built" });
    await run(env.DB, "DELETE FROM k_palettes WHERE seed = ?", gallery[1]);
    const gone = await searchPalettes(freshIsolate(env), gallery[1]);
    expect(gone.items.map(item => item.kseed)).not.toContain(gallery[1]);
  });

  it("refuses a build that lost most of its palettes, and stops while updates are off", async () => {
    const env = testEnv();
    await run(env.DB, "DELETE FROM k_palettes");
    await run(env.DB, "DELETE FROM k_collection_items");
    expect(await syncSnapshot(env)).toMatchObject({ status: "skipped" });
    expect(
      (await env.SEARCH_SNAPSHOTS!.head("snapshot-v1.bin"))?.customMetadata?.palettes
    ).not.toBe("0");

    await run(
      env.DB,
      "INSERT INTO k_flags (name, enabled, updated_at) VALUES ('search-rebuild', 0, ?)",
      Date.now()
    );
    const later = { ...env, DB: overheard(env.DB) };
    expect(await syncSnapshot(later)).toMatchObject({
      status: "skipped",
      reason: "search index updates are off"
    });
    await run(env.DB, "DELETE FROM k_flags");
  });

  it("embeds collections' words only while search by meaning is on", async () => {
    const env = testEnv();
    const now = Date.now();
    const id = unique("c").replace(/[^a-z0-9]/g, "");
    await run(
      env.DB,
      `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, description, tags, visibility, item_count, created_at, updated_at)
       VALUES (?, ?, 'agent', 'a', 'Moonlit harbor', 'Cold blues at night', '[]', 'public', 1, ?, ?)`,
      id,
      `moonlit-harbor-${id}`,
      now,
      now
    );
    await run(
      env.DB,
      "INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at) VALUES (?, 0, ?, 'linearGradient', 7, 90, ?)",
      id,
      seedOf("#0b1d3a", "#4a6fa5", "#c9d6ea"),
      now
    );
    const asked: string[] = [];
    const AI = {
      run: async (model: string, input: { text: string[] }) => {
        asked.push(model);
        return { data: input.text.map(() => null) };
      }
    } as unknown as Ai;
    await setFlag(env, "model-search", false, unique("admin"));
    try {
      expect(await syncSnapshot({ ...env, AI }, { force: true })).toMatchObject({
        status: "built",
        embedded: 0
      });
      expect(asked).toEqual([]);
    } finally {
      await setFlag(env, "model-search", true, unique("admin"));
    }
    expect(await syncSnapshot({ ...env, AI }, { force: true })).toMatchObject({ status: "built" });
    expect(asked.length).toBeGreaterThan(0);
  });
});

describe("searches scheduled to lead the tags", () => {
  it("keeps only what the vocabulary answers as one phrase, between sensible dates, and leads the row with it", async () => {
    const env = testEnv();
    const now = Date.now();
    const label = unique("batch");
    const { scheduled, refused } = await scheduleSearches(
      env,
      "admin-1",
      [
        { words: "Christmas" },
        { words: "zxqvyk wqrkk" },
        { words: "winter", from: "not a day" },
        { words: "spring", from: new Date(now + 401 * DAY).toISOString() },
        { words: "summer", from: "2026-01-01", until: "2026-12-31" },
        { words: "autumn", until: new Date(now - DAY).toISOString() }
      ],
      label,
      now
    );
    expect(scheduled).toBe(1);
    expect(refused.map(r => r.why)).toEqual([
      "The site does not answer these words as one search of its vocabulary.",
      "from and until are a day (2026-10-20) or a moment (ISO 8601).",
      "It starts more than 400 days ahead.",
      "It stands longer than 120 days.",
      "It ends before it starts, or has ended already."
    ]);
    expect((await listScheduled(env, now)).map(s => [s.words, s.label])).toContainEqual([
      "christmas",
      label
    ]);
    expect((await popularSearches({ ...env, DB: overheard(env.DB) }, 3))[0].query).toBe(
      "christmas"
    );
    expect(await removeScheduled(env, { label })).toBe(1);
    expect((await listScheduled(env, now)).map(s => s.label)).not.toContain(label);
  });

  it("forgets what ended a month ago", async () => {
    const env = testEnv();
    const now = Date.now();
    await run(
      env.DB,
      "INSERT INTO k_scheduled_searches (id, words, starts_at, ends_at, created_at) VALUES (?, 'ocean', ?, ?, ?)",
      unique("old")
        .replace(/[^a-z0-9]/g, "")
        .padEnd(20, "0")
        .slice(0, 20),
      now - 60 * DAY,
      now - 31 * DAY,
      now
    );
    expect(await pruneScheduled(env, now)).toBeGreaterThanOrEqual(1);
  });
});
