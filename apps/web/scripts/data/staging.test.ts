import type { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import { loadStatements } from "./load.ts";
import type { Snapshot } from "./snapshot.ts";
import { stagingCopy } from "./staging.ts";
import { A, B, copyOf, lite, memory, NOW, production, run, snapshotOf } from "./testing.ts";
import { type Check, verifyStaging } from "./verify.ts";

let source: { production: Snapshot; lite: Snapshot };
let full: Snapshot;
let copy: Snapshot;
let db: DatabaseSync;
const one = (sql: string) => db.prepare(sql).get() as Record<string, unknown>;
const all = (sql: string) => db.prepare(sql).all() as Record<string, unknown>[];
const column = (sql: string) => all(sql).map(row => Object.values(row)[0]);

beforeAll(async () => {
  source = { production: await production(), lite: await lite() };
  full = await snapshotOf((await copyOf(source)).db, 1000);
  copy = await stagingCopy(full, source.lite, NOW);
  /* loaded as load.ts loads grabient-staging */
  db = memory(loadStatements(copy));
});

describe("staging's copy", () => {
  it("keeps the admins, grabient-lite's among them, the personas and the accounts the site's work names", () => {
    expect(column("SELECT id FROM auth_user ORDER BY id")).toEqual([
      "LF",
      "PA",
      "PB",
      "byline-1",
      "persona-ash"
    ]);
    expect(column("SELECT role FROM auth_user WHERE id IN ('PA', 'PB')")).toEqual([
      "admin",
      "admin"
    ]);
    expect(one("SELECT actor_id FROM k_contributions WHERE id = 'x2'").actor_id).toBe("LF");
  });

  it("keeps a kept account whole: its link without tokens, likes with their context, collections, votes and record", () => {
    expect(one("SELECT user_id, access_token, id_token FROM auth_account")).toEqual({
      user_id: "PA",
      access_token: null,
      id_token: null
    });
    expect(
      one(`SELECT query, collection_id FROM k_likes WHERE user_id = 'PA' AND palette_id = '${B}'`)
    ).toEqual({ query: "blue", collection_id: "c1" });
    expect(column("SELECT user_id FROM likes")).toEqual(["PA"]);
    expect(column("SELECT id FROM refine_sessions")).toEqual(["r1"]);
    expect(column("SELECT id FROM k_collections WHERE owner_id = 'PA' ORDER BY id")).toEqual([
      "c3",
      "c6"
    ]);
    expect(column("SELECT user_id FROM k_collection_votes")).toEqual(["PA"]);
    expect(column("SELECT user_id FROM k_search_votes")).toEqual(["PA"]);
    expect(one("SELECT COUNT(*) AS n FROM k_queue").n).toBe(2);
    expect(one("SELECT COUNT(*) AS n FROM k_likes WHERE user_id = 'persona-ash'").n).toBe(1);
  });

  it("leaves out every other account with every row of its own and its private collections", () => {
    const gone = "('PU', 'PJ1234567890xyz', 'LX')";
    for (const [table, account] of [
      ["auth_user", "id"],
      ["auth_account", "user_id"],
      ["likes", "user_id"],
      ["k_likes", "user_id"],
      ["k_collection_votes", "user_id"],
      ["k_search_votes", "user_id"],
      ["k_sync_log", "account_id"],
      ["k_collections", "owner_id"]
    ]) {
      expect(one(`SELECT COUNT(*) AS n FROM ${table} WHERE ${account} IN ${gone}`).n, table).toBe(
        0
      );
    }
    expect(column("SELECT DISTINCT account_id FROM k_sync_log ORDER BY 1")).toEqual([
      "PA",
      "persona-ash"
    ]);
    expect(
      one("SELECT COUNT(*) AS n FROM k_collection_items WHERE collection_id IN ('c2', 'c4')").n
    ).toBe(0);
  });

  it("keeps their likes in the counts, and every count and score as the full build wrote it", () => {
    const fullPalettes = new Map(full.rows("k_palettes").map(p => [p.seed, p]));
    for (const palette of copy.rows("k_palettes")) {
      const was = fullPalettes.get(palette.seed)!;
      for (const c of ["likes_count", "hot", "rising", "rising_3m", "rising_1y"]) {
        expect(palette[c], `${palette.seed} ${c}`).toBe(was[c]);
      }
    }
    /* the reader's like and the second account's are the two of A that left */
    expect(
      one(`SELECT legacy_likes_count, likes_count FROM k_palettes WHERE seed = '${A}'`)
    ).toEqual({
      legacy_likes_count: Number(fullPalettes.get(A)!.legacy_likes_count) + 2,
      likes_count: fullPalettes.get(A)!.likes_count
    });
    expect(
      all(
        "SELECT seed FROM k_palettes p WHERE likes_count <> legacy_likes_count + (SELECT COUNT(*) FROM k_likes l WHERE l.palette_id = p.seed)"
      )
    ).toEqual([]);
    /* a copy the reader held still counts, as production counts it */
    expect(one("SELECT fork_count FROM k_collections WHERE id = 'c1'").fork_count).toBe(2);
  });

  it("keeps a left-out account's public collection under its byline alone", () => {
    expect(one("SELECT owner_kind, owner_id FROM k_collections WHERE id = 'c5'")).toEqual({
      owner_kind: "user",
      owner_id: "byline-1"
    });
    expect(
      one("SELECT email, email_verified, name, username, role FROM auth_user WHERE id = 'byline-1'")
    ).toEqual({
      email: "byline-1@bylines.grabient.invalid",
      email_verified: 0,
      name: "Johnny R.",
      username: "johnny",
      role: "user"
    });
    expect(column("SELECT seed FROM k_collection_items WHERE collection_id = 'c5'")).toEqual([B]);
    expect(one("SELECT title FROM k_translations WHERE key = 'c5'").title).toBe("Lesers Auswahl");
    expect(one("SELECT COUNT(*) AS n FROM auth_account WHERE user_id = 'byline-1'").n).toBe(0);
  });

  it("clears what pointed at a collection left out", () => {
    expect(
      one(`SELECT collection_id FROM k_likes WHERE user_id = 'PA' AND palette_id = '${A}'`)
    ).toEqual({ collection_id: null });
    expect(one("SELECT forked_from, forked_base FROM k_collections WHERE id = 'c6'")).toEqual({
      forked_from: null,
      forked_base: null
    });
  });

  it("turns off the newsletter and session replay, and keeps every other switch", () => {
    expect(all("SELECT name, enabled, updated_by FROM k_flags ORDER BY name")).toEqual([
      { name: "newsletter", enabled: 0, updated_by: null },
      { name: "rising-3m", enabled: 0, updated_by: "PA" },
      { name: "session-replay", enabled: 0, updated_by: null }
    ]);
  });

  it("shows grabient-lite's tags and the counts behind them, a collection's only where it shows the collection", () => {
    expect(column("SELECT value FROM k_popular_searches ORDER BY kind, position")).toEqual([
      "reader-picks",
      "blue"
    ]);
    expect(all("SELECT day, page, words, count FROM k_search_counts")).toEqual([
      { day: 1, page: "home", words: "blue", count: 3 }
    ]);
  });

  it("holds no session, sign-in link, newsletter row or reader's own signal", () => {
    for (const table of [
      "auth_session",
      "auth_verification",
      "k_newsletter",
      "k_search_unread",
      "k_palette_use",
      "k_sync_clients"
    ]) {
      expect(one(`SELECT COUNT(*) AS n FROM ${table}`).n, table).toBe(0);
    }
  });
});

describe("staging's checks", () => {
  const failed = (checks: Check[]) => checks.filter(c => c.status === "fail").map(c => c.name);
  /** The loaded copy with `tamper` done to it, read back and checked. */
  const checked = async (tamper: (db: DatabaseSync) => void = () => {}) => {
    const loaded = memory(loadStatements(copy));
    tamper(loaded);
    return verifyStaging(await snapshotOf(loaded, 1000), full, source.lite, { local: copy });
  };

  it("pass the copy, as loaded", async () => {
    expect(failed(await checked())).toEqual([]);
  });

  it.each([
    [
      "a left-out account's email in a note",
      "UPDATE k_collection_notes SET text = 'ask reader@example.test'",
      "left out"
    ],
    [
      "a left-out account's private address",
      "UPDATE k_reviews SET subject = 'collection:@_lx/mine'",
      "left out"
    ],
    [
      "a left-out account",
      "INSERT INTO auth_user (id, email, name, role, created_at, updated_at) VALUES ('PU', 'reader@example.test', '', 'user', 1, 1)",
      "accounts"
    ],
    ["a persona's like lost", "DELETE FROM k_likes WHERE user_id = 'persona-ash'", "rows"],
    [
      "a count off",
      `UPDATE k_palettes SET likes_count = likes_count + 1 WHERE seed = '${A}'`,
      "counts and scores"
    ],
    ["a score off", `UPDATE k_palettes SET hot = hot + 1 WHERE seed = '${B}'`, "counts and scores"],
    [
      "a session",
      "INSERT INTO auth_session (id, expires_at, token, created_at, updated_at, user_id) VALUES ('s', 1, 't', 1, 1, 'PA')",
      "nothing private"
    ],
    ["a token", "UPDATE auth_account SET refresh_token = 'x'", "nothing private"],
    [
      "a reader's unread search",
      "INSERT INTO k_search_unread (day, page, words, count) VALUES (1, 'home', 'x', 1)",
      "nothing private"
    ],
    ["the newsletter on", "UPDATE k_flags SET enabled = 1 WHERE name = 'newsletter'", "switches"],
    ["an admin who is not one", "UPDATE auth_user SET role = 'user' WHERE id = 'PB'", "admins"],
    [
      "a tag of a collection it does not show",
      "INSERT INTO k_popular_searches (kind, position, value, words, score, computed_at) VALUES ('collections', 2, 'nowhere', 'nowhere', 1, 1)",
      "search tags"
    ],
    ["an index dropped", "DROP INDEX k_palettes_hot_idx", "schema"]
  ])("fail a copy with %s", async (_, sql, name) => {
    expect(failed(await checked(tampered => run(tampered, [sql])))).toContain(name);
  });
});
