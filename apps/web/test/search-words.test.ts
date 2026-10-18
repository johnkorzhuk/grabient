import { run } from "@grabient/server/db/d1.ts";
import { describe, expect, it } from "vitest";
import { searchPalettes } from "../src/server/search/search.ts";
import { shippedSnapshot } from "../src/server/search/snapshot.ts";
import { readMark, syncSnapshot } from "../src/server/search/sync.ts";
import {
  freshIsolate,
  makeAccount,
  makeAdmin,
  seedOf,
  type TestEnv,
  testEnv,
  unique
} from "./helpers.ts";

/* The search as a database's own rows make it, through the schedule's build and a fresh isolate's read of the stored
   copy: whose words for their palettes it reads, the mark that says when to build, and the collection-mates that lead
   the palettes like a palette. */

/* palettes in the gallery, enough of them that the nearest twelfth of the site is a few palettes deep */
async function gallery(env: TestEnv, seeds: readonly string[]) {
  const now = Date.now();
  await env.DB.batch(
    seeds.map(seed =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO k_palettes (seed, style, steps, angle, created_at) VALUES (?, 'linearGradient', 7, 90, ?)"
      ).bind(seed, now)
    )
  );
}

type Owner = { kind: "agent" | "user"; id: string };
const GRABIENT: Owner = { kind: "agent", id: "a" };

/* a collection of these palettes in order, as its owner keeps it, each given these words */
async function collection(
  env: TestEnv,
  owner: Owner,
  visibility: "public" | "private",
  title: string,
  seeds: readonly string[],
  words: { title?: string; description?: string } = {}
) {
  const now = Date.now();
  const id = unique("c").replace(/[^a-z0-9]/g, "");
  await run(
    env.DB,
    `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, description, tags, visibility, item_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', '[]', ?, ?, ?, ?)`,
    id,
    `c-${id}`,
    owner.kind,
    owner.id,
    title,
    visibility,
    seeds.length,
    now,
    now
  );
  for (const [position, seed] of seeds.entries())
    await run(
      env.DB,
      `INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at, title, description)
       VALUES (?, ?, ?, 'linearGradient', 7, 90, ?, ?, ?)`,
      id,
      position,
      seed,
      now,
      words.title ?? null,
      words.description ?? null
    );
  return id;
}

/* a word no vocabulary, title or tag holds */
const word = (stem: string) => `zq${stem}${crypto.randomUUID().replace(/[^a-f]/g, "")}`;

/* the stored copy as text, after the build the schedule's next run makes */
async function built(env: TestEnv): Promise<string> {
  expect(await syncSnapshot(env)).toMatchObject({ status: "built" });
  const stored = await env.SEARCH_SNAPSHOTS!.get("snapshot-v1.bin");
  return new TextDecoder().decode(await stored!.arrayBuffer()).toLowerCase();
}

describe("the words public collections give their palettes", () => {
  it("are searched where anyone may read them, Grabient's and an admin's, and never leave D1 otherwise", async () => {
    const env = testEnv();
    const admin = await makeAdmin(env);
    const person = await makeAccount(env);
    const theirs = { kind: "user", id: person.id } as const;
    const admins = { kind: "user", id: admin.id } as const;
    const cases = [
      { who: "Grabient's", owner: GRABIENT, visibility: "public", read: true },
      { who: "an admin's", owner: admins, visibility: "public", read: true },
      // public as no write of a person's could make it, so the words alone keep it to them
      { who: "a person's", owner: theirs, visibility: "public", read: false },
      { who: "an admin's private", owner: admins, visibility: "private", read: false },
      { who: "a person's private", owner: theirs, visibility: "private", read: false }
    ] as const;
    const given = [];
    for (const [i, c] of cases.entries()) {
      const seed = seedOf(`#${i}a${i}f4c`, "#f2c14e", `#1b${i}98b`);
      const words = [word("t"), `Zq${word("n")}`, `Zq${word("n")}`];
      const description = `Home gold of the ${words[1]}, at the ${words[2]}.`;
      await collection(env, c.owner, c.visibility, unique("Words"), [seed], {
        title: words[0],
        description
      });
      given.push({ ...c, seed, words });
    }
    const stored = await built(env);
    for (const c of given)
      for (const w of c.words)
        expect([c.who, w, stored.includes(w.toLowerCase())]).toEqual([c.who, w, c.read]);
    const isolate = freshIsolate(env);
    for (const c of given)
      for (const w of c.words) {
        const { tier, items } = await searchPalettes(isolate, w);
        expect([c.who, w, tier, items[0]?.kseed, items[0]?.lead]).toEqual(
          c.read ? [c.who, w, "named", c.seed, true] : [c.who, w, "account", undefined, undefined]
        );
      }
  });

  it("join the palette's written title, and a word of either finds it from a fresh isolate", async () => {
    const env = testEnv();
    const admin = await makeAdmin(env);
    const seed = seedOf("#3d1f5c", "#f2c14e", "#1b998b");
    const [written, given] = [word("w"), word("t")];
    await run(
      env.DB,
      "INSERT INTO k_palette_texts (seed, title, embed, created_at, updated_at) VALUES (?, ?, '', ?, ?)",
      seed,
      written,
      Date.now(),
      Date.now()
    );
    await collection(env, { kind: "user", id: admin.id }, "public", unique("Words"), [seed], {
      title: given
    });
    await built(env);
    const isolate = freshIsolate(env);
    for (const w of [written, given]) {
      const { tier, items } = await searchPalettes(isolate, w);
      expect([w, tier, items[0]?.kseed, items[0]?.lead]).toEqual([w, "named", seed, true]);
    }
  });

  it("leave the next build once the owner is no admin, and come back with the role; a new title and a private collection rebuild too", async () => {
    const env = testEnv();
    const admin = await makeAdmin(env);
    const seed = seedOf("#5a2d82", "#f2c14e", "#1b998b");
    const [first, second, name] = [word("t"), word("t"), `Zq${word("n")}`];
    const id = await collection(
      env,
      { kind: "user", id: admin.id },
      "public",
      "Tide lines",
      [seed],
      {
        title: first,
        description: `Home gold of the ${name}.`
      }
    );
    const role = (to: string) =>
      run(env.DB, "UPDATE auth_user SET role = ? WHERE id = ?", to, admin.id);
    // the title and the name its description writes
    const held = (stored: string) => [first, name.toLowerCase()].map(w => stored.includes(w));
    expect(held(await built(env))).toEqual([true, true]);
    await role("user");
    expect(held(await built(env))).toEqual([false, false]);
    await role("admin");
    expect(held(await built(env))).toEqual([true, true]);

    // as every app path writes a palette's words: with the collection's time
    await run(
      env.DB,
      "UPDATE k_collection_items SET title = ? WHERE collection_id = ?",
      second,
      id
    );
    await run(
      env.DB,
      "UPDATE k_collections SET updated_at = ? WHERE id = ?",
      Date.now() + 1000,
      id
    );
    const renamed = await built(env);
    expect([renamed.includes(first), renamed.includes(second)]).toEqual([false, true]);
    expect((await searchPalettes(freshIsolate(env), second)).items[0]?.kseed).toBe(seed);

    await run(
      env.DB,
      "UPDATE k_collections SET visibility = 'private', updated_at = ? WHERE id = ?",
      Date.now() + 2000,
      id
    );
    expect((await built(env)).includes(second)).toBe(false);
    expect((await searchPalettes(freshIsolate(env), second)).tier).toBe("account");
  });
});

