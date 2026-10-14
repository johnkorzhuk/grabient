import { handleAuth } from "@grabient/server/auth/gate.ts";
import { setReviewerPassword } from "@grabient/server/auth/reviewer.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import { describe, expect, it, vi } from "vitest";
import {
  address,
  cookiesOf,
  makeAccount,
  ORIGIN,
  post,
  testEnv,
  unique,
  watchLimits
} from "./helpers.ts";

const PASSWORD = "/api/auth/sign-in/email";
const SET = "/api/auth/reviewer-password";

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
    const reader = await makeAccount(testEnv());
    const set = await handleAuth(
      post(SET, { password: "a long password" }, { cookie: reader.cookie }),
      testEnv()
    );
    expect(set.status).toBe(404);
  });

  it("takes the password the reviewers' account sends from the site, once, and no other account's", async () => {
    const { env, email } = reviewing();
    const reviewer = await makeAccount(env, { email });
    const reader = await makeAccount(env);
    const password = "a long password for the directory review";
    const send = async (init: Parameters<typeof post>[2], body: unknown = { password }) => {
      const answer = await handleAuth(post(SET, body, init), env);
      return [answer.status, await answer.json(), answer.headers.get("Cache-Control")];
    };
    const refusal = { error: "Only the reviewers' account has a password." };
    expect(await send({})).toEqual([403, refusal, "private, no-store"]);
    expect(await send({ cookie: reader.cookie })).toEqual([403, refusal, "private, no-store"]);
    expect(await send({ cookie: reviewer.cookie, origin: `${ORIGIN}.evil` })).toEqual([
      403,
      { error: "Invalid request." },
      "private, no-store"
    ]);
    expect((await send({ cookie: reviewer.cookie }, { password: 12345678 }))[0]).toBe(400);
    expect((await send({ cookie: reviewer.cookie }, { password: "short" }))[0]).toBe(400);
    expect((await handleAuth(post(PASSWORD, { email, password }), env)).status).toBe(401);

    expect(await send({ cookie: reviewer.cookie })).toEqual([
      200,
      { ok: true },
      "private, no-store"
    ]);
    const again = await send({ cookie: reviewer.cookie }, { password: "another long password" });
    expect([again[0], typeof (again[1] as { error: unknown }).error]).toEqual([400, "string"]);
    const signedIn = await handleAuth(post(PASSWORD, { email, password }), env);
    expect(signedIn.status).toBe(200);
    expect((await getSession(env, new Headers({ cookie: cookiesOf(signedIn) })))?.user.id).toBe(
      reviewer.id
    );
    const other = await handleAuth(
      post(PASSWORD, { email, password: "another long password" }),
      env
    );
    expect(other.status).toBe(401);
  });

  it("counts each password sent as a try at signing in from that address", async () => {
    const { env } = reviewing();
    const { env: watched, asked } = watchLimits(env);
    const ip = address();
    const statuses: number[] = [];
    for (let sent = 0; sent < 11; sent++) {
      const answer = await handleAuth(post(SET, { password: "a long password" }, { ip }), watched);
      statuses.push(answer.status);
    }
    // the eleventh is refused by what the isolate already counted, without asking again
    expect(asked).toEqual(Array.from({ length: 10 }, () => "passwordSignIn"));
    expect(statuses).toEqual([...Array.from({ length: 10 }, () => 403), 429]);
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

  it("takes a password only while its account is the reviewers' address", async () => {
    const { env, email } = reviewing();
    const reviewer = await makeAccount(env, { email });
    const password = "a long password for the directory review";
    await setReviewerPassword(env, new Headers({ cookie: reviewer.cookie }), password);
    // the deploy names another address: the old one's right password is refused as any other address is
    const moved = testEnv({ REVIEWER_EMAIL: `${unique("reviewer")}@example.test` });
    const { env: watched, asked } = watchLimits(moved);
    const answer = await handleAuth(post(PASSWORD, { email, password }), watched);
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

  it("signs the reviewer in once Turnstile passes the page's answer, sent with the secret and no address", async () => {
    const { env, email } = reviewing({ TURNSTILE_SECRET_KEY: "turnstile-secret" });
    const reviewer = await makeAccount(env, { email });
    const password = "a long password for the directory review";
    await setReviewerPassword(env, new Headers({ cookie: reviewer.cookie }), password);
    const sent: { url: string; body: unknown }[] = [];
    let passes = true;
    const siteverify = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      sent.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return Response.json({ success: passes, hostname: "grabient.test" });
    });
    try {
      const signIn = (answer: string) =>
        handleAuth(
          post(PASSWORD, { email, password }, { headers: { "x-captcha-response": answer } }),
          env
        );
      const signedIn = await signIn("a passing answer");
      expect(signedIn.status).toBe(200);
      expect(sent).toEqual([
        {
          url: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          body: { secret: "turnstile-secret", response: "a passing answer" }
        }
      ]);
      passes = false;
      const refused = await signIn("a failing answer");
      expect([refused.status, await refused.json()]).toEqual([
        403,
        { code: "VERIFICATION_FAILED", message: "Captcha verification failed" }
      ]);
    } finally {
      siteverify.mockRestore();
    }
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
