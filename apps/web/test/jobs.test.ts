/// <reference types="vite/client" />
import { run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { afterEach, expect, test, vi } from "vitest";
import config from "../cloudflare.config.ts?raw";
import { JOBS, runSteps, SIX_HOURS, TEN_MINUTES } from "../src/server/jobs.ts";
import { githubStars } from "../src/server/seo/stars.ts";
import { count, makeAccount, type TestEnv, testEnv, unique } from "./helpers.ts";

const DAY = 86_400_000;
const SEED = "kS7Q8Yy5S_SChv0";

afterEach(() => vi.restoreAllMocks());

/** A job run with the console quiet: the names of the steps that logged, in order. */
async function logged(env: TestEnv, schedule: string): Promise<string[]> {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  log.mockClear();
  await JOBS[schedule]!(env);
  return log.mock.calls.map(([name]) => String(name));
}

test("every schedule in cloudflare.config.ts has its job, to the character", () => {
  const schedules = [...config.matchAll(/schedule: "([^"]+)"/g)].map(match => match[1]);
  expect(schedules.sort()).toEqual(Object.keys(JOBS).sort());
});

test("each job runs these steps, in this order", () => {
  // the owner hears of a failing site before anything a failing database holds; IndexNow lists what the queue just
  // published; the snapshot is built from what both left
  expect(Object.keys(TEN_MINUTES)).toEqual([
    "failing site",
    "github stars",
    "seeding queue",
    "indexnow",
    "search snapshot"
  ]);
  // the scores take the most queries of a run, so every other step has had its own by then
  expect(Object.keys(SIX_HOURS)).toEqual([
    "database statistics",
    "expired sign-in rows",
    "connected apps past keeping",
    "client documents",
    "sign-in digest",
    "search counts past keeping",
    "palette use past keeping",
    "account sync past keeping",
    "popular searches",
    "scheduled searches past keeping",
    "scores"
  ]);
});

test("a failing step lets the rest run, and the job fails at the end", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const ran: string[] = [];
  const steps = {
    queue: async () => {
      ran.push("queue");
      throw new Error("D1 is down");
    },
    quiet: async () => {
      ran.push("quiet");
    },
    indexnow: async () => {
      ran.push("indexnow");
      return { sent: 3 };
    }
  };
  await expect(runSteps("every ten minutes", steps, {} as Env)).rejects.toThrow(
    "every ten minutes: 1 of its steps failed"
  );
  expect(ran).toEqual(["queue", "quiet", "indexnow"]);
  expect(error).toHaveBeenCalledWith("queue: the step failed", "D1 is down");
  // a step with nothing to say logs nothing
  expect(log.mock.calls).toEqual([["indexnow", '{"sent":3}']]);
});

test("every six hours: what is past keeping goes, the Popular tags and the scores are written", async () => {
  const env = testEnv();
  const now = Date.now();
  const today = Math.floor(now / DAY);
  const account = await makeAccount(env);
  const old = now - 200 * DAY;
  await env.DB.batch(
    [
      `INSERT INTO auth_session (id, token, user_id, expires_at, created_at, updated_at)
       VALUES ('${unique("s")}', '${unique("t")}', '${account.id}', ${now - 1}, ${old}, ${old})`,
      `INSERT INTO auth_verification (id, identifier, value, expires_at, created_at, updated_at)
       VALUES ('${unique("v")}', 'gone', 'x', ${now - 1}, ${old}, ${old}),
              ('${unique("v")}', 'kept', 'x', ${now + DAY}, ${now}, ${now})`,
      `INSERT INTO k_search_counts (day, page, words, count)
       VALUES (${today - 91}, 'palettes', 'blue', 9), (${today}, 'palettes', 'blue', 5)`,
      `INSERT INTO k_search_unread (day, page, words, count) VALUES (${today - 91}, 'palettes', 'zorp', 1)`,
      `INSERT INTO k_palette_use (day, seed, action, surface, count)
       VALUES (${today - 91}, '${SEED}', 'open', 'palettes', 1), (${today}, '${SEED}', 'open', 'palettes', 1)`,
      `INSERT INTO k_sync_log (account_id, kind, key, at)
       VALUES ('${account.id}', 'like', 'a', ${now - 31 * DAY}), ('${account.id}', 'like', 'b', ${now})`,
      `INSERT INTO k_scheduled_searches (id, words, starts_at, ends_at, created_at)
       VALUES ('${unique("e")}', 'ended', ${old}, ${now - 31 * DAY}, ${old}),
              ('${unique("e")}', 'standing', ${now}, ${now + DAY}, ${now})`,
      `INSERT INTO k_palettes (seed, style, steps, angle, created_at)
       VALUES ('${SEED}', 'linearGradient', 7, 90, ${now - 400 * DAY})`,
      `INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at)
       VALUES ('${account.id}', '${SEED}', 7, 'linearGradient', 90, ${now})`
    ].map(sql => env.DB.prepare(sql))
  );
  // no saved client document can be read from here: each is counted unreachable, and nobody is told for a week
  const asked = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => new Response(null, { status: 503 }));

  const steps = await logged(env, "5 */6 * * *");

  const left = (table: string, where = "1") =>
    count(env, `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`);
  expect(await left("auth_session", `user_id = '${account.id}'`)).toBe(1);
  expect(await left("auth_verification", "identifier IN ('gone', 'kept')")).toBe(1);
  expect(await left("k_search_counts", "words = 'blue'")).toBe(1);
  expect(await left("k_search_unread")).toBe(0);
  expect(await left("k_palette_use")).toBe(1);
  expect(await left("k_sync_log", "key = 'a'")).toBe(0);
  expect(await left("k_sync_log", "key = 'b'")).toBe(1);
  expect(await left("k_scheduled_searches", "words IN ('ended', 'standing')")).toBe(1);
  expect(await left("k_popular_searches", "kind = 'palettes' AND value = 'blue'")).toBe(1);
  expect(await left("k_palettes", `seed = '${SEED}' AND hot > 0`)).toBe(1);
  expect(asked.mock.calls.map(([url]) => String(url))).toContain(
    "https://claude.ai/oauth/mcp-oauth-client-metadata"
  );
  expect(steps).toEqual([
    "expired sign-in rows",
    "client documents",
    "sign-in digest",
    "search counts past keeping",
    "palette use past keeping",
    "account sync past keeping",
    "popular searches",
    "scheduled searches past keeping",
    "scores"
  ]);
});

test("every ten minutes: the star count is kept and the search's snapshot is built from what is public", async () => {
  // counts that show nothing failing: the check has nothing to say
  const env = testEnv({ ANALYTICS: { query: async () => ({ data: [] }) } });
  await run(
    env.DB,
    `INSERT OR IGNORE INTO k_palettes (seed, style, steps, angle, created_at)
     VALUES (?, 'linearGradient', 7, 90, ?)`,
    SEED,
    Date.now()
  );
  vi.spyOn(globalThis, "fetch").mockImplementation(async input =>
    String(input instanceof Request ? input.url : input).startsWith("https://api.github.com/repos/")
      ? Response.json({ stargazers_count: 4321 })
      : new Response(null, { status: 503 })
  );

  // nothing is due in the queue, and a deploy that is not production's sends no list to the search engines
  expect(await logged(env, "*/10 * * * *")).toEqual(["github stars", "search snapshot"]);

  expect(await githubStars(env)).toBe(4321);
  expect((await env.SEARCH_SNAPSHOTS?.list())?.objects).toHaveLength(1);
  // a day's count and an unchanged site leave the next run nothing to say
  expect(await logged(env, "*/10 * * * *")).toEqual([]);
});
