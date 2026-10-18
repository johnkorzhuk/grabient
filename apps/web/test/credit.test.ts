import { encodePalette } from "@grabient/engine/codec.ts";
import { randomPalette } from "@grabient/engine/random.ts";
import { first, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { describe, expect, it } from "vitest";
import { creditResponse } from "../src/server/account/credit.ts";
import { checkUsername, saveUsername } from "../src/server/account/profile.ts";
import { clefState, fitToShow, refusedName } from "../src/server/account/screen.ts";
import { creditsOf, paletteCreditResponse } from "../src/server/gallery/credit.ts";
import { bodyOf, get, makeAccount, makeAdmin, ORIGIN, post, testEnv, unique } from "./helpers.ts";

/* A palette's credit over the real migrations: who brought it to Grabient, the username an account turns on for the
   palettes it liked first, and the checks a name passes before it shows. Clef is a stand-in that answers as told. */

/** Workers AI as a test tells it to answer: Clef's yes for each name it reads, or a failure. */
function clef(answer: (state: string) => number | Error = () => 0.02) {
  const read: string[] = [];
  const ai = {
    run: async (model: string, input: { state: string }) => {
      read.push(`${model} ${input.state}`);
      const said = answer(input.state);
      if (said instanceof Error) throw said;
      return {
        model: "clef",
        answers: { offensive: { type: "noul", noul: said } },
        usage: { input_tokens: 265, output_tokens: 0 }
      };
    }
  } as unknown as Ai;
  return { ai, read };
}
const fresh = () => encodePalette(randomPalette());
/** A username no other test holds. */
const handle = (stem: string) => `${stem}${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;

/** A JSON request with any method, from the site's own page. */
function json(method: string, path: string, body: unknown, cookie?: string) {
  const headers = new Headers({ "Content-Type": "application/json", Origin: ORIGIN });
  if (cookie) headers.set("Cookie", cookie);
  return new Request(new URL(path, ORIGIN), { method, headers, body: JSON.stringify(body) });
}
const choice = async (env: Env, cookie: string, on?: boolean) => {
  const answer = await creditResponse(
    on === undefined
      ? get("/api/me/credit", { cookie })
      : json("PUT", "/api/me/credit", { on }, cookie),
    env
  );
  return [answer.status, await answer.json()];
};
const rename = async (env: Env, cookie: string, username: string) => {
  const answer = await saveUsername(post("/api/settings/username", { username }, { cookie }), env);
  return [answer.status, await answer.json()];
};

const like = (env: Env, userId: string, seed: string, at: number) =>
  run(
    env.DB,
    `INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at)
     VALUES (?, ?, 7, 'linearGradient', 90, ?)`,
    userId,
    seed,
    at
  );
const gallery = (env: Env, seed: string, at: number) =>
  run(
    env.DB,
    `INSERT INTO k_palettes (seed, style, steps, angle, created_at) VALUES (?, 'linearGradient', 7, 90, ?)`,
    seed,
    at
  );
/** A public collection of Grabient's holding the palette since `at`. */
async function grabients(env: Env, seed: string, at: number) {
  const id = unique("credit");
  await run(
    env.DB,
    `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, visibility, created_at, updated_at)
     VALUES (?, ?, 'agent', 'seeder', 'Credit', 'public', ?, ?)`,
    id,
    id,
    at,
    at
  );
  await run(
    env.DB,
    `INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle, created_at)
     VALUES (?, 0, ?, 'linearGradient', 7, 90, ?)`,
    id,
    seed,
    at
  );
}
/** An account with a username, shown on palettes where `shown`. */
async function named(env: Env, shown: boolean) {
  const account = await makeAccount(env);
  const username = handle("ada");
  await run(
    env.DB,
    "UPDATE auth_user SET username = ?, credit_name = ? WHERE id = ?",
    username,
    shown ? username : null,
    account.id
  );
  return { ...account, username };
}

describe("a username's checks", () => {
  it("the list refuses slurs, hate codes and the harshest words, and no real name", () => {
    for (const name of [
      "fuck_you",
      "fuckface99",
      "sh1thead",
      "n1gger",
      "kkk_member",
      "88heil",
      "sieg_heil",
      "heil-hitler",
      "jo_1488",
      "kys",
      "kill-yourself",
      "gasthejews",
      "spic",
      "pajeet"
    ])
      expect(refusedName(name), name).toBe(true);
    for (const name of [
      "Scunthorpe",
      "dick_van_dyke",
      "Fukuoka",
      "shiitake_lover",
      "ashit_patel",
      "Sexton",
      "cocktailhour",
      "spicy_mango",
      "sarah1988",
      "mike88",
      "alex_14",
      "Hubert_Heil",
      "Middlesex",
      "assassin_creed",
      "peacock99"
    ])
      expect(refusedName(name), name).toBe(false);
  });

  it("Clef reads a name and the name its digits spell, within the account's hour of checks", async () => {
    expect(clefState("maya")).toBe("Username: maya");
    expect(clefState("sh1t4ke")).toBe("Username: sh1t4ke\nIts digits read as letters: shitake");
    const told = clef(state => (state.includes("vulgar") ? 0.91 : 0.04));
    const env = testEnv({ AI: told.ai });
    const id = unique("screen");
    expect(await fitToShow(env, "maya", id)).toBe("fit");
    expect(await fitToShow(env, "so_vulgar", id)).toBe("unfit");
    // a listed word is refused before Clef is asked
    expect(await fitToShow(env, "kkk_member", id)).toBe("unfit");
    expect(told.read).toEqual([
      "@cf/cloudflare/clef Username: maya",
      "@cf/cloudflare/clef Username: so_vulgar"
    ]);
    // nothing shows where Clef cannot answer: down, missing, or past the account's ten an hour
    const down = testEnv({ AI: clef(() => new Error("down")).ai });
    expect(await fitToShow(down, "maya", unique("screen"))).toBe("unchecked");
    expect(await fitToShow(testEnv({ AI: undefined }), "maya", unique("screen"))).toBe("unchecked");
    for (let i = 0; i < 8; i++) expect(await fitToShow(env, `maya${i}`, id)).toBe("fit");
    expect(await fitToShow(env, "maya9", id)).toBe("unchecked");
  });

  it("Settings refuses a listed name as it is typed and saved", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const check = await checkUsername(
      post("/api/settings/username/check", { username: "fuck_you" }, { cookie: ada.cookie }),
      env
    );
    expect(await check.json()).toEqual({
      available: false,
      problem: "That username isn't allowed."
    });
    expect(await rename(env, ada.cookie, "sh1thead")).toEqual([
      400,
      { error: "That username isn't allowed." }
    ]);
    expect(await rename(env, ada.cookie, handle("Fukuoka"))).toEqual([200, { success: true }]);
  });
});

describe("an account's name on palettes", () => {
  it("starts off, needs a username, turns on once the name is fit to show and off at a press", async () => {
    const env = testEnv({ AI: clef().ai });
    const ada = await makeAccount(env);
    expect(await choice(env, ada.cookie)).toEqual([200, { on: false }]);
    expect(await choice(env, ada.cookie, true)).toEqual([
      409,
      { error: "Add a username in Profile to turn this on." }
    ]);
    const username = handle("ada");
    expect(await rename(env, ada.cookie, username)).toEqual([200, { success: true }]);
    expect(await choice(env, ada.cookie, true)).toEqual([200, { on: true }]);
    expect(await choice(env, ada.cookie)).toEqual([200, { on: true }]);
    expect(await first(env.DB, "SELECT credit_name FROM auth_user WHERE id = ?", ada.id)).toEqual({
      credit_name: username
    });
    expect(await choice(env, ada.cookie, false)).toEqual([200, { on: false }]);
    expect(await choice(env, ada.cookie)).toEqual([200, { on: false }]);
    // a name Clef holds offensive stays off, and so does one it could not read
    const refused = testEnv({ AI: clef(() => 0.97).ai });
    expect(await choice(refused, ada.cookie, true)).toEqual([
      422,
      { error: "This username can't be shown on palettes. Choose another to turn this on." }
    ]);
    const down = testEnv({ AI: clef(() => new Error("down")).ai });
    expect(await choice(down, ada.cookie, true)).toEqual([
      503,
      { error: "Couldn't check the username. Try again." }
    ]);
    expect(await choice(env, ada.cookie)).toEqual([200, { on: false }]);
  });

  it("refuses a request that is no switch's", async () => {
    const env = testEnv({ AI: clef().ai });
    const ada = await makeAccount(env);
    const refused = async (request: Request) => {
      const answer = await creditResponse(request, env);
      return [answer.status, ((await answer.json()) as { error: string }).error];
    };
    expect(await refused(get("/api/me/credit"))).toEqual([401, "Sign in to continue."]);
    expect(
      await refused(
        new Request(`${ORIGIN}/api/me/credit`, {
          method: "PUT",
          headers: { Cookie: ada.cookie, Origin: "https://elsewhere.test" },
          body: JSON.stringify({ on: true })
        })
      )
    ).toEqual([403, "Invalid request."]);
    expect(await refused(json("PUT", "/api/me/credit", { on: "yes" }, ada.cookie))).toEqual([
      400,
      'Send { "on": true or false }.'
    ]);
    expect(await refused(json("POST", "/api/me/credit", { on: true }, ada.cookie))).toEqual([
      405,
      "Method not allowed"
    ]);
  });

  it("shows a new username once Clef finds it fit, and else turns the switch off", async () => {
    const env = testEnv({ AI: clef(state => (state.includes("rude") ? 0.95 : 0.03)).ai });
    const ada = await named(env, true);
    const kept = handle("ada");
    expect(await rename(env, ada.cookie, kept)).toEqual([200, { success: true, credit: "kept" }]);
    expect(await choice(env, ada.cookie)).toEqual([200, { on: true }]);
    expect(await rename(env, ada.cookie, handle("rude"))).toEqual([
      200,
      { success: true, credit: "unfit" }
    ]);
    expect(await choice(env, ada.cookie)).toEqual([200, { on: false }]);
    // with the switch off, a rename asks nothing and says nothing of it
    expect(await rename(env, ada.cookie, handle("ada"))).toEqual([200, { success: true }]);
    const down = testEnv({ AI: clef(() => new Error("down")).ai });
    const bob = await named(down, true);
    expect(await rename(down, bob.cookie, handle("bob"))).toEqual([
      200,
      { success: true, credit: "unchecked" }
    ]);
    expect(await choice(down, bob.cookie)).toEqual([200, { on: false }]);
  });
});

describe("a palette's credit", () => {
  it("goes to Grabient where it showed or liked the palette first, else to the first like that stands", async () => {
    const env = testEnv();
    const admin = await makeAdmin(env);
    const ada = await named(env, true);
    const bob = await named(env, false);
    const cy = await named(env, true);
    const [liked, shown, later, hidden, held, none, renamed, unliked] = Array.from(
      { length: 8 },
      fresh
    );
    // an admin's like first, then a person's
    await like(env, admin.id, liked!, 100);
    await like(env, ada.id, liked!, 200);
    // Grabient's collection showed it before the first like
    await grabients(env, shown!, 50);
    await like(env, ada.id, shown!, 100);
    // a person liked it before Grabient's collection took it
    await like(env, ada.id, later!, 100);
    await grabients(env, later!, 200);
    // a person who shows no name liked it first: no one, never the next
    await like(env, bob.id, hidden!, 100);
    await like(env, ada.id, hidden!, 200);
    // in the gallery with no like at all: Grabient published it
    await gallery(env, held!, 100);
    // a like taken back hands the credit to the next
    await like(env, cy.id, unliked!, 100);
    await like(env, ada.id, unliked!, 200);
    await run(env.DB, "DELETE FROM k_likes WHERE user_id = ? AND palette_id = ?", cy.id, unliked);
    // a name changed since it was checked shows nothing
    const dan = await named(env, true);
    await like(env, dan.id, renamed!, 100);
    await run(env.DB, "UPDATE auth_user SET username = ? WHERE id = ?", handle("dan"), dan.id);
    const credits = await creditsOf(env, [
      liked!,
      shown!,
      later!,
      hidden!,
      held!,
      none!,
      renamed!,
      unliked!
    ]);
    expect(
      Object.fromEntries(
        [liked, shown, later, hidden, held, none, renamed, unliked].map((seed, i) => [
          i,
          credits.get(seed!)
        ])
      )
    ).toEqual({
      0: { by: "grabient" },
      1: { by: "grabient" },
      2: { by: "person", name: ada.username },
      3: null,
      4: { by: "grabient" },
      5: null,
      6: null,
      7: { by: "person", name: ada.username }
    });
  });

  it("answers a palette's address, kept half a minute at the edge, and refuses what is no palette's", async () => {
    const env = testEnv();
    const ada = await named(env, true);
    const seed = fresh();
    await like(env, ada.id, seed, 100);
    const answer = await paletteCreditResponse(get(`/api/palette-credit?seed=${seed}`), env);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("CDN-Cache-Control")).toBe("max-age=30");
    expect(await bodyOf(answer)).toEqual({ credit: { by: "person", name: ada.username } });
    const nobody = await paletteCreditResponse(get(`/api/palette-credit?seed=${fresh()}`), env);
    expect(await bodyOf(nobody)).toEqual({ credit: null });
    for (const address of ["/api/palette-credit", "/api/palette-credit?seed=not-a-palette"]) {
      expect((await paletteCreditResponse(get(address), env)).status).toBe(404);
    }
  });
});
