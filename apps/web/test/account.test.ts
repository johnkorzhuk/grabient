import { encodePalette } from "@grabient/engine";
import { handleAuth } from "@grabient/server/auth/gate.ts";
import { authFor } from "@grabient/server/auth/library.ts";
import { setFlag } from "@grabient/server/flags/flags.ts";
import { describe, expect, it } from "vitest";
import type { SyncOp, SyncResponse } from "../src/features/account/wire.ts";
import { accountHandle, privateSlug } from "../src/features/collections/address.ts";
import { handleAuthRoute } from "../src/server/account/auth.ts";
import { pruneSync } from "../src/server/account/changes.ts";
import { confirmDeletion } from "../src/server/account/deletion.ts";
import { handleFlags } from "../src/server/account/flags.ts";
import { checkUsername, saveUsername, uploadAvatar } from "../src/server/account/profile.ts";
import { handleSync } from "../src/server/account/sync.ts";
import { connect } from "./connect.ts";
import {
  bodyOf,
  cookiesOf,
  get,
  makeAccount,
  makeAdmin,
  ORIGIN,
  post,
  type TestEnv,
  testEnv,
  unique
} from "./helpers.ts";

/* The account's routes over the real migrations: the sync of the browser's copy, the profile's writes, the deletion's
   confirmation, the admin's site features and the session the page reads. */

const view = { style: "linearGradient", steps: 7, angle: 90 } as const;
/** A palette no other test likes: its own grays. */
const palette = () => {
  const [a, b] = crypto.getRandomValues(new Uint8Array(2));
  return encodePalette({
    anchors: [
      { l: a! / 255, c: 0.1, h: 30 },
      { l: b! / 255, c: 0.2, h: 200 },
      { l: 0.5, c: 0.05, h: 320 }
    ]
  });
};
const like = (seed: string, liked = true): SyncOp => ({ op: "like", seed, liked, ...view });
const client = () => unique("browser-client").replaceAll("-", "_").padEnd(20, "x");

async function sync(env: TestEnv, cookie: string, body: Record<string, unknown>) {
  const answer = await handleSync(post("/api/me/sync", body, { cookie }), env);
  return { status: answer.status, body: await bodyOf<SyncResponse & { error?: string }>(answer) };
}

