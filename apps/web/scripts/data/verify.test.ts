import type { DatabaseSync } from "node:sqlite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ALIASES,
  B,
  copyOf,
  lite,
  NOW,
  ORIGINALS,
  production,
  run,
  type Sources,
  snapshotOf,
  unloaded
} from "./testing.ts";
import { type Check, verify } from "./verify.ts";

let source: Sources;
beforeAll(async () => {
  source = { production: await production(), lite: await lite(), staging: await unloaded() };
});

/** The copy with `tamper` done to it, checked. */
async function checked(tamper: (db: DatabaseSync) => void = () => {}) {
  const { db } = await copyOf(source);
  tamper(db);
  const copy = await snapshotOf(db, 1000);
  return verify(copy, source.production, source.lite, {
    aliases: ALIASES,
    originals: ORIGINALS,
    now: NOW
  });
}
const failed = (checks: Check[]) => checks.filter(c => c.status === "fail").map(c => c.name);

describe("verify", () => {
  it("passes the copy build.ts makes, naming the palette production holds with no seed", async () => {
    const checks = await checked();
    expect(failed(checks)).toEqual([]);
    expect(checks.find(c => c.status === "warn")?.detail).toContain("_old4");
  });

  it.each([
    [
      "a collection's palettes out of order",
      "UPDATE k_collection_items SET position = 1 - position WHERE collection_id = 'c1'",
      "grabient-lite's collections"
    ],
    ["a token", "UPDATE auth_account SET id_token = 'x' WHERE id = 'acc-PU'", "sign-in secrets"],
    [
      "a like of a palette the gallery lacks",
      "INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at) VALUES ('PU', 'kAzzzz', 3, 'linearGradient', 0, 1)",
      "orphans"
    ],
    [
      "a count off",
      `UPDATE k_palettes SET likes_count = likes_count + 1 WHERE seed = '${B}'`,
      "counts and sums"
    ],
    ["a score off", `UPDATE k_palettes SET rising = rising + 1 WHERE seed = '${B}'`, "scores"],
    [
      "a translation lost",
      "DELETE FROM k_translations WHERE kind = 'tag'",
      "grabient-lite's k_translations"
    ],
    [
      "a migration unrecorded",
      "DELETE FROM d1_migrations WHERE name = '0054_search_unread.sql'",
      "migrations"
    ],
    ["an index dropped", "DROP INDEX k_palettes_hot_idx", "schema"]
  ])("fails a copy with %s", async (_, sql, name) => {
    expect(failed(await checked(db => run(db, [sql])))).toContain(name);
  });

  it("reads a schema the way D1 stores it, without the comments of its statements", async () => {
    const { db } = await copyOf(source);
    const copy = await snapshotOf(db, 1000);
    const schema = copy.schema.map(e => ({
      ...e,
      sql: e.sql?.replace(/^\s*--.*$/gm, "  ") ?? null
    }));
    const checks = verify({ ...copy, schema }, source.production, source.lite, {
      aliases: ALIASES,
      originals: ORIGINALS,
      now: NOW
    });
    expect(failed(checks)).toEqual([]);
  });

  it("holds a copy to the local one row for row", async () => {
    const { db } = await copyOf(source);
    const local = await snapshotOf(db, 1000);
    const against = async () =>
      failed(
        verify(await snapshotOf(db, 1000), source.production, source.lite, {
          aliases: ALIASES,
          originals: ORIGINALS,
          now: NOW,
          local
        })
      );
    expect(await against()).toEqual([]);
    run(db, ["UPDATE k_reviews SET note = 'moved'"]);
    expect(await against()).toContain("the local copy");
  });
});
