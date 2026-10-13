import { describe, expect, it } from "vitest";
import { handleAuth } from "../src/server/auth/gate.ts";
import { authFor } from "../src/server/auth/library.ts";
import { setReviewerPassword } from "../src/server/auth/reviewer.ts";
import { getSession } from "../src/server/auth/session.ts";
import {
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
  unique,
  watchLimits
} from "./helpers.ts";

const LINK = "/api/auth/sign-in/magic-link";
const CODE = "/api/auth/email-otp/send-verification-otp";
const CODE_SIGN_IN = "/api/auth/sign-in/email-otp";
const PASSWORD = "/api/auth/sign-in/email";
const ADMINS_ONLY = { code: "ADMINS_ONLY", message: "Sign-in here is for admins." };

/** Staging: production's accounts, where only admins sign in. */
const staging = (values: Parameters<typeof testEnv>[0] = {}) =>
  testEnv({ DEPLOYMENT: "staging", SIGN_IN: "admins", ...values });

const sessions = (env: TestEnv, userId: string) =>
  count(env, "SELECT COUNT(*) AS n FROM auth_session WHERE user_id = ?", userId);

describe("where only admins sign in", () => {
  it("answers any other address as if its email went out, and stores, counts and sends nothing", async () => {
    const { env, asked } = watchLimits(staging());
    const reader = await makeAccount(env);
    const admin = await makeAdmin(env);
    const answers = [];
    for (const email of [reader.email, `${unique("new")}@example.test`, admin.email]) {
      const link = await handleAuth(post(LINK, { email }), env);
      const code = await handleAuth(post(CODE, { email, type: "sign-in" }), env);
      answers.push([link.status, await link.json(), link.headers.get("Content-Type")]);
      answers.push([code.status, await code.json(), code.headers.get("Content-Type")]);
    }
    const sent = [200, { status: true }, "application/json"];
    const coded = [200, { success: true }, "application/json"];
    expect(answers).toEqual([sent, coded, sent, coded, sent, coded]);
    // Only the admin's two emails went out, and only they counted against an inbox and the site.
    expect(env.EMAIL.sent.map(message => message.to)).toEqual([admin.email, admin.email]);
    expect(asked.filter(name => name === "emailAsk")).toHaveLength(6);
    expect(asked.filter(name => name === "emailRecipient")).toHaveLength(2);
    expect(asked.filter(name => name === "magicLinkGlobal")).toHaveLength(2);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM auth_verification WHERE identifier = ? OR value LIKE ?",
        `sign-in-otp-${reader.email}`,
        `%${reader.email}%`
      )
    ).toBe(0);
  });

  it("signs an admin in by link and by code", async () => {
    const env = staging();
    const admin = await makeAdmin(env);
    await handleAuth(post(LINK, { email: admin.email, callbackURL: "/" }), env);
    const opened = await handleAuth(get(env.EMAIL.link("/magic-link/verify").href), env);
    expect(opened.status).toBe(302);
    const cookie = cookiesOf(opened);
    expect((await getSession(env, new Headers({ cookie })))?.user.id).toBe(admin.id);
    await handleAuth(post(CODE, { email: admin.email, type: "sign-in" }), env);
    const coded = await handleAuth(
      post(CODE_SIGN_IN, { email: admin.email, otp: env.EMAIL.code }),
      env
    );
    expect(coded.status).toBe(200);
    expect(cookiesOf(coded)).toMatch(/__Secure-better-auth\.session_token=/);
  });

  it("makes nobody new, by a link or a code sent before the rule or by Google", async () => {
    const open = testEnv();
    const env = staging();
    const email = `${unique("before")}@example.test`;
    await handleAuth(post(LINK, { email, callbackURL: "/" }), open);
    const link = open.EMAIL.link("/magic-link/verify");
    const opened = await handleAuth(get(link.href), env);
    expect(new URL(opened.headers.get("Location") ?? "").searchParams.get("error")).toBe(
      "new_user_signup_disabled"
    );
    await handleAuth(post(CODE, { email, type: "sign-in" }), open);
    const coded = await handleAuth(post(CODE_SIGN_IN, { email, otp: open.EMAIL.code }), env);
    expect(coded.status).toBe(400);
    const { internalAdapter } = await authFor(env).$context;
    const googleEmail = `${unique("google")}@example.test`;
    await internalAdapter
      .createOAuthUser(
        { name: "Someone", email: googleEmail, emailVerified: true },
        { providerId: "google", accountId: unique("google") }
      )
      .catch(() => null);
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM auth_user WHERE email IN (?, ?)",
        email,
        googleEmail
      )
    ).toBe(0);
    expect(cookiesOf(opened) + cookiesOf(coded)).not.toMatch(/session_token=/);
  });

  it("gives an account that is not an admin no session by any way in", async () => {
    const open = testEnv();
    const env = staging();
    const reader = await makeAccount(env);
    await env.DB.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(reader.id).run();

    await handleAuth(post(CODE, { email: reader.email, type: "sign-in" }), open);
    const coded = await handleAuth(
      post(CODE_SIGN_IN, { email: reader.email, otp: open.EMAIL.code }),
      env
    );
    expect([coded.status, await coded.json()]).toEqual([403, ADMINS_ONLY]);

    await handleAuth(post(LINK, { email: reader.email, callbackURL: "/" }), open);
    const linked = await handleAuth(get(open.EMAIL.link("/magic-link/verify").href), env);
    expect(linked.status).toBe(403);
    expect(cookiesOf(linked)).not.toMatch(/session_token=/);

    const { internalAdapter } = await authFor(env).$context;
    await expect(
      internalAdapter.linkAccount({
        providerId: "google",
        accountId: unique("google"),
        userId: reader.id
      })
    ).rejects.toMatchObject({ body: ADMINS_ONLY });
    await expect(internalAdapter.createSession(reader.id)).rejects.toMatchObject({
      body: ADMINS_ONLY
    });
    expect(await sessions(env, reader.id)).toBe(0);
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM auth_account WHERE user_id = ?", reader.id)
    ).toBe(0);
  });

  it("ends a session made before the rule, and an admin's once demoted", async () => {
    const env = staging();
    const reader = await makeAccount(env);
    expect(await getSession(env, new Headers({ cookie: reader.cookie }))).toBeNull();
    expect(await sessions(env, reader.id)).toBe(0);

    const other = await makeAccount(env);
    const read = await handleAuth(get("/api/auth/get-session", { cookie: other.cookie }), env);
    expect(await read.json()).toBeNull();
    expect(read.headers.getSetCookie().some(cookie => /session_token=;/.test(cookie))).toBe(true);
    expect(await sessions(env, other.id)).toBe(0);

    const admin = await makeAdmin(env);
    const headers = new Headers({ cookie: admin.cookie });
    expect((await getSession(env, headers))?.user.id).toBe(admin.id);
    const asAdmin = await handleAuth(get("/api/auth/get-session", { cookie: admin.cookie }), env);
    expect((await bodyOf<{ user: { id: string } }>(asAdmin)).user.id).toBe(admin.id);
    await env.DB.prepare("UPDATE auth_user SET role = 'user' WHERE id = ?").bind(admin.id).run();
    expect(await getSession(env, headers)).toBeNull();
    expect(await sessions(env, admin.id)).toBe(0);
  });

  it("changes nothing where everyone signs in", async () => {
    const env = testEnv();
    const reader = await makeAccount(env);
    expect((await getSession(env, new Headers({ cookie: reader.cookie })))?.user.id).toBe(
      reader.id
    );
    await handleAuth(post(LINK, { email: reader.email }), env);
    expect(env.EMAIL.sent).toHaveLength(1);
  });
});

