import { describe, expect, it } from "vitest";
import { confirmDeletion } from "../src/server/auth/deletion.ts";
import { handleAuth } from "../src/server/auth/gate.ts";
import { authFor } from "../src/server/auth/library.ts";
import { getSession } from "../src/server/auth/session.ts";
import {
  address,
  bodyOf,
  cookiesOf,
  count,
  get,
  makeAccount,
  makeAdmin,
  ORIGIN,
  post,
  type TestEnv,
  testEnv,
  unique
} from "./helpers.ts";

const LINK = "/api/auth/sign-in/magic-link";
const CODE = "/api/auth/email-otp/send-verification-otp";
const CODE_SIGN_IN = "/api/auth/sign-in/email-otp";

const sha256 = async (text: string) => {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  );
  return btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

/** Signs an address in by its emailed link; the cookies of the new session. */
async function signInByLink(env: TestEnv, email: string, ip = address()): Promise<string> {
  const sent = await handleAuth(post(LINK, { email, callbackURL: "/palettes/saved" }, { ip }), env);
  expect(sent.status, await sent.clone().text()).toBe(200);
  const opened = await handleAuth(
    get(env.EMAIL.link("/api/auth/magic-link/verify").href, { ip }),
    env
  );
  expect(opened.status).toBe(302);
  expect(opened.headers.get("Location")).toBe(`${ORIGIN}/palettes/saved`);
  return cookiesOf(opened);
}

type SessionBody = { user: { email: string } };

describe("the gate", () => {
  it("answers every route it does not open with 404, and other methods with 405", async () => {
    const env = testEnv();
    for (const path of [
      "/api/auth/list-sessions",
      "/api/auth/sign-up/email",
      "/api/auth/sign-in/email",
      "/api/auth/update-user",
      "/api/auth/email-otp/verify-email",
      "/api/auth/email-otp/check-verification-otp",
      "/api/auth/forget-password/email-otp",
      "/api/auth/request-password-reset"
    ]) {
      const answer = await handleAuth(post(path, { email: "x@example.test" }), env);
      expect([path, answer.status, await answer.json()]).toEqual([
        path,
        404,
        { error: "Not found" }
      ]);
    }
    const put = new Request(`${ORIGIN}/api/auth/sign-out`, { method: "PUT" });
    expect((await handleAuth(put, env)).status).toBe(405);
  });

  it("answers the old connected-app addresses in words an app acts on", async () => {
    const env = testEnv();
    const token = await handleAuth(post("/api/auth/oauth2/token", {}, { origin: null }), env);
    expect(token.status).toBe(400);
    expect(token.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await token.json()).toEqual({
      error: "invalid_grant",
      error_description: "This connection moved. Connect the app again."
    });
    const authorize = await handleAuth(get("/api/auth/oauth2/authorize"), env);
    expect([authorize.status, authorize.headers.get("Location")]).toEqual([
      303,
      "/connect?problem=expired"
    ]);
  });

  it("refuses a write from another site, with no origin, or with a body over 2 KiB", async () => {
    const env = testEnv();
    for (const origin of ["https://attacker.test", "null", null]) {
      const answer = await handleAuth(post(LINK, { email: "x@example.test" }, { origin }), env);
      expect(answer.status).toBe(403);
      expect(await answer.json()).toEqual({ error: "Invalid request." });
    }
    const large = await handleAuth(post("/api/auth/sign-out", { pad: "x".repeat(3000) }), env);
    expect(large.status).toBe(413);
    expect(env.EMAIL.sent).toHaveLength(0);
  });

  it("is closed without a secret", async () => {
    const env = testEnv({ BETTER_AUTH_SECRET: undefined });
    const answer = await handleAuth(get("/api/auth/get-session"), env);
    expect([answer.status, await answer.json()]).toEqual([
      503,
      { error: "Sign-in is unavailable." }
    ]);
  });

  it("keeps every answer private", async () => {
    const answer = await handleAuth(get("/api/auth/get-session"), testEnv());
    expect(await answer.json()).toBeNull();
    expect(answer.headers.get("Cache-Control")).toBe("private, no-store");
    expect(answer.headers.get("CDN-Cache-Control")).toBe("no-store");
  });
});

