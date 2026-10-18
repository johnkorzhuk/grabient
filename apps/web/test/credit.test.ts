import { encodePalette } from "@grabient/engine/codec.ts";
import { randomPalette } from "@grabient/engine/random.ts";
import { first, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { describe, expect, it } from "vitest";
import { readUsername } from "../src/features/account/username.ts";
import { creditResponse } from "../src/server/account/credit.ts";
import { checkUsername, saveUsername } from "../src/server/account/profile.ts";
import { clefState, fitToShow, refusedName } from "../src/server/account/screen.ts";
import { creditsOf, paletteCreditResponse } from "../src/server/gallery/credit.ts";
import { likeInput, setLike } from "../src/server/gallery/likes.ts";
import { bodyOf, get, makeAccount, makeAdmin, ORIGIN, post, testEnv, unique } from "./helpers.ts";

/* A palette's credit over the real migrations: who brought it to Grabient, the username an account turns on for the
   palettes it liked first, and the checks a name passes as it is saved and before it shows. Llama and Clef are
   stand-ins that judge as told. */

const LLAMA = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const CLEF = "@cf/cloudflare/clef";

/** Workers AI as a test tells it to judge: true refuses a name, false passes it, an Error is no answer; each model
    may judge apart. */
function models(judge: (name: string, model: string) => boolean | Error = () => false) {
  const read: string[] = [];
  const ai = {
    run: async (
      model: string,
      input: { state?: string; messages?: { role: string; content: string }[] }
    ) => {
      const name = input.state
        ? input.state.split("\n")[0]!.replace("Username: ", "")
        : input.messages!.at(-1)!.content;
      read.push(`${model} ${name}`);
      const said = judge(name, model);
      if (said instanceof Error) throw said;
      return model === CLEF
        ? { model: "clef", answers: { offensive: { type: "noul", noul: said ? 0.95 : 0.03 } } }
        : { response: said ? "Yes." : "no" };
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
const check = async (env: Env, cookie: string, username: string) =>
  (await checkUsername(post("/api/settings/username/check", { username }, { cookie }), env)).json();

/** A like, at `at` on the server's own clock as well as the reader's, and how an admin's was made. */
const like = (env: Env, userId: string, seed: string, at: number, via: string | null = null) =>
  run(
    env.DB,
    `INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at, listed_at, via)
     VALUES (?, ?, 7, 'linearGradient', 90, ?, ?, ?)`,
    userId,
    seed,
    at,
    at,
    via
  );
const gallery = (env: Env, seed: string, at: number) =>
  run(
    env.DB,
    `INSERT INTO k_palettes (seed, style, steps, angle, created_at) VALUES (?, 'linearGradient', 7, 90, ?)`,
    seed,
    at
  );
/** A collection holding the palette since `at`: an account's, else Grabient's. */
async function collect(
  env: Env,
  seed: string,
  at: number,
  owner: string | null = null,
  visibility: "public" | "private" = "public"
) {
  const id = unique("credit");
  await run(
    env.DB,
    `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Credit', ?, ?, ?)`,
    id,
    id,
    owner ? "user" : "agent",
    owner ?? "seeder",
    visibility,
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
/** A persona: an account the site's scheduled likes are made with. */
async function persona(env: Env) {
  const account = await makeAccount(env);
  await run(
    env.DB,
    "INSERT INTO k_personas (user_id, agent, handle, taste, created_at) VALUES (?, 'grabient', ?, '[]', 0)",
    account.id,
    handle("persona")
  );
  return account;
}

describe("a username's checks", () => {
  it("the list refuses slurs, stereotypes, hate codes and the harshest words, and no real name", () => {
    for (const name of [
      "fuck_you",
      "fuckface99",
      "sh1thead",
      "n1gger",
      "ni99er",
      "bitch",
      "sonofabitch",
      "gypsy_soul",
      "redneck-rides",
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
      "class_of_99",
      "Hubert_Heil",
      "Middlesex",
      "assassin_creed",
      "peacock99"
    ])
      expect(refusedName(name), name).toBe(false);
  });

  it("no one takes the site's name, or an admin's, under another spelling", async () => {
    for (const name of ["Grabient1", "grabient_staff", "GRABlENT", "gr4bi3nt", "the-grabient"])
      expect(readUsername(name).problem, name).toBe("That username is reserved.");
    expect(readUsername("grab_bient").problem).toBeNull();
    const env = testEnv();
    const owner = await makeAdmin(env);
    const theirs = handle("olaf");
    await run(env.DB, "UPDATE auth_user SET username = ? WHERE id = ?", theirs, owner.id);
    const ada = await makeAccount(env);
    const spelled = theirs.replace(/^o/, "0").replace("l", "1");
    expect(await check(env, ada.cookie, spelled)).toEqual({
      available: false,
      problem: "That username is reserved."
    });
    expect(await rename(env, ada.cookie, spelled)).toEqual([
      400,
      { error: "That username is reserved." }
    ]);
    // the admin's own name, and any other, stand
    expect(await rename(env, owner.cookie, theirs.toUpperCase())).toEqual([200, { success: true }]);
  });

  it("Llama and Clef judge a name side by side, either refusing it, within the account's hour of checks", async () => {
    expect(clefState("maya")).toBe("Username: maya");
    expect(clefState("sh1t4ke9")).toBe("Username: sh1t4ke9\nIts digits read as letters: shitakeg");
    const told = models(name => name.includes("vulgar"));
    const env = testEnv({ AI: told.ai });
    const id = unique("screen");
    expect(await fitToShow(env, "maya", id)).toBe("fit");
    expect(await fitToShow(env, "so_vulgar", id)).toBe("unfit");
    // a listed word is refused before any model is asked
    expect(await fitToShow(env, "kkk_member", id)).toBe("unfit");
    expect(told.read.sort()).toEqual(
      [`${CLEF} maya`, `${CLEF} so_vulgar`, `${LLAMA} maya`, `${LLAMA} so_vulgar`].sort()
    );
    // either judge's yes refuses; a judge with no answer leaves the name unchecked unless the other refuses it
    const split = (llama: boolean | Error, clef: boolean | Error) =>
      fitToShow(
        testEnv({ AI: models((_, model) => (model === CLEF ? clef : llama)).ai }),
        "maya",
        unique("screen")
      );
    expect(await split(true, false)).toBe("unfit");
    expect(await split(false, true)).toBe("unfit");
    expect(await split(new Error("down"), true)).toBe("unfit");
    expect(await split(new Error("down"), false)).toBe("unchecked");
    expect(await split(false, new Error("down"))).toBe("unchecked");
    // nothing passes where no model answers: missing, or past the account's ten an hour
    expect(await fitToShow(testEnv({ AI: undefined }), "maya", unique("screen"))).toBe("unchecked");
    for (let i = 0; i < 8; i++) expect(await fitToShow(env, `maya${i}`, id)).toBe("fit");
    expect(await fitToShow(env, "maya9", id)).toBe("unchecked");
  });

  it("Settings refuses a listed name as it is typed, and one the models refuse as it is saved", async () => {
    const env = testEnv({ AI: models(name => name.includes("rude")).ai });
    const ada = await makeAccount(env);
    expect(await check(env, ada.cookie, "fuck_you")).toEqual({
      available: false,
      problem: "That username isn't allowed."
    });
    for (const name of ["sh1thead", "bitch", handle("rude")])
      expect(await rename(env, ada.cookie, name), name).toEqual([
        400,
        { error: "That username isn't allowed." }
      ]);
    expect(await rename(env, ada.cookie, handle("Fukuoka"))).toEqual([200, { success: true }]);
    // with no model to answer, a name the list passes is saved, and shows on no palette until judged
    const down = testEnv({ AI: models(() => new Error("down")).ai });
    expect(await rename(down, ada.cookie, handle("rude"))).toEqual([200, { success: true }]);
  });
});

describe("an account's name on palettes", () => {
  it("starts off, needs a username, turns on once the name is fit to show and off at a press", async () => {
    const env = testEnv({ AI: models().ai });
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
    // a name a model holds unfit stays off, and so does one no model could read
    const refused = testEnv({ AI: models(() => true).ai });
    expect(await choice(refused, ada.cookie, true)).toEqual([
      422,
      { error: "This username can't be shown on palettes. Choose another to turn this on." }
    ]);
    const down = testEnv({ AI: models(() => new Error("down")).ai });
    expect(await choice(down, ada.cookie, true)).toEqual([
      503,
      { error: "Couldn't check the username. Try again." }
    ]);
    expect(await choice(env, ada.cookie)).toEqual([200, { on: false }]);
  });

  it("never shows a name an admin took off palettes, or one from before the username rules", async () => {
    const env = testEnv({ AI: models().ai });
    const ada = await named(env, false);
    await run(env.DB, "UPDATE auth_user SET credit_refused = ? WHERE id = ?", ada.username, ada.id);
    expect(await choice(env, ada.cookie, true)).toEqual([
      422,
      { error: "This username can't be shown on palettes. Choose another to turn this on." }
    ]);
    // another name is checked as any is
    expect(await rename(env, ada.cookie, handle("ada"))).toEqual([200, { success: true }]);
    expect(await choice(env, ada.cookie, true)).toEqual([200, { on: true }]);
    const old = await makeAccount(env);
    await run(
      env.DB,
      "UPDATE auth_user SET username = ? WHERE id = ?",
      `_${handle("old")}`,
      old.id
    );
    expect(await choice(env, old.cookie, true)).toEqual([
      422,
      { error: "This username can't be shown on palettes. Choose another to turn this on." }
    ]);
  });

  it("refuses a request that is no switch's", async () => {
    const env = testEnv({ AI: models().ai });
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

  it("shows a new username once the models find it fit, and else turns the switch off", async () => {
    const env = testEnv({ AI: models(name => name.includes("rude")).ai });
    const ada = await named(env, true);
    const kept = handle("ada");
    expect(await rename(env, ada.cookie, kept)).toEqual([200, { success: true, credit: "kept" }]);
    expect(await choice(env, ada.cookie)).toEqual([200, { on: true }]);
    // a name the models refuse is never saved, and the shown one stands
    expect(await rename(env, ada.cookie, handle("rude"))).toEqual([
      400,
      { error: "That username isn't allowed." }
    ]);
    expect(await choice(env, ada.cookie)).toEqual([200, { on: true }]);
    // with the switch off, a rename asks nothing of it and says nothing of it
    expect(await choice(env, ada.cookie, false)).toEqual([200, { on: false }]);
    expect(await rename(env, ada.cookie, handle("ada"))).toEqual([200, { success: true }]);
    // with no model to answer, the switch goes off until the account turns it on again
    const down = testEnv({ AI: models(() => new Error("down")).ai });
    const bob = await named(down, true);
    expect(await rename(down, bob.cookie, handle("bob"))).toEqual([
      200,
      { success: true, credit: "unchecked" }
    ]);
    expect(await choice(down, bob.cookie)).toEqual([200, { on: false }]);
    // consent carries only from the name the account showed: a stale one shows no new name
    const cy = await named(env, false);
    await run(env.DB, "UPDATE auth_user SET credit_name = 'someoneelse' WHERE id = ?", cy.id);
    expect(await rename(env, cy.cookie, handle("cy"))).toEqual([200, { success: true }]);
    expect(await choice(env, cy.cookie)).toEqual([200, { on: false }]);
  });
});

describe("a palette's credit", () => {
  it("goes to Grabient where its collection held the palette first, an admin with no username where they liked it first, else to the first like that stands", async () => {
    const env = testEnv();
    const admin = await makeAdmin(env);
    const ada = await named(env, true);
    const bob = await named(env, false);
    const cy = await named(env, true);
    const [liked, shown, later, hidden, held, none, renamed, unliked] = Array.from(
      { length: 8 },
      fresh
    );
    // the like of an admin with no username first, then a person's
    await like(env, admin.id, liked!, 100);
    await like(env, ada.id, liked!, 200);
    // Grabient's collection showed it before the first like
    await collect(env, shown!, 50);
    await like(env, ada.id, shown!, 100);
    // a person liked it before Grabient's collection took it
    await like(env, ada.id, later!, 100);
    await collect(env, later!, 200);
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

  it("ranks likes by the server's own clock, which no request sets back", async () => {
    const env = testEnv();
    const ada = await named(env, true);
    const mallory = await named(env, true);
    const seed = fresh();
    await like(env, ada.id, seed, Date.now() - 60_000);
    // a like that claims a time years back, as an undo may, is still written now
    const claimed = likeInput({
      seed,
      liked: true,
      style: "linearGradient",
      steps: 7,
      angle: 90,
      at: Date.UTC(2016, 0, 1)
    })!;
    await setLike(env, mallory, claimed);
    const row = await first<{ created_at: number; listed_at: number }>(
      env.DB,
      "SELECT created_at, listed_at FROM k_likes WHERE user_id = ? AND palette_id = ?",
      mallory.id,
      seed
    );
    expect(row?.created_at).toBe(Date.UTC(2016, 0, 1));
    expect(row?.listed_at).toBeGreaterThan(Date.now() - 60_000);
    expect((await creditsOf(env, [seed])).get(seed)).toEqual({ by: "person", name: ada.username });
  });

  it("goes to Grabient where the site brought the palette: the gallery held it before any like, or a persona liked it first", async () => {
    const env = testEnv();
    const ada = await named(env, true);
    const bot = await persona(env);
    const day = 86_400_000;
    const [y2017, published, scheduled, kept, own, taken] = Array.from({ length: 6 }, fresh);
    // in the gallery since 2017, liked first years later by a person who shows their name
    await gallery(env, y2017!, Date.UTC(2017, 5, 26));
    await like(env, ada.id, y2017!, Date.UTC(2025, 4, 14));
    // published to the gallery, then liked a day on
    await gallery(env, published!, 1000);
    await like(env, ada.id, published!, 1000 + day);
    // a persona's like brought it, and a person's came after
    await gallery(env, scheduled!, 1000);
    await like(env, bot.id, scheduled!, 1000);
    await like(env, ada.id, scheduled!, 2000);
    // a collection of Grabient's kept private held it before the first like
    await collect(env, kept!, 500, null, "private");
    await like(env, ada.id, kept!, 1000);
    // a person's own private collection held it, and their like a day on brought it to the gallery from there
    await collect(env, own!, 500, ada.id, "private");
    await gallery(env, own!, 500);
    await like(env, ada.id, own!, 500 + day);
    // a like that brought it, its gallery row written in the same act a few milliseconds before
    await gallery(env, taken!, 1000);
    await like(env, ada.id, taken!, 1004);
    const seeds = [y2017!, published!, scheduled!, kept!, own!, taken!];
    const credits = await creditsOf(env, seeds);
    expect(seeds.map(seed => credits.get(seed))).toEqual([
      { by: "grabient" },
      { by: "grabient" },
      { by: "grabient" },
      { by: "grabient" },
      { by: "person", name: ada.username },
      { by: "person", name: ada.username }
    ]);
  });

  it("names an admin by their username only on a palette their own like brought, whatever their switch says", async () => {
    const env = testEnv();
    const john = await makeAdmin(env);
    const username = handle("john");
    await run(env.DB, "UPDATE auth_user SET username = ? WHERE id = ?", username, john.id);
    const ada = await named(env, true);
    const day = 86_400_000;
    const [made, app, old, generated, kept, collected, showing, unseen] = Array.from(
      { length: 8 },
      fresh
    );
    // the admin's like on the site brought it, its gallery row written in the same act; a person's came after
    await gallery(env, made!, 1000);
    await like(env, john.id, made!, 1004);
    await like(env, ada.id, made!, 2000);
    // the admin's like brought it, made through a connected app
    await gallery(env, app!, 1000);
    await like(env, john.id, app!, 1000, "mcp");
    // the gallery held it long before the admin liked it, as it holds 2017's palettes
    await gallery(env, old!, 1000);
    await like(env, john.id, old!, 1000 + day);
    // a collection of Grabient's kept private held it before the admin liked it on its page
    await collect(env, generated!, 500, null, "private");
    await gallery(env, generated!, 500);
    await like(env, john.id, generated!, 1000);
    // a private collection of the admin's held it before anyone liked it
    await collect(env, kept!, 500, john.id, "private");
    await like(env, ada.id, kept!, 1000);
    // a public collection of the admin's held it, and the admin liked it after
    await collect(env, collected!, 500, john.id);
    await like(env, john.id, collected!, 1000);
    // a public collection of the admin's shows it, and no one liked it
    await collect(env, showing!, 500, john.id);
    // a private one alone shows nothing
    await collect(env, unseen!, 500, john.id, "private");
    const seeds = [made!, app!, old!, generated!, kept!, collected!, showing!, unseen!];
    const credits = await creditsOf(env, seeds);
    expect(seeds.map(seed => credits.get(seed))).toEqual([
      { by: "person", name: username },
      { by: "grabient" },
      { by: "grabient" },
      { by: "grabient" },
      { by: "grabient" },
      { by: "grabient" },
      { by: "grabient" },
      null
    ]);
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