describe("the sync", () => {
  it("refuses what is no sync: another site, no session, a broken body, a client of another account", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const id = client();
    const cases: [Request, number, string][] = [
      [new Request(`${ORIGIN}/api/me/sync`), 405, "Method not allowed"],
      [
        post(
          "/api/me/sync",
          { client: id, cursor: null, mutations: [] },
          { cookie: ada.cookie, origin: "https://evil.test" }
        ),
        403,
        "Invalid request."
      ],
      [
        post("/api/me/sync", { client: id, cursor: null, mutations: [] }),
        401,
        "Sign in to continue."
      ],
      [
        post("/api/me/sync", { cursor: null, mutations: [] }, { cookie: ada.cookie }),
        400,
        "Send a client id, a cursor and at most 50 changes."
      ],
      [
        post(
          "/api/me/sync",
          {
            client: id,
            cursor: null,
            mutations: Array.from({ length: 51 }, (_, i) => ({ id: i + 1, op: {} }))
          },
          { cookie: ada.cookie }
        ),
        400,
        "Send a client id, a cursor and at most 50 changes."
      ],
      [
        post(
          "/api/me/sync",
          {
            client: id,
            cursor: null,
            mutations: [
              { id: 2, op: {} },
              { id: 2, op: {} }
            ]
          },
          { cookie: ada.cookie }
        ),
        400,
        "Changes are numbered upward from 1."
      ],
      [
        post(
          "/api/me/sync",
          { client: id, cursor: null, mutations: [], account: "someone-else" },
          { cookie: ada.cookie }
        ),
        401,
        "Sign in to continue."
      ]
    ];
    for (const [request, status, error] of cases) {
      const answer = await handleSync(request, env);
      expect([answer.status, (await bodyOf<{ error: string }>(answer)).error]).toEqual([
        status,
        error
      ]);
      expect(answer.headers.get("Cache-Control")).toBe("private, no-store");
    }
    const kept = await sync(env, ada.cookie, { client: id, cursor: null, mutations: [] });
    expect(kept.status).toBe(200);
    const bob = await makeAccount(env);
    const taken = await sync(env, bob.cookie, { client: id, cursor: null, mutations: [] });
    expect([taken.status, taken.body]).toEqual([
      409,
      { error: "This client id belongs to another account.", client: "taken" }
    ]);
  });

  it("starts a new browser with everything, names the account, and keeps its first language", async () => {
    const env = testEnv();
    const ada = await makeAccount(env, { name: "Ada" });
    const first = await sync(env, ada.cookie, {
      client: client(),
      cursor: null,
      mutations: [],
      locale: "ja"
    });
    expect(first.body).toMatchObject({
      reset: true,
      likes: [],
      collections: [],
      admin: false,
      language: true
    });
    expect(first.body.account).toMatchObject({
      id: ada.id,
      name: "Ada",
      email: ada.email,
      username: null
    });
    await sync(env, ada.cookie, { client: client(), cursor: null, mutations: [], locale: "fr" });
    const row = await env.DB.prepare("SELECT locale FROM auth_user WHERE id = ?")
      .bind(ada.id)
      .first();
    expect(row).toEqual({ locale: "ja" });
  });

  it("applies likes once, answers their counts, and hears another device's by the cursor", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const id = client();
    const [one, two] = [palette(), palette()];
    const start = await sync(env, ada.cookie, { client: id, cursor: null, mutations: [] });
    const mutations = [
      { id: 1, op: like(one) },
      { id: 2, op: like(two) }
    ];
    const liked = await sync(env, ada.cookie, { client: id, cursor: start.body.cursor, mutations });
    expect(liked.body.results).toEqual([
      { id: 1, ok: true, likesCount: 1 },
      { id: 2, ok: true, likesCount: 1 }
    ]);
    expect(liked.body.likes.map(entry => entry.seed).sort()).toEqual([one, two].sort());
    expect(liked.body.lastMutation).toBe(2);
    const again = await sync(env, ada.cookie, { client: id, cursor: liked.body.cursor, mutations });
    expect([again.body.results, again.body.likes, again.body.lastMutation]).toEqual([[], [], 2]);

    const laptop = client();
    await sync(env, ada.cookie, {
      client: laptop,
      cursor: null,
      mutations: [{ id: 1, op: like(one, false) }]
    });
    const heard = await sync(env, ada.cookie, {
      client: id,
      cursor: again.body.cursor,
      mutations: []
    });
    expect([heard.body.reset, heard.body.unliked]).toEqual([false, [one]]);
  });

  it("puts a like an undo sends back at its own time, with the title its unsave took", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const id = client();
    const seed = palette();
    await sync(env, ada.cookie, {
      client: id,
      cursor: null,
      mutations: [{ id: 1, op: like(seed) }]
    });
    await env.DB.prepare("UPDATE k_likes SET title = 'Pit ember' WHERE user_id = ?")
      .bind(ada.id)
      .run();
    const unsaved = await sync(env, ada.cookie, {
      client: id,
      cursor: null,
      mutations: [{ id: 2, op: like(seed, false) }]
    });
    const was = unsaved.body.results[0]?.was;
    expect(was).toMatchObject({ ...view, title: "Pit ember" });
    await sync(env, ada.cookie, {
      client: id,
      cursor: null,
      mutations: [{ id: 3, op: { ...like(seed), at: was!.at, title: was!.title } }]
    });
    const row = await env.DB.prepare("SELECT created_at, title FROM k_likes WHERE user_id = ?")
      .bind(ada.id)
      .first();
    expect(row).toEqual({ created_at: was!.at, title: "Pit ember" });
  });

  it("makes a collection where the browser showed it, follows its changes in order, and refuses the rest", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const id = client();
    const seeds = [palette(), palette(), palette(), palette()];
    const slug = privateSlug("Night swim", accountHandle({ id: ada.id }), () => false);
    const items = seeds.slice(0, 3).map(seed => ({ seed, ...view }));
    const made = await sync(env, ada.cookie, {
      client: id,
      cursor: null,
      mutations: [
        {
          id: 1,
          op: { op: "collection.create", slug, title: "Night swim", visibility: "private", items }
        },
        { id: 2, op: { op: "collection.add", slug, items: [{ seed: seeds[3], ...view }] } },
        { id: 3, op: { op: "collection.remove", slug, seed: seeds[1] } },
        { id: 4, op: { op: "collection.update", slug, visibility: "public" } },
        { id: 5, op: { op: "nonsense" } }
      ]
    });
    const [create, add, remove, publish, nonsense] = made.body.results;
    expect([create, add]).toEqual([
      { id: 1, ok: true, slug },
      { id: 2, ok: true }
    ]);
    expect(remove).toMatchObject({ id: 3, ok: true });
    expect(remove?.restore).toEqual(expect.any(String));
    expect(publish).toEqual({
      id: 4,
      ok: false,
      error: "Only admins can change who sees a collection."
    });
    expect(nonsense).toEqual({ id: 5, ok: false, error: "This change cannot be read." });
    const doc = made.body.collections.find(entry => entry.slug === slug);
    expect(doc?.items.map(item => item.kseed)).toEqual([seeds[0], seeds[2], seeds[3]]);
    expect(doc?.url).toBe(`${ORIGIN}/${slug}`);

    const back = await sync(env, ada.cookie, {
      client: id,
      cursor: made.body.cursor,
      mutations: [
        { id: 6, op: { op: "collection.restore", slug, seed: seeds[1], restore: remove!.restore } }
      ]
    });
    expect(back.body.results).toEqual([{ id: 6, ok: true }]);
    expect(back.body.collections[0]?.items.map(item => item.kseed)).toEqual([
      seeds[0],
      seeds[1],
      seeds[2],
      seeds[3]
    ]);

    const gone = await sync(env, ada.cookie, {
      client: id,
      cursor: back.body.cursor,
      mutations: [
        { id: 7, op: { op: "collection.delete", slug, id: doc!.id } },
        {
          id: 8,
          op: { op: "collection.add", slug, id: doc!.id, items: [{ seed: palette(), ...view }] }
        }
      ]
    });
    expect(gone.body.results).toEqual([
      { id: 7, ok: true },
      { id: 8, ok: false, error: "That collection isn't yours anymore." }
    ]);
    expect(gone.body.removed).toEqual([doc!.id]);
  });

  it("makes a collection sent twice once, and never reaches another account's", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const bob = await makeAccount(env);
    const slug = privateSlug("Dawn", accountHandle({ id: ada.id }), () => false);
    const create: SyncOp = {
      op: "collection.create",
      slug,
      title: "Dawn",
      visibility: "private",
      items: [{ seed: palette(), ...view }]
    };
    const first = await sync(env, ada.cookie, {
      client: client(),
      cursor: null,
      mutations: [{ id: 1, op: create }]
    });
    const twice = await sync(env, ada.cookie, {
      client: client(),
      cursor: null,
      mutations: [{ id: 1, op: create }]
    });
    expect([first.body.results[0]?.slug, twice.body.results[0]?.slug]).toEqual([slug, slug]);
    expect(twice.body.collections).toHaveLength(1);
    const doc = twice.body.collections[0]!;
    const theirs = await sync(env, bob.cookie, {
      client: client(),
      cursor: null,
      mutations: [{ id: 1, op: { op: "collection.delete", slug, id: doc.id } }]
    });
    expect(theirs.body.results[0]).toMatchObject({ ok: true });
    expect(
      await env.DB.prepare("SELECT 1 AS held FROM k_collections WHERE id = ?").bind(doc.id).first()
    ).toEqual({ held: 1 });
  });

  it("stops at a limit, says when to send the rest, and keeps them for the next turn", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const id = client();
    const mutations = Array.from({ length: 21 }, (_, i) => ({ id: i + 1, op: like(palette()) }));
    const turn = await sync(env, ada.cookie, { client: id, cursor: null, mutations });
    expect(turn.body.results).toHaveLength(20);
    expect(turn.body.lastMutation).toBe(20);
    expect(turn.body.retryAfter).toBeGreaterThan(0);
  });

  it("puts every change off while an admin has saving paused, and reads on", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const id = client();
    const [kept, waiting] = [palette(), palette()];
    const slug = privateSlug("Low tide", accountHandle({ id: ada.id }), () => false);
    const start = await sync(env, ada.cookie, {
      client: id,
      cursor: null,
      mutations: [{ id: 1, op: like(kept) }]
    });
    const create: SyncOp = {
      op: "collection.create",
      slug,
      title: "Low tide",
      visibility: "private",
      items: [{ seed: waiting, ...view }]
    };
    const mutations = [
      { id: 2, op: like(waiting) },
      { id: 3, op: create }
    ];
    await setFlag(env, "saving", false, unique("admin"));
    try {
      // neither applied nor refused: the browser keeps both, shows them, and sends them again in five minutes
      const paused = await sync(env, ada.cookie, { client: id, cursor: null, mutations });
      expect([
        paused.status,
        paused.body.results,
        paused.body.lastMutation,
        paused.body.retryAfter
      ]).toEqual([200, [], 1, 300]);
      // what the account held before is still read
      expect(paused.body.likes.map(entry => entry.seed)).toEqual([kept]);
      expect(paused.body.collections).toEqual([]);
      const alone = await sync(env, ada.cookie, {
        client: client(),
        cursor: null,
        mutations: [{ id: 1, op: create }]
      });
      expect([alone.body.results, alone.body.retryAfter]).toEqual([[], 300]);
    } finally {
      await setFlag(env, "saving", true, unique("admin"));
    }
    const back = await sync(env, ada.cookie, { client: id, cursor: start.body.cursor, mutations });
    expect(back.body.results).toEqual([
      { id: 2, ok: true, likesCount: 1 },
      { id: 3, ok: true, slug }
    ]);
    expect(back.body.retryAfter).toBeUndefined();
  });

  it("keeps the browser's cookie as long as the session it extends", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const day = 86_400_000;
    // a session last extended two days ago, due for its daily extension
    await env.DB.prepare("UPDATE auth_session SET expires_at = ? WHERE user_id = ?")
      .bind(Date.now() + 5 * day, ada.id)
      .run();
    const daysLeft = async () => {
      const row = await env.DB.prepare("SELECT expires_at FROM auth_session WHERE user_id = ?")
        .bind(ada.id)
        .first<{ expires_at: number }>();
      return Math.round((Number(row?.expires_at) - Date.now()) / day);
    };
    // an answer that sets no cookie leaves the session as it stands
    const check = await checkUsername(
      post("/api/settings/username/check", { username: "tidepool" }, { cookie: ada.cookie }),
      env
    );
    expect([check.status, check.headers.getSetCookie(), await daysLeft()]).toEqual([200, [], 5]);
    const answer = await handleSync(
      post(
        "/api/me/sync",
        { client: client(), cursor: null, mutations: [] },
        { cookie: ada.cookie }
      ),
      env
    );
    expect(answer.status).toBe(200);
    const { name } = (await authFor(env).$context).authCookies.sessionToken;
    const token = answer.headers.getSetCookie().find(cookie => cookie.startsWith(`${name}=`));
    expect(token).toMatch(/Max-Age=604800/);
    expect(await daysLeft()).toBe(7);
  });

  it("sends everything to a browser behind what was pruned", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const id = client();
    const start = await sync(env, ada.cookie, {
      client: id,
      cursor: null,
      mutations: [{ id: 1, op: like(palette()) }]
    });
    await env.DB.prepare("UPDATE k_sync_log SET at = 0").run();
    await pruneSync(env);
    const behind = await sync(env, ada.cookie, { client: id, cursor: 0, mutations: [] });
    expect(behind.body.reset).toBe(true);
    expect(behind.body.likes).toHaveLength(1);
    const ahead = await sync(env, ada.cookie, {
      client: id,
      cursor: start.body.cursor + 1_000_000,
      mutations: []
    });
    expect(ahead.body.reset).toBe(true);
  });
});

