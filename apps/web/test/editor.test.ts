import { decodePalette } from "@grabient/engine";
import { messageKey } from "@grabient/i18n";
import { run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import * as v from "valibot";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { collectionItem } from "../src/features/collections/schema.ts";
import { PaletteFacts } from "../src/features/editor/facts.ts";
import { Saved, Standing } from "../src/features/editor/save.ts";
import { paletteAnswer } from "../src/server/collections/palettes.ts";
import { createCollection } from "../src/server/collections/write.ts";
import { paletteFacts, paletteFactsResponse } from "../src/server/editor/facts.ts";
import {
  type Account,
  bodyOf,
  makeAccount,
  makeAdmin,
  ORIGIN,
  testEnv,
  unique
} from "./helpers.ts";

/* What the editor asks the server: what only the database knows of a palette, for its page, and where a palette
   stands for an admin's Save, read by the page's own schemas from the routes themselves. */

const item = (seed: string) =>
  collectionItem({ seed, style: "linearGradient", steps: 7, angle: 90 })!;
const gallery = (env: Env, seed: string) =>
  run(
    env.DB,
    "INSERT INTO k_palettes (seed, style, steps, angle, likes_count, created_at) VALUES (?, 'linearGradient', 7, 90, 0, ?) ON CONFLICT DO NOTHING",
    seed,
    Date.now()
  );
const holding = (env: Env, title: string, seeds: string[], visibility: "public" | "private") =>
  createCollection(
    env,
    { kind: "agent", id: "grabient" },
    { title, description: "", tags: [], visibility, items: seeds.map(item) }
  );

let env: Env;
beforeAll(() => {
  env = testEnv();
});

describe("a palette's facts", () => {
  const SEED = "kWs2um4jE-G62O7xwb3bkk-4";
  const OTHER = "kY4mpDazO-mUuu_fuLqXU49dvVP6";
  const palette = decodePalette(SEED)!;

  it("names the public collections that hold it, each with its colors, and no private one", async () => {
    const shown = await holding(env, unique("Held in public"), [SEED, OTHER], "public");
    const hidden = await holding(env, unique("Held in private"), [SEED], "private");
    const facts = await paletteFacts(SEED, palette, "en", env);
    const slugs = facts?.heldBy.map(c => c.slug);
    expect(slugs).toContain(shown.slug);
    expect(slugs).not.toContain(hidden.slug);
    const held = facts?.heldBy.find(c => c.slug === shown.slug);
    expect(held?.title).toBe(shown.title);
    expect(held?.english).toBeUndefined();
    expect(held?.colors.length).toBeGreaterThan(0);
    for (const color of held?.colors ?? []) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("titles a collection in the page's language while its translation is of the English it has", async () => {
    const current = await holding(env, unique("Translated"), [SEED], "public");
    const stale = await holding(env, unique("Translated before"), [SEED], "public");
    const translate = (slug: string, title: string, source: string) =>
      run(
        env.DB,
        "INSERT INTO k_translations (kind, locale, key, title, source, updated_at) SELECT 'collection', 'ja', id, ?, ?, 1 FROM k_collections WHERE slug = ?",
        title,
        source,
        slug
      );
    await translate(current.slug, "いまの題", messageKey(`${current.title}\n`));
    await translate(stale.slug, "むかしの題", messageKey("Another title\n"));
    const facts = await paletteFacts(SEED, palette, "ja", env);
    expect(facts?.heldBy.find(c => c.slug === current.slug)).toMatchObject({
      title: "いまの題",
      english: current.title
    });
    expect(facts?.heldBy.find(c => c.slug === stale.slug)).toMatchObject({ title: stale.title });
    const english = await paletteFacts(SEED, palette, "en", env);
    expect(english?.heldBy.find(c => c.slug === current.slug)?.title).toBe(current.title);
  });

  it("keeps the words written for it only while its colors bear them out", async () => {
    const write = (title: string, embed: string) =>
      run(
        env.DB,
        "INSERT INTO k_palette_texts (seed, title, embed, created_at, updated_at) VALUES (?, ?, ?, 1, 1) ON CONFLICT (seed) DO UPDATE SET title = excluded.title, embed = excluded.embed",
        SEED,
        title,
        embed
      );
    await write("Evening study", "A quiet set of colors for a reading room.");
    expect((await paletteFacts(SEED, palette, "en", env))?.written).toEqual({
      title: "Evening study",
      description: "A quiet set of colors for a reading room."
    });
    /* a black and white palette is no palette of these colors */
    const gray = decodePalette("kSyQDAzZa8zgZxS")!;
    await run(
      env.DB,
      "INSERT INTO k_palette_texts (seed, title, embed, created_at, updated_at) VALUES ('kSyQDAzZa8zgZxS', ?, '', 1, 1) ON CONFLICT (seed) DO UPDATE SET title = excluded.title",
      titleAgainst(gray)
    );
    expect((await paletteFacts("kSyQDAzZa8zgZxS", gray, "en", env))?.written).toBeUndefined();
  });

  it("answers a browser that opens it with its facts in English, kept at the edge as its page is", async () => {
    const shown = await holding(env, unique("Held for the browser"), [SEED], "public");
    await run(
      env.DB,
      "INSERT INTO k_palette_texts (seed, title, embed, created_at, updated_at) VALUES (?, 'Evening study', '', 1, 1) ON CONFLICT (seed) DO UPDATE SET title = excluded.title, embed = excluded.embed",
      SEED
    );
    const ask = (query: string) =>
      paletteFactsResponse(new Request(`${ORIGIN}/api/palette-facts?${query}`), env);
    const answered = await ask(`seed=${SEED}`);
    expect([answered.status, answered.headers.get("CDN-Cache-Control")]).toEqual([
      200,
      "max-age=86400"
    ]);
    const facts = v.parse(PaletteFacts, await answered.json());
    expect(facts.written?.title).toBe("Evening study");
    expect(facts.heldBy.map(c => c.slug)).toContain(shown.slug);
    for (const query of ["seed=nope", "seed=", ""]) expect((await ask(query)).status).toBe(404);
  });

  it("says nothing of a palette a failed read left out, and answers a browser that no cache may keep it", async () => {
    // a replica that fails every query
    const DB = new Proxy(env.DB, {
      get(target, key) {
        if (key === "withSession")
          return () => ({
            prepare: () => {
              throw new Error("D1 is unavailable");
            }
          });
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await paletteFacts(SEED, palette, "en", { DB })).toBeNull();
    const answered = await paletteFactsResponse(
      new Request(`${ORIGIN}/api/palette-facts?seed=${SEED}`),
      { DB }
    );
    expect(answered.status).toBe(503);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("counts its likes, its heart's first count, and none for a palette the gallery does not hold", async () => {
    await run(
      env.DB,
      "INSERT INTO k_palettes (seed, style, steps, angle, likes_count, created_at) VALUES (?, 'linearGradient', 7, 90, 12, 1) ON CONFLICT (seed) DO UPDATE SET likes_count = 12",
      SEED
    );
    expect((await paletteFacts(SEED, palette, "en", env)).likes).toBe(12);
    const unheld = decodePalette("kSyQDAzZa8zgZxS")!;
    expect((await paletteFacts("kSyQDAzZa8zgZxS", unheld, "en", env)).likes).toBe(0);
  });
});

/** A title naming a color the palette has none of: the first of these its own colors contradict. */
function titleAgainst(palette: NonNullable<ReturnType<typeof decodePalette>>): string {
  const hues = palette.anchors.map(a => ((a.h % 360) + 360) % 360);
  const far = (hue: number) =>
    hues.every(h => Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue)) > 90);
  return far(145) ? "Emerald green forest" : far(265) ? "Deep blue ocean" : "Bright red poppy";
}

describe("an admin's Save", () => {
  const send = (method: string, seed: string, who: Account, body?: unknown) =>
    paletteAnswer(
      new Request(new URL(`/api/me/palettes/${seed}`, ORIGIN), {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: ORIGIN,
          Cookie: who.cookie,
          "CF-Connecting-IP": "2001:db8::e"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      }),
      env
    );
  let admin: Account;
  beforeAll(async () => {
    admin = await makeAdmin(env);
  });

  it("reads where a palette stands as the route answers it", async () => {
    const seed = "kWQgLgpgm9q-WwC8F0DyY3GQ";
    await gallery(env, seed);
    const held = await holding(env, unique("Holds the saved"), [seed], "public");
    const standing = v.parse(Standing, await bodyOf(await send("GET", seed, admin)));
    expect(standing).toMatchObject({ seed, gallery: {}, liked: false });
    expect(standing.collections).toContainEqual({ slug: held.slug, title: held.title });

    const reader = await makeAccount(env);
    await run(
      env.DB,
      "INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at) VALUES (?, ?, 7, 'linearGradient', 90, 1)",
      reader.id,
      seed
    );
    expect(v.parse(Standing, await bodyOf(await send("GET", seed, admin))).liked).toBe(true);
    /* a palette a person liked stays, and the refusal says why in words the page shows */
    const refused = await send("PUT", seed, admin, { seed: "kamzkm1gtFdWRyrLHcJuB9B6KaQgOlEGg" });
    expect(refused.status).toBe(409);
    expect((await bodyOf<{ error: string }>(refused)).error).toBe(
      "Someone liked this palette, so it stays."
    );
  });

  it("reads a palette nobody holds as having nowhere to go", async () => {
    const standing = v.parse(
      Standing,
      await bodyOf(await send("GET", "kUTScEtiTAU0aQhmjsHg", admin))
    );
    expect(standing).toMatchObject({ gallery: null, collections: [], liked: false });
  });

  it("reads the palette a save leaves in the old one's place", async () => {
    const seed = "kY7xXr748zmabv9fMUJU7O_8rGwW";
    const next = "kcuYzbUNVAdnPQznJsXe7PJnu2v58qkA_Zc_4";
    await gallery(env, seed);
    const answer = await send("PUT", seed, admin, { seed: next });
    expect(answer.status).toBe(200);
    expect(v.parse(Saved, await bodyOf(answer)).palette.seed).toBe(next);
    expect(v.parse(Standing, await bodyOf(await send("GET", next, admin))).gallery).toEqual({});
  });

  it("answers anyone else with a refusal no standing is read from", async () => {
    const reader = await makeAccount(env);
    const answer = await send("GET", "kWQgLgpgm9q-WwC8F0DyY3GQ", reader);
    expect(answer.status).toBe(403);
    expect(v.safeParse(Standing, await bodyOf(answer)).success).toBe(false);
  });
});