describe("a palette's collection-mates", () => {
  it("lead the palettes like it from the built copy, and a palette an admin voted out of the collection is no mate and takes its words with it", async () => {
    const env = testEnv();
    await gallery(env, (await shippedSnapshot(env)).seeds.slice(0, 40));
    const [first, kept, out] = [
      seedOf("#0b1d3a", "#4a6fa5", "#c9d6ea"),
      seedOf("#0c1e3c", "#4b70a7", "#cad7eb"),
      seedOf("#0a1c39", "#496ea4", "#c8d5e9")
    ];
    // the one voted out stays in the gallery, as near as the one kept
    await gallery(env, [out]);
    const id = await collection(env, GRABIENT, "public", "Harbor blues", [first, kept, out]);
    // words for the one kept and for the one voted out, which leave the build with it
    const given = async (seed: string) => {
      const words = [word("t"), `Zq${word("n")}`];
      await run(
        env.DB,
        "UPDATE k_collection_items SET title = ?, description = ? WHERE collection_id = ? AND seed = ?",
        words[0],
        `Home gold of the ${words[1]}.`,
        id,
        seed
      );
      return words;
    };
    const [keptWords, outWords] = [await given(kept), await given(out)];
    const admin = await makeAdmin(env);
    await run(
      env.DB,
      "INSERT INTO k_collection_votes (collection_id, seed, user_id, vote, created_at, updated_at) VALUES (?, ?, ?, -1, ?, ?)",
      id,
      out,
      admin.id,
      Date.now(),
      Date.now()
    );
    const stored = await built(env);
    const held = (words: string[]) => words.map(w => stored.includes(w.toLowerCase()));
    expect([held(keptWords), held(outWords)]).toEqual([
      [true, true],
      [false, false]
    ]);

    const { tier, items } = await searchPalettes(freshIsolate(env), first, { limit: 96 });
    expect(tier).toBe("similar");
    expect(items.filter(item => item.lead).map(item => item.kseed)).toEqual([kept]);
    expect(items.find(item => item.kseed === out)).toMatchObject({ kseed: out });
    expect(items.find(item => item.kseed === out)?.lead).toBeUndefined();
  });
});

describe("the mark the schedule compares", () => {
  it("counts the public collections whose words anyone may read, so an owner's role change builds again", async () => {
    const env = testEnv();
    const owner = await makeAdmin(env);
    await collection(env, { kind: "user", id: owner.id }, "public", "Tide lines", [
      seedOf("#123456", "#abcdef")
    ]);
    const role = (to: string) =>
      run(env.DB, "UPDATE auth_user SET role = ? WHERE id = ?", to, owner.id);
    expect(await syncSnapshot(env)).toMatchObject({ status: "built" });
    const before = await readMark(env.DB, "v1");
    // the model's version, the file's format and twelve numbers
    expect(before.split(":")).toHaveLength(14);

    await role("user");
    const demoted = await readMark(env.DB, "v1");
    expect(demoted).not.toBe(before);
    expect(demoted.split(":").slice(0, -1)).toEqual(before.split(":").slice(0, -1));
    expect(await syncSnapshot(env)).toMatchObject({ status: "built" });
    expect(await syncSnapshot(env)).toMatchObject({ status: "unchanged" });

    await role("admin");
    expect(await readMark(env.DB, "v1")).toBe(before);
    expect(await syncSnapshot(env)).toMatchObject({ status: "built" });
  });
});