describe("the session the page reads", () => {
  it("is the account as the page shows it, with no token and no other column", async () => {
    const env = testEnv();
    const ada = await makeAccount(env, { name: "Ada" });
    const answer = await handleAuthRoute(get("/api/auth/get-session", { cookie: ada.cookie }), env);
    expect(answer.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await bodyOf<{ user: Record<string, unknown> }>(answer);
    expect(Object.keys(body.user).sort()).toEqual(
      ["createdAt", "email", "emailVerified", "id", "image", "name", "username"].sort()
    );
    expect(body.user).toMatchObject({ id: ada.id, name: "Ada", emailVerified: true });
    expect(await bodyOf(await handleAuthRoute(get("/api/auth/get-session"), env))).toBeNull();
  });
});

describe("the profile", () => {
  it("checks a name against every other account in any case, and keeps one name per account", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const bob = await makeAccount(env);
    const name = unique("Ada").replaceAll("-", "").slice(0, 20);
    const saved = await saveUsername(
      post("/api/settings/username", { username: name }, { cookie: ada.cookie }),
      env
    );
    expect([saved.status, await saved.json()]).toEqual([200, { success: true }]);
    expect(saved.headers.getSetCookie().join()).toMatch(/session_data/);
    const check = await checkUsername(
      post(
        "/api/settings/username/check",
        { username: name.toUpperCase() },
        { cookie: bob.cookie }
      ),
      env
    );
    expect(await check.json()).toEqual({ available: false });
    const own = await checkUsername(
      post("/api/settings/username/check", { username: name }, { cookie: ada.cookie }),
      env
    );
    expect(await own.json()).toEqual({ available: true });
    const taken = await saveUsername(
      post("/api/settings/username", { username: name.toLowerCase() }, { cookie: bob.cookie }),
      env
    );
    expect([taken.status, await taken.json()]).toEqual([409, { error: "That username is taken." }]);
    for (const [username, problem] of [
      ["ab", "Use at least 3 characters."],
      ["Admin", "That username is reserved."],
      ["-ada", "Start and end with a letter or number."]
    ]) {
      const answer = await saveUsername(
        post("/api/settings/username", { username }, { cookie: bob.cookie }),
        env
      );
      expect([answer.status, await answer.json()]).toEqual([400, { error: problem }]);
    }
  });

  it("moves the account's private collections under its new name", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const slug = privateSlug("Moss", accountHandle({ id: ada.id }), () => false);
    await sync(env, ada.cookie, {
      client: client(),
      cursor: null,
      mutations: [
        {
          id: 1,
          op: {
            op: "collection.create",
            slug,
            title: "Moss",
            visibility: "private",
            items: [{ seed: palette(), ...view }]
          }
        }
      ]
    });
    const name = `moss${crypto.randomUUID().slice(0, 8)}`;
    await saveUsername(
      post("/api/settings/username", { username: name }, { cookie: ada.cookie }),
      env
    );
    const row = await env.DB.prepare("SELECT slug FROM k_collections WHERE owner_id = ?")
      .bind(ada.id)
      .first();
    expect(row).toEqual({ slug: `@${name}/moss` });
  });

  it("takes only a small WebP for a picture, and keeps it at an address of its own", async () => {
    const env = testEnv({ R2_PUBLIC_URL: "https://uploads.test" });
    const ada = await makeAccount(env);
    const upload = (bytes: Uint8Array, type = "image/webp") =>
      uploadAvatar(
        new Request(`${ORIGIN}/api/settings/avatar`, {
          method: "POST",
          headers: { Cookie: ada.cookie, Origin: ORIGIN, "Content-Type": type },
          body: bytes
        }),
        env
      );
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 test");
    for (const [bytes, type] of [
      [webp, "image/png"],
      [new TextEncoder().encode("not a picture at all"), "image/webp"],
      [new Uint8Array(256 * 1024 + 1), "image/webp"]
    ] as const) {
      const refused = await upload(bytes, type);
      expect([refused.status, await refused.json()]).toEqual([400, { error: "Invalid image." }]);
    }
    const kept = await upload(webp);
    const { imageUrl } = await bodyOf<{ imageUrl: string }>(kept);
    expect(imageUrl).toMatch(new RegExp(`^https://uploads\\.test/avatars/${ada.id}/\\d+\\.webp$`));
    const second = await bodyOf<{ imageUrl: string }>(await upload(webp));
    const listed = await env.UPLOADS!.list({ prefix: `avatars/${ada.id}/` });
    expect(listed.objects.map(object => `https://uploads.test/${object.key}`)).toEqual([
      second.imageUrl
    ]);
  });
});

