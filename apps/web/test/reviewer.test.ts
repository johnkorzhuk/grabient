import { handleAuth } from "@grabient/server/auth/gate.ts";
import { setReviewerPassword } from "@grabient/server/auth/reviewer.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import { describe, expect, it } from "vitest";
import { cookiesOf, makeAccount, ORIGIN, post, testEnv, unique, watchLimits } from "./helpers.ts";

const PASSWORD = "/api/auth/sign-in/email";

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