describe("signing in by an emailed link", () => {
  it("makes a session for the address and goes where the page asked", async () => {
    const env = testEnv();
    const email = `${unique("link")}@example.test`;
    const cookie = await signInByLink(env, email);
    expect(cookie).toMatch(/better-auth\.session_token=/);
    const session = await getSession(env, new Headers({ cookie }), { fresh: true });
    expect(session?.user.email).toBe(email);
    const read = await handleAuth(get("/api/auth/get-session", { cookie }), env);
    expect((await bodyOf<SessionBody>(read)).user.email).toBe(email);
  });

  it("stores the link's token as its hash, and takes no name from the request", async () => {
    const env = testEnv();
    const email = `${unique("hashed")}@example.test`;
    const asked = await handleAuth(post(LINK, { email, name: "Typed By Requester" }), env);
    expect(asked.status).toBe(200);
    const token = env.EMAIL.link("/magic-link/verify").searchParams.get("token") ?? "";
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM auth_verification WHERE identifier = ?",
        `magic-link:${await sha256(token)}`
      )
    ).toBe(1);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM auth_verification WHERE identifier LIKE ?",
        `%${token}%`
      )
    ).toBe(0);
    const opened = await handleAuth(get(env.EMAIL.link("/magic-link/verify").href), env);
    expect(opened.status).toBe(302);
    const row = await env.DB.prepare("SELECT name, email_verified FROM auth_user WHERE email = ?")
      .bind(email)
      .first();
    expect(row).toEqual({ name: "", email_verified: 1 });
  });

  it("spends a link once, and a row kept under a plain value is never redeemed as one", async () => {
    const env = testEnv();
    const email = `${unique("once")}@example.test`;
    await signInByLink(env, email);
    const again = await handleAuth(get(env.EMAIL.link("/magic-link/verify").href), env);
    expect(again.status).toBe(302);
    expect(new URL(again.headers.get("Location") ?? "").searchParams.get("error")).toBe(
      "INVALID_TOKEN"
    );
    expect(cookiesOf(again)).not.toMatch(/session_token=/);
    const plain = "PlainValueKeptByAnotherFlow1234";
    await env.DB.prepare(
      "INSERT INTO auth_verification (id, identifier, value, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)"
    )
      .bind(
        unique("row"),
        `magic-link:${plain}`,
        JSON.stringify({ type: "magic-link", email }),
        Date.now() + 60_000
      )
      .run();
    const redeemed = await handleAuth(
      get(`/api/auth/magic-link/verify?token=${plain}&callbackURL=%2F`),
      env
    );
    expect(new URL(redeemed.headers.get("Location") ?? "").searchParams.get("error")).toBe(
      "INVALID_TOKEN"
    );
  });

  it("counts each address's asks and each inbox's emails, and sends nothing past them", async () => {
    const env = testEnv();
    const ip = address();
    for (let i = 0; i < 5; i++) {
      const sent = await handleAuth(
        post(LINK, { email: `${unique("ask")}@example.test` }, { ip }),
        env
      );
      expect(sent.status).toBe(200);
    }
    const sixth = await handleAuth(
      post(LINK, { email: `${unique("ask")}@example.test` }, { ip }),
      env
    );
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ error: "Email sign-in is busy. Try again later." });
    expect(Number(sixth.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(env.EMAIL.sent).toHaveLength(5);

    // One inbox, written six ways, then a seventh: refused with nothing stored.
    const inbox = unique("inbox");
    const ways = [`${inbox}@gmail.com`, `${inbox.toUpperCase()}@gmail.com`, `${inbox}+a@gmail.com`];
    for (let i = 0; i < 6; i++) {
      const sent = await handleAuth(post(CODE, { email: ways[i % 3], type: "sign-in" }), env);
      expect(sent.status).toBe(200);
    }
    const rows = await count(env, "SELECT COUNT(*) AS n FROM auth_verification");
    const refused = await handleAuth(post(LINK, { email: `${inbox}@googlemail.com` }), env);
    expect(refused.status).toBe(429);
    expect(await count(env, "SELECT COUNT(*) AS n FROM auth_verification")).toBe(rows);
    expect(env.EMAIL.sent).toHaveLength(11);
  });

  it("refuses a body without an address", async () => {
    const env = testEnv();
    const answer = await handleAuth(post(LINK, { callbackURL: "/" }), env);
    expect([answer.status, await answer.json()]).toEqual([400, { error: "Invalid request body" }]);
  });
});