describe("the app reviewers' password", () => {
  const reviewing = (values: Parameters<typeof testEnv>[0] = {}) => {
    const email = `${unique("reviewer")}@example.test`;
    return { env: testEnv({ REVIEWER_EMAIL: email, ...values }), email };
  };

  it("has no route without a reviewers' address", async () => {
    const answer = await handleAuth(
      post(PASSWORD, { email: "a@example.test", password: "x" }),
      testEnv()
    );
    expect(answer.status).toBe(404);
  });

  it("is set once, for the reviewers' own session, and then signs that account in", async () => {
    const { env, email } = reviewing();
    const reviewer = await makeAccount(env, { email });
    const reader = await makeAccount(env);
    const password = "a long password for the directory review";
    await expect(
      setReviewerPassword(env, new Headers({ cookie: reader.cookie }), password)
    ).rejects.toMatchObject({ statusCode: 403 });
    const refused = await handleAuth(post(PASSWORD, { email, password }), env);
    expect(refused.status).toBe(401);

    await setReviewerPassword(env, new Headers({ cookie: reviewer.cookie }), password);
    await expect(
      setReviewerPassword(env, new Headers({ cookie: reviewer.cookie }), "another long password")
    ).rejects.toBeTruthy();
    const wrong = await handleAuth(post(PASSWORD, { email, password: "not the password" }), env);
    expect(wrong.status).toBe(401);
    const signedIn = await handleAuth(
      post(PASSWORD, { email: email.toUpperCase(), password }),
      env
    );
    expect(signedIn.status).toBe(200);
    const cookie = cookiesOf(signedIn);
    expect((await getSession(env, new Headers({ cookie })))?.user.id).toBe(reviewer.id);
  });

  it("refuses every other address before any password is compared", async () => {
    const { env } = reviewing();
    const { env: watched, asked } = watchLimits(env);
    const reader = await makeAccount(watched);
    const answer = await handleAuth(
      post(PASSWORD, { email: reader.email, password: "whatever" }),
      watched
    );
    expect([answer.status, await answer.json()]).toEqual([
      401,
      { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }
    ]);
    expect(asked).not.toContain("passwordSignIn");
  });

  it("counts each try for the reviewers' address", async () => {
    const { env, email } = reviewing();
    const { env: watched, asked } = watchLimits(env);
    await handleAuth(post(PASSWORD, { email, password: "whatever" }), watched);
    expect(asked).toEqual(["passwordSignIn", "passwordSignInDaily"]);
  });

  it("asks for Turnstile's answer where the deploy has a key", async () => {
    const { env, email } = reviewing({ TURNSTILE_SECRET_KEY: "turnstile-secret" });
    const answer = await handleAuth(post(PASSWORD, { email, password: "whatever" }), env);
    expect([answer.status, await answer.json()]).toEqual([
      400,
      { code: "MISSING_RESPONSE", message: "Missing CAPTCHA response" }
    ]);
  });

  it("opens no sign-up and no password reset", async () => {
    const { env, email } = reviewing();
    for (const path of [
      "/api/auth/sign-up/email",
      "/api/auth/request-password-reset",
      "/api/auth/reset-password"
    ]) {
      const answer = await handleAuth(
        post(path, { email, password: "x".repeat(20), name: "x" }),
        env
      );
      expect([path, answer.status]).toEqual([path, 404]);
    }
  });

  it("gives the reviewers no session where only admins sign in", async () => {
    const { env, email } = reviewing();
    const reviewer = await makeAccount(env, { email });
    const password = "a long password for the directory review";
    await setReviewerPassword(env, new Headers({ cookie: reviewer.cookie }), password);
    const answer = await handleAuth(
      post(PASSWORD, { email, password }),
      staging({ REVIEWER_EMAIL: email })
    );
    expect([answer.status, await answer.json()]).toEqual([403, ADMINS_ONLY]);
    expect(answer.headers.getSetCookie().some(cookie => /session_token=[^;]/.test(cookie))).toBe(
      false
    );
  });
});

it("keeps the reviewers' sign-in to the site's own pages", async () => {
  const email = `${unique("reviewer")}@example.test`;
  const env = testEnv({ REVIEWER_EMAIL: email });
  const answer = await handleAuth(
    post(PASSWORD, { email, password: "x" }, { origin: `${ORIGIN}.evil` }),
    env
  );
  expect(answer.status).toBe(403);
});