describe("deleting an account", () => {
  it("confirms only with a token the account was sent, burns none of another's, and ends its apps' grants", async () => {
    const env = testEnv();
    const ada = await makeAccount(env);
    const bob = await makeAccount(env);
    await connect(env, ada);
    const grants = async () =>
      (await env.OAUTH_KV!.list({ prefix: `grant:${ada.id}:` })).keys.length;
    expect(await grants()).toBe(1);
    const asked = await handleAuth(post("/api/auth/delete-user", {}, { cookie: ada.cookie }), env);
    expect(asked.status).toBe(200);
    const token = env.EMAIL.link("/settings").searchParams.get("token") ?? "";
    const theirs = await confirmDeletion(
      post("/api/settings/delete-account", { token }, { cookie: bob.cookie }),
      env
    );
    expect([theirs.status, await theirs.json()]).toEqual([
      400,
      { error: "This link is invalid or expired." }
    ]);
    const done = await confirmDeletion(
      post("/api/settings/delete-account", { token }, { cookie: ada.cookie }),
      env
    );
    expect(done.status).toBe(200);
    expect(cookiesOf(done)).toBe("");
    expect(
      await env.DB.prepare("SELECT 1 AS held FROM auth_user WHERE id = ?").bind(ada.id).first()
    ).toBeNull();
    // the app it had connected holds no grant now
    expect(await grants()).toBe(0);
  });
});

describe("the site's features", () => {
  it("are an admin's to read and change", async () => {
    const env = testEnv();
    const reader = await makeAccount(env);
    const admin = await makeAdmin(env);
    const refused = await handleFlags(get("/api/me/flags", { cookie: reader.cookie }), env);
    expect([refused.status, await refused.json()]).toEqual([403, { error: "Forbidden" }]);
    const turned = await handleFlags(
      new Request(`${ORIGIN}/api/me/flags`, {
        method: "PUT",
        headers: { Cookie: admin.cookie, Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "share-images", on: false })
      }),
      env
    );
    const { flags } = await bodyOf<{ flags: { name: string; on: boolean }[] }>(turned);
    expect(flags.find(flag => flag.name === "share-images")?.on).toBe(false);
    await env.DB.prepare("DELETE FROM k_flags").run();
  });
});