describe("signing in by an emailed code", () => {
  it("sends only a sign-in code, stored hashed, good for three tries and one use", async () => {
    const env = testEnv();
    const email = `${unique("code")}@example.test`;
    const other = await handleAuth(post(CODE, { email, type: "email-verification" }), env);
    expect(other.status).toBe(400);
    expect((await handleAuth(post(CODE, { email, type: "sign-in" }), env)).status).toBe(200);
    expect(env.EMAIL.last.subject).toBe("Your Grabient sign-in code");
    const code = env.EMAIL.code;
    expect(code).toMatch(/^\d{6}$/);
    const stored = await env.DB.prepare("SELECT value FROM auth_verification WHERE identifier = ?")
      .bind(`sign-in-otp-${email}`)
      .first<{ value: string }>();
    expect(stored?.value).not.toContain(code);

    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    for (let i = 0; i < 3; i++) {
      expect((await handleAuth(post(CODE_SIGN_IN, { email, otp: wrong }), env)).status).not.toBe(
        200
      );
    }
    expect((await handleAuth(post(CODE_SIGN_IN, { email, otp: code }), env)).status).not.toBe(200);

    await handleAuth(post(CODE, { email, type: "sign-in" }), env);
    const next = env.EMAIL.code;
    const signedIn = await handleAuth(
      post(CODE_SIGN_IN, {
        email,
        otp: next,
        name: "Chosen Name",
        image: "https://tracker.test/p.png"
      }),
      env
    );
    expect(signedIn.status).toBe(200);
    expect(cookiesOf(signedIn)).toMatch(/session_token=/);
    const made = await env.DB.prepare("SELECT name, image FROM auth_user WHERE email = ?")
      .bind(email)
      .first();
    expect(made).toEqual({ name: "", image: null });
    expect((await handleAuth(post(CODE_SIGN_IN, { email, otp: next }), env)).status).not.toBe(200);
  });
});

describe("Google", () => {
  it("is refused in the page's words where the deploy has no credentials", async () => {
    const answer = await handleAuth(
      post("/api/auth/sign-in/social", { provider: "google" }),
      testEnv()
    );
    expect([answer.status, await answer.json()]).toEqual([
      503,
      { error: "Google sign-in isn't available here. Use email." }
    ]);
  });

  it("sends the reader to Google with the deploy's callback, and a failed return to the sign-in page", async () => {
    const env = testEnv({ GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret" });
    const asked = await handleAuth(
      post("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/ja/login"
      }),
      env
    );
    expect(asked.status).toBe(200);
    const google = new URL((await bodyOf<{ url: string }>(asked)).url);
    expect(google.hostname).toBe("accounts.google.com");
    expect(google.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/google`);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM auth_verification WHERE value LIKE '%codeVerifier%'"
      )
    ).toBe(0);
    const state = google.searchParams.get("state");
    const denied = await handleAuth(
      get(`/api/auth/callback/google?error=access_denied&state=${state}`, {
        cookie: cookiesOf(asked)
      }),
      env
    );
    expect(denied.headers.get("Location")).toBe("/ja/login?error=access_denied");
    const lost = await handleAuth(get("/api/auth/callback/google?code=x"), env);
    expect(lost.headers.get("Location")).toBe("/login?error=state_not_found");
    const error = await handleAuth(get("/api/auth/error?error=state_mismatch"), env);
    expect(error.headers.get("Location")).toBe("/login?error=state_mismatch");
  });

  it("never stores Google's tokens on any account row write", async () => {
    const env = testEnv();
    const { internalAdapter } = await authFor(env).$context;
    const tokens = {
      accessToken: "ya29.access",
      refreshToken: "1//refresh",
      idToken: "eyJ.id",
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
      scope: "openid email profile"
    };
    const reader = await makeAccount(env);
    const googleId = unique("google");
    const made = await internalAdapter.createOAuthUser(
      { name: "Google Reader", email: `${googleId}@example.test`, emailVerified: true },
      { providerId: "google", accountId: googleId, ...tokens }
    );
    await internalAdapter.linkAccount({
      providerId: "google",
      accountId: unique("google"),
      userId: reader.id,
      ...tokens
    });
    await internalAdapter.updateAccount(made.account.id, {
      accessToken: "ya29.again",
      idToken: "eyJ.again"
    });
    const rows = await env.DB.prepare(
      `SELECT access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope
       FROM auth_account WHERE user_id IN (?, ?)`
    )
      .bind(made.user.id, reader.id)
      .all();
    expect(rows.results).toHaveLength(2);
    for (const row of rows.results) {
      expect(row).toEqual({
        access_token: null,
        refresh_token: null,
        id_token: null,
        access_token_expires_at: null,
        refresh_token_expires_at: null,
        scope: "openid email profile"
      });
    }
  });
});

describe("sessions", () => {
  it("keep the browser they were made in and never an address", async () => {
    const env = testEnv();
    const email = `${unique("agent")}@example.test`;
    await handleAuth(post(LINK, { email }), env);
    const opened = new Request(env.EMAIL.link("/magic-link/verify"), {
      headers: {
        "User-Agent": "test browser",
        "X-Forwarded-For": "203.0.113.7",
        "CF-Connecting-IP": "203.0.113.7"
      }
    });
    expect((await handleAuth(opened, env)).status).toBe(302);
    const row = await env.DB.prepare(
      "SELECT s.ip_address, s.user_agent FROM auth_session s JOIN auth_user u ON u.id = s.user_id WHERE u.email = ?"
    )
      .bind(email)
      .first();
    expect(row).toEqual({ ip_address: null, user_agent: "test browser" });
  });

  it("are never shared between two environments", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    expect((await getSession(env, new Headers({ cookie: account.cookie })))?.user.id).toBe(
      account.id
    );
    const other = testEnv({ BETTER_AUTH_SECRET: `${"another secret".padEnd(40, "!")}` });
    expect(
      await getSession(other, new Headers({ cookie: account.cookie }), { fresh: true })
    ).toBeNull();
  });

  it("read the database when fresh, so a sign-out counts at once", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const headers = new Headers({ cookie: account.cookie });
    const first = await handleAuth(get("/api/auth/get-session", { cookie: account.cookie }), env);
    const cached = `${account.cookie}; ${cookiesOf(first)}`;
    await env.DB.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(account.id).run();
    expect((await getSession(env, new Headers({ cookie: cached })))?.user.id).toBe(account.id);
    expect(await getSession(env, new Headers({ cookie: cached }), { fresh: true })).toBeNull();
    expect(await getSession(env, headers, { fresh: true })).toBeNull();
  });

  it("end on signing out, with their cookies", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const out = await handleAuth(post("/api/auth/sign-out", {}, { cookie: account.cookie }), env);
    expect([out.status, await out.json()]).toEqual([200, { success: true }]);
    expect(out.headers.getSetCookie().some(cookie => /session_token=;/.test(cookie))).toBe(true);
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM auth_session WHERE user_id = ?", account.id)
    ).toBe(0);
  });
});

describe("a Preview", () => {
  it("signs in at its own address, with cookies for every branch that no other deploy reads", async () => {
    const preview = testEnv({
      DEPLOYMENT: "preview",
      BETTER_AUTH_URL: undefined,
      COOKIE_DOMAIN: "example.workers.dev"
    });
    const at = "https://a-branch-grabient.example.workers.dev";
    const ip = address();
    const email = `${unique("preview")}@example.test`;
    const asked = new Request(`${at}${LINK}`, {
      method: "POST",
      headers: { Origin: at, "Content-Type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify({ email, callbackURL: "/palettes/saved" })
    });
    expect((await handleAuth(asked, preview)).status).toBe(200);
    const link = preview.EMAIL.link("/api/auth/magic-link/verify");
    expect(link.origin).toBe(at);
    const opened = await handleAuth(
      new Request(link, { headers: { "CF-Connecting-IP": ip } }),
      preview
    );
    expect(opened.headers.get("Location")).toBe(`${at}/palettes/saved`);
    const set = opened.headers.getSetCookie();
    expect(set.some(cookie => cookie.startsWith("__Secure-grabient-previews.session_token="))).toBe(
      true
    );
    expect(
      set.every(
        cookie => /;\s*Domain=example\.workers\.dev/i.test(cookie) && /;\s*Secure/i.test(cookie)
      )
    ).toBe(true);
    const cookie = cookiesOf(opened);
    const beside = new Request(
      "https://b-branch-grabient.example.workers.dev/api/auth/get-session",
      {
        headers: { cookie, "CF-Connecting-IP": ip }
      }
    );
    expect((await bodyOf<SessionBody>(await handleAuth(beside, preview))).user.email).toBe(email);
    const staging = testEnv({ DEPLOYMENT: "staging" });
    expect(await getSession(staging, new Headers({ cookie }), { fresh: true })).toBeNull();
  });
});

describe("deleting an account", () => {
  it("asks for an email, and confirms only with the account's own token", async () => {
    const env = testEnv();
    const owner = await makeAccount(env);
    const stranger = await makeAccount(env);
    const asked = await handleAuth(
      post(
        "/api/auth/delete-user",
        { token: "spent-before-checked" },
        {
          cookie: owner.cookie,
          headers: { Referer: `${ORIGIN}/ja/settings` }
        }
      ),
      env
    );
    expect(asked.status, await asked.clone().text()).toBe(200);
    expect(env.EMAIL.last.subject).toBe("Confirm account deletion");
    const link = env.EMAIL.link("/settings?token=");
    expect(link.pathname).toBe("/ja/settings");
    const token = link.searchParams.get("token") ?? "";

    const confirm = (cookie: string, body: unknown) =>
      confirmDeletion(post("/api/settings/delete-account", body, { cookie }), env);
    expect((await confirm(owner.cookie, { token: "" })).status).toBe(400);
    const theirs = await confirm(stranger.cookie, { token });
    expect([theirs.status, await theirs.json()]).toEqual([
      400,
      { error: "This link is invalid or expired." }
    ]);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM auth_verification WHERE identifier = ?",
        `delete-account-${token}`
      )
    ).toBe(1);

    const seed = unique("k");
    const collection = unique("c");
    const statements = [
      [
        "INSERT INTO k_palettes (seed, style, steps, angle, created_at) VALUES (?, 'linearGradient', 5, 90, 0)",
        seed
      ],
      [
        "INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at) VALUES (?, ?, 5, 'linearGradient', 90, 1)",
        owner.id,
        seed
      ],
      [
        `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, visibility, item_count, search_text, created_at, updated_at)
         VALUES (?, ?, 'user', ?, 'Mine', 'private', 1, 'mine', 1, 1)`,
        collection,
        `@${owner.id}/mine`,
        owner.id
      ],
      [
        "INSERT INTO k_search_votes (query, seed, user_id, vote, created_at, updated_at) VALUES ('red', ?, ?, 1, 1, 1)",
        seed,
        owner.id
      ],
      [
        "INSERT INTO likes (user_id, palette_id, style, steps, angle, created_at) VALUES (?, 'old', 'linearGradient', 5, 90, 1)",
        owner.id
      ],
      ["INSERT INTO refine_sessions (id, user_id) VALUES (?, ?)", unique("r"), owner.id]
    ] as const;
    await env.DB.batch(
      statements.map(([query, ...values]) => env.DB.prepare(query).bind(...values))
    );
    await env.UPLOADS?.put(`avatars/${owner.id}/1.webp`, "a");
    await env.UPLOADS?.put(`avatars/${owner.id}/2.webp`, "b");
    expect(await count(env, "SELECT likes_count AS n FROM k_palettes WHERE seed = ?", seed)).toBe(
      1
    );

    const done = await confirm(owner.cookie, { token });
    expect(done.status, await done.clone().text()).toBe(200);
    // Every cookie the answer sets ends one: the session's, and its signed copy.
    const ended = done.headers.getSetCookie();
    expect(ended.some(cookie => /session_token=;/.test(cookie))).toBe(true);
    expect(ended.every(cookie => /^[^=]+=; Max-Age=0/.test(cookie))).toBe(true);
    for (const [table, column] of [
      ["auth_user", "id"],
      ["auth_session", "user_id"],
      ["k_likes", "user_id"],
      ["k_collections", "owner_id"],
      ["k_search_votes", "user_id"],
      ["likes", "user_id"],
      ["refine_sessions", "user_id"],
      ["k_sync_log", "account_id"]
    ]) {
      expect([
        table,
        await count(env, `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, owner.id)
      ]).toEqual([table, 0]);
    }
    expect(await count(env, "SELECT likes_count AS n FROM k_palettes WHERE seed = ?", seed)).toBe(
      0
    );
    expect((await env.UPLOADS?.list({ prefix: `avatars/${owner.id}/` }))?.objects).toHaveLength(0);
    expect(await count(env, "SELECT COUNT(*) AS n FROM auth_user WHERE id = ?", stranger.id)).toBe(
      1
    );
  });

  it("leaves the account whole when its batch fails", async () => {
    const base = testEnv();
    const DB = new Proxy(base.DB, {
      get(target, key) {
        if (key === "batch") return () => Promise.reject(new Error("D1 is unavailable"));
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const env = testEnv({ DB });
    const owner = await makeAccount(env);
    await handleAuth(post("/api/auth/delete-user", {}, { cookie: owner.cookie }), env);
    const token = env.EMAIL.link("/settings?token=").searchParams.get("token") ?? "";
    const failed = await confirmDeletion(
      post("/api/settings/delete-account", { token }, { cookie: owner.cookie }),
      env
    );
    expect([failed.status, await failed.json()]).toEqual([
      500,
      { error: "Couldn't delete the account." }
    ]);
    expect(await count(env, "SELECT COUNT(*) AS n FROM auth_user WHERE id = ?", owner.id)).toBe(1);
  });

  it("is refused for an admin at both doors", async () => {
    const env = testEnv();
    const admin = await makeAdmin(env);
    const asked = await handleAuth(
      post("/api/auth/delete-user", {}, { cookie: admin.cookie }),
      env
    );
    expect([asked.status, await asked.json()]).toEqual([
      403,
      { error: "Admin accounts can't be deleted here." }
    ]);
    expect(env.EMAIL.sent).toHaveLength(0);
    await env.DB.prepare("UPDATE auth_user SET role = 'user' WHERE id = ?").bind(admin.id).run();
    await handleAuth(post("/api/auth/delete-user", {}, { cookie: admin.cookie }), env);
    const token = env.EMAIL.link("/settings?token=").searchParams.get("token") ?? "";
    await env.DB.prepare("UPDATE auth_user SET role = 'admin' WHERE id = ?").bind(admin.id).run();
    const confirmed = await confirmDeletion(
      post("/api/settings/delete-account", { token }, { cookie: admin.cookie }),
      env
    );
    expect(confirmed.status).toBe(403);
    expect(await count(env, "SELECT COUNT(*) AS n FROM auth_user WHERE id = ?", admin.id)).toBe(1);
  });

  it("needs a signed-in account", async () => {
    const env = testEnv();
    const asked = await handleAuth(post("/api/auth/delete-user", {}), env);
    expect([asked.status, await asked.json()]).toEqual([401, { error: "Sign in to continue." }]);
  });
});
