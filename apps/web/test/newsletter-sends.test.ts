import { all, first, run } from "@grabient/server/db/d1.ts";
import { setFlag } from "@grabient/server/flags/flags.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SendsAnswer } from "../src/features/newsletter/input.ts";
import { sendsResponse } from "../src/server/newsletter/routes.ts";
import { NotReachable, sendIssue } from "../src/server/newsletter/send.ts";
import {
  AHEAD_MS,
  arm,
  campaignTags,
  checkLetters,
  DAILY,
  deliverDue,
  LATE_MS,
  LEAD_MS,
  PER_RUN,
  prepare,
  proof,
  steer,
  TOKEN_SLOT
} from "../src/server/newsletter/sends.ts";
import {
  type Account,
  bodyOf,
  get,
  makeAccount,
  makeAdmin,
  ORIGIN,
  type TestEnv,
  testEnv,
  unique
} from "./helpers.ts";

const SITE = "https://grabient.com";
const SEED = "kS7Q8Yy5S_SChv0";
/** Production's bindings, which alone send an issue to readers. */
const production = (values: Partial<TestEnv> = {}) =>
  testEnv({
    RESEND_API_KEY: "re_test_key",
    NEWSLETTER_FROM: "news@grabient.com",
    DEPLOYMENT: "production",
    PUBLIC_ORIGIN: SITE,
    ...values
  });

interface Mail {
  to: string;
  key: string | null;
  subject: string;
  html: string;
  text: string;
  unsubscribe: string;
}
/** Resend and the site, both stood in for: each email Resend was asked for, and the answer `resend` gives it. */
function mailroom(
  resend: (mail: Mail, n: number) => Response = () => Response.json({ id: "email" })
) {
  const mails: Mail[] = [];
  const checked: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url !== "https://api.resend.com/emails") {
      checked.push(url);
      return new Response("ok");
    }
    const body = JSON.parse(String(init?.body));
    const mail: Mail = {
      to: body.to[0],
      key: new Headers(init?.headers).get("Idempotency-Key"),
      subject: body.subject,
      html: body.html,
      text: body.text,
      unsubscribe: body.headers["List-Unsubscribe"]
    };
    mails.push(mail);
    return resend(mail, mails.length);
  });
  return { mails, checked };
}

const reader = async (
  env: TestEnv,
  options: { liked?: boolean; locale?: string; email?: string } = {}
) => {
  const account = await makeAccount(env, {
    email: options.email ?? `${unique("reader")}@inbox.grabient.dev`
  });
  if (options.liked) {
    await run(
      env.DB,
      `INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at)
       VALUES (?, ?, 7, 'linearGradient', 90, ?)`,
      account.id,
      SEED,
      Date.now()
    );
  }
  if (options.locale)
    await run(env.DB, "UPDATE auth_user SET locale = ? WHERE id = ?", options.locale, account.id);
  return account;
};

const sendRow = (env: TestEnv, id: string) =>
  first<{ state: string; recipients: number; reason: string | null; left_out: string }>(
    env.DB,
    "SELECT state, recipients, reason, left_out FROM k_newsletter_sends WHERE id = ?",
    id
  );
const outbox = (env: TestEnv) =>
  all<{
    user_id: string;
    send_id: string;
    state: string;
    attempts: number;
    resend_id: string | null;
  }>(
    env.DB,
    "SELECT user_id, send_id, state, attempts, resend_id FROM k_newsletter_outbox ORDER BY user_id"
  );

/** A prepared send, or the test fails with why it was refused. */
async function prepared(env: TestEnv, admin: Account, segment: "admins" | "likers" | "everyone") {
  const made = await prepare(env, SITE, admin.id, 1, segment);
  if (!made || "error" in made) throw new Error(`not prepared: ${JSON.stringify(made)}`);
  return made.id;
}
/** Armed as if fifteen minutes ago, so its start has just passed. */
async function armedNow(env: TestEnv, admin: Account, id: string) {
  const row = await sendRow(env, id);
  const start = Date.now() - 1000;
  expect(await arm(env, admin.id, id, row?.recipients ?? -1, start, start - LEAD_MS)).toBeNull();
}

beforeEach(async () => {
  // a file's database is its own: each test starts from no accounts and no sends
  await run(testEnv().DB, "DELETE FROM k_newsletter_outbox");
  await run(testEnv().DB, "DELETE FROM k_newsletter_letters");
  await run(testEnv().DB, "DELETE FROM k_newsletter_sends");
  await run(testEnv().DB, "DELETE FROM auth_user");
});
afterEach(() => vi.restoreAllMocks());

describe("preparing a send", () => {
  it("finds each reader once, says who it left out and why, draws the letters it checked, and sends nothing", async () => {
    const { mails, checked } = mailroom();
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    const liker = await reader(env, { liked: true, locale: "ja" });
    const plain = await reader(env);
    const ended = await reader(env, { liked: true });
    await run(
      env.DB,
      "INSERT INTO k_newsletter (user_id, token, subscribed, updated_at) VALUES (?, ?, 0, 0)",
      ended.id,
      "a".repeat(64)
    );
    const waiting = await reader(env, { liked: true });
    await run(env.DB, "UPDATE auth_user SET newsletter_opt_in = 1 WHERE id = ?", waiting.id);
    const persona = await reader(env, {
      liked: true,
      email: `${unique("p")}@personas.grabient.invalid`
    });
    await run(
      env.DB,
      "INSERT INTO k_personas (user_id, agent, handle, created_at) VALUES (?, 'agent', ?, 0)",
      persona.id,
      unique("handle")
    );
    await reader(env, { liked: true, email: `${unique("probe")}@nonexistent-probe.test` });

    const id = await prepared(env, admin, "likers");
    expect(await sendRow(env, id)).toMatchObject({ state: "prepared", recipients: 1 });
    expect(JSON.parse((await sendRow(env, id))?.left_out ?? "")).toEqual({
      unsubscribed: 2,
      personas: 1,
      undeliverable: 1,
      already: 0
    });
    expect((await outbox(env)).map(row => [row.user_id, row.state])).toEqual([
      [liker.id, "queued"]
    ]);
    const letters = await all<{ locale: string; html: string }>(
      env.DB,
      "SELECT locale, html FROM k_newsletter_letters WHERE send_id = ? ORDER BY locale",
      id
    );
    expect(letters.map(letter => letter.locale)).toEqual(["en", "ja"]);
    for (const letter of letters) expect(letter.html).toContain(`/unsubscribe/${TOKEN_SLOT}`);
    expect(checked.length).toBeGreaterThan(5);
    expect(checked.every(url => url.startsWith(`${SITE}/`))).toBe(true);
    expect(mails).toEqual([]);
    expect(plain.id).not.toBe(liker.id);
  });

  it("refuses while another send is under way, for an issue not yet published, and with no one left", async () => {
    mailroom();
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    expect(await prepare(env, SITE, admin.id, 2, "everyone")).toMatchObject({ status: 400 });
    const id = await prepared(env, admin, "admins");
    expect(await prepare(env, SITE, admin.id, 1, "everyone")).toMatchObject({ status: 409 });
    expect(await steer(env, id, "cancel")).toBeNull();
    // the admin is free again once the send is cancelled, then reached, so no one is left
    const again = await prepared(env, admin, "admins");
    await run(env.DB, "UPDATE k_newsletter_outbox SET state = 'sent' WHERE send_id = ?", again);
    await run(env.DB, "UPDATE k_newsletter_sends SET state = 'done' WHERE id = ?", again);
    expect(await prepare(env, SITE, admin.id, 1, "admins")).toMatchObject({ status: 409 });
    expect(await all(env.DB, "SELECT id FROM k_newsletter_sends WHERE state = 'prepared'")).toEqual(
      []
    );
  });

  it("writes nothing when a link does not load", async () => {
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    vi.spyOn(globalThis, "fetch").mockImplementation(async input =>
      String(input).includes("/collections")
        ? new Response("gone", { status: 404 })
        : new Response("ok")
    );
    const made = await prepare(env, SITE, admin.id, 1, "admins");
    expect(made).toMatchObject({ status: 422 });
    // the address as a reader's mail app opens it, the issue's campaign and all
    expect(made && "problems" in made && made.problems).toContainEqual({
      kind: "link",
      url: `${SITE}/collections?${campaignTags(1)}`,
      status: 404
    });
    expect(await all(env.DB, "SELECT id FROM k_newsletter_sends")).toEqual([]);
    expect(await outbox(env)).toEqual([]);
  });

  it("checks that every address is the site's, loads, and that the email keeps its way out and its size", async () => {
    mailroom();
    const letter = (html: string, text = TOKEN_SLOT) => ({
      locale: "en" as const,
      subject: "Hi",
      html,
      text
    });
    const ok = await checkLetters(
      [letter(`<a href="${SITE}/about">a</a><a href="${SITE}/u/${TOKEN_SLOT}">u</a>`)],
      SITE
    );
    expect(ok).toEqual({ problems: [], links: 1, bytes: expect.any(Number) });
    const bad = await checkLetters(
      [
        letter(
          `<a href="https://elsewhere.example/x">x</a><img src="${SITE}/a.png">${"x".repeat(100_001)}`,
          "no token"
        )
      ],
      SITE
    );
    expect(bad.problems).toEqual([
      { kind: "size", bytes: expect.any(Number) },
      { kind: "unsubscribe" },
      { kind: "outside", url: "https://elsewhere.example/x" }
    ]);
  });
});

describe("arming a send", () => {
  it("takes the prepared count typed back and a start between fifteen minutes and a week away, once", async () => {
    mailroom();
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await reader(env, { liked: true });
    const id = await prepared(env, admin, "likers");
    const now = Date.now();
    expect(await arm(env, admin.id, id, 2, now + LEAD_MS, now)).toMatchObject({ status: 400 });
    expect(await arm(env, admin.id, id, 1, now + LEAD_MS - 1, now)).toMatchObject({ status: 400 });
    expect(await arm(env, admin.id, id, 1, now + AHEAD_MS + 1, now)).toMatchObject({ status: 400 });
    expect((await sendRow(env, id))?.state).toBe("prepared");
    expect(await arm(env, admin.id, id, 1, now + LEAD_MS, now)).toBeNull();
    expect(await arm(env, admin.id, id, 1, now + LEAD_MS, now)).toMatchObject({ status: 409 });
    expect((await sendRow(env, id))?.state).toBe("armed");
  });
});

describe("the minute job", () => {
  it("sends nothing before the start, nor while the newsletter is off", async () => {
    const { mails } = mailroom();
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await reader(env, { liked: true });
    const id = await prepared(env, admin, "likers");
    expect(await deliverDue(env)).toBeUndefined();
    const now = Date.now();
    expect(await arm(env, admin.id, id, 1, now + LEAD_MS, now)).toBeNull();
    expect(await deliverDue(env, now + LEAD_MS - 1)).toBeUndefined();
    await setFlag(env, "newsletter", false, admin.id);
    expect(await deliverDue(env, now + LEAD_MS)).toEqual({
      send: id,
      waiting: "the newsletter is off"
    });
    expect(mails).toEqual([]);
    expect((await sendRow(env, id))?.state).toBe("armed");
  });

  it("sends each reader one email of their own, fifty a minute, under a key per reader, then stops for good", async () => {
    const { mails } = mailroom();
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    for (let i = 0; i < PER_RUN + 4; i++) await reader(env);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    expect(await deliverDue(env)).toMatchObject({ send: id, sent: PER_RUN });
    expect(await deliverDue(env)).toMatchObject({ send: id, sent: 5, done: true });
    expect(await deliverDue(env)).toBeUndefined();
    expect(mails).toHaveLength(PER_RUN + 5);
    expect(new Set(mails.map(mail => mail.to)).size).toBe(PER_RUN + 5);
    const rows = await outbox(env);
    expect(rows.every(row => row.state === "sent" && row.resend_id === "email")).toBe(true);
    const tokens = await all<{ user_id: string; token: string }>(
      env.DB,
      "SELECT user_id, token FROM k_newsletter"
    );
    for (const mail of mails) {
      const account = await first<{ id: string }>(
        env.DB,
        "SELECT id FROM auth_user WHERE email = ?",
        mail.to
      );
      const token = tokens.find(row => row.user_id === account?.id)?.token ?? "";
      expect(mail.key).toBe(`newsletter/${id}/${account?.id}`);
      expect(mail.unsubscribe).toBe(`<${SITE}/unsubscribe/${token}>`);
      expect(mail.html).toContain(`${SITE}/unsubscribe/${token}`);
      expect(mail.text).toContain(`${SITE}/unsubscribe/${token}`);
      expect(mail.html + mail.text).not.toContain(TOKEN_SLOT);
      expect(mail.subject).toBe("Rising in October, and collections");
    }
    expect((await sendRow(env, id))?.state).toBe("done");
  });

  it("never reaches a reader twice: a later send of the issue leaves out every account and address it reached", async () => {
    const { mails } = mailroom();
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    const liker = await reader(env, { liked: true });
    const other = await reader(env);
    const first_ = await prepared(env, admin, "likers");
    await armedNow(env, admin, first_);
    await deliverDue(env);
    // the same address on a second account, as a mail provider's capitals can make it
    await makeAccount(env, { email: liker.email.toUpperCase() });
    const rest = await prepared(env, admin, "everyone");
    expect(JSON.parse((await sendRow(env, rest))?.left_out ?? "").already).toBe(2);
    await armedNow(env, admin, rest);
    await deliverDue(env);
    expect(mails.map(mail => mail.to).sort()).toEqual(
      [admin.email, liker.email, other.email].sort()
    );
  });

  it("skips a reader who ended the newsletter after the send was prepared", async () => {
    const { mails } = mailroom();
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    const gone = await reader(env, { liked: true });
    const id = await prepared(env, admin, "likers");
    await run(
      env.DB,
      "INSERT INTO k_newsletter (user_id, token, subscribed, updated_at) VALUES (?, ?, 0, 0)",
      gone.id,
      "b".repeat(64)
    );
    await armedNow(env, admin, id);
    expect(await deliverDue(env)).toMatchObject({ sent: 0, skipped: 1, done: true });
    expect(mails).toEqual([]);
  });

  it("holds on a pause, goes on after a resume, and a cancel frees the readers it had not reached", async () => {
    const { mails } = mailroom();
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    for (let i = 0; i < PER_RUN + 1; i++) await reader(env);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    expect(await steer(env, id, "pause")).toBeNull();
    expect(await deliverDue(env)).toBeUndefined();
    expect(await steer(env, id, "resume")).toBeNull();
    await deliverDue(env);
    expect(mails).toHaveLength(PER_RUN);
    expect(await steer(env, id, "cancel")).toMatchObject({ status: 409 });
    expect(await steer(env, id, "pause")).toBeNull();
    expect(await steer(env, id, "cancel")).toBeNull();
    expect((await outbox(env)).filter(row => row.state === "queued")).toEqual([]);
    expect(await deliverDue(env)).toBeUndefined();
    const again = await prepared(env, admin, "everyone");
    expect((await sendRow(env, again))?.recipients).toBe(2);
  });

  it("gives an email back when Resend is busy, and stops the run there", async () => {
    const { mails } = mailroom((_, n) =>
      n === 2
        ? Response.json({ name: "rate_limit_exceeded" }, { status: 429 })
        : Response.json({ id: "email" })
    );
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    for (let i = 0; i < 3; i++) await reader(env);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    expect(await deliverDue(env)).toMatchObject({ sent: 1, failed: 0 });
    expect((await outbox(env)).map(row => row.state).sort()).toEqual([
      "queued",
      "queued",
      "queued",
      "sent"
    ]);
    expect(await deliverDue(env)).toMatchObject({ sent: 3, done: true });
    // the busy one went again under its own key
    expect(mails[1]?.key).toBe(mails[2]?.key);
  });

  it("pauses after three errors in a row, keeping the emails to try again under the same key", async () => {
    mailroom(() => Response.json({ name: "internal_server_error" }, { status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    for (let i = 0; i < 4; i++) await reader(env);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    expect(await deliverDue(env)).toMatchObject({ paused: "errors" });
    expect(await sendRow(env, id)).toMatchObject({ state: "paused", reason: "errors" });
    const rows = await outbox(env);
    expect(rows.map(row => row.state)).toEqual(["queued", "queued", "queued", "queued", "queued"]);
    expect(rows.map(row => row.attempts).sort()).toEqual([0, 0, 1, 1, 1]);
  });

  it("marks an address Resend refuses as failed and goes on; a refused key or a changed letter pauses the send", async () => {
    const answers: Record<string, Response> = {};
    mailroom(mail => answers[mail.to] ?? Response.json({ id: "email" }));
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    const refused = await reader(env, { liked: true });
    answers[refused.email] = Response.json({ name: "validation_error" }, { status: 422 });
    await reader(env, { liked: true });
    const id = await prepared(env, admin, "likers");
    await armedNow(env, admin, id);
    expect(await deliverDue(env)).toMatchObject({ sent: 1, failed: 1, done: true });

    const keyed = await reader(env);
    answers[keyed.email] = Response.json({ name: "invalid_api_key" }, { status: 401 });
    const second = await prepared(env, admin, "everyone");
    await armedNow(env, admin, second);
    expect(await deliverDue(env)).toMatchObject({ paused: "key" });
    expect(await steer(env, second, "cancel")).toBeNull();

    const changed = await reader(env);
    answers[changed.email] = Response.json({ name: "invalid_idempotent_request" }, { status: 409 });
    delete answers[keyed.email];
    const third = await prepared(env, admin, "everyone");
    await armedNow(env, admin, third);
    expect(await deliverDue(env)).toMatchObject({ paused: "changed" });
    const row = await first<{ state: string }>(
      env.DB,
      "SELECT state FROM k_newsletter_outbox WHERE user_id = ?",
      changed.id
    );
    expect(row?.state).toBe("unknown");
  });

  it("tries an email a dead run left again under the same key within the day, and never after it", async () => {
    const { mails } = mailroom();
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    const fresh = await reader(env);
    const old = await reader(env);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    const now = Date.now();
    await run(
      env.DB,
      `UPDATE k_newsletter_outbox SET state = 'sending', attempts = 1, tried_at = ?, first_tried_at = ?
       WHERE user_id = ?`,
      now - 6 * 60_000,
      now - 6 * 60_000,
      fresh.id
    );
    await run(
      env.DB,
      `UPDATE k_newsletter_outbox SET state = 'sending', attempts = 1, tried_at = ?, first_tried_at = ?
       WHERE user_id = ?`,
      now - 6 * 60_000,
      now - 21 * 3_600_000,
      old.id
    );
    expect(await deliverDue(env)).toMatchObject({ sent: 2 });
    expect(mails.map(mail => mail.key).sort()).toEqual(
      [`newsletter/${id}/${admin.id}`, `newsletter/${id}/${fresh.id}`].sort()
    );
    const row = await first<{ state: string }>(
      env.DB,
      "SELECT state FROM k_newsletter_outbox WHERE user_id = ?",
      old.id
    );
    expect(row?.state).toBe("unknown");
  });

  it("pauses at the day's ceiling for every send together", async () => {
    const { mails } = mailroom();
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    await reader(env);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    const now = Date.now();
    await run(
      env.DB,
      "INSERT INTO k_newsletter_sends (id, issue, origin, segment, state, created_by, created_at, updated_at) VALUES ('old', 9, ?, 'everyone', 'done', ?, 0, 0)",
      SITE,
      admin.id
    );
    await run(
      env.DB,
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?1)
       INSERT INTO auth_user (id, name, email, email_verified, role, created_at, updated_at)
       SELECT 'bulk-' || i, '', 'bulk-' || i || '@inbox.grabient.dev', 1, 'user', 0, 0 FROM n`,
      DAILY
    );
    await run(
      env.DB,
      `INSERT INTO k_newsletter_outbox (issue, user_id, send_id, state, sent_at)
       SELECT 9, id, 'old', 'sent', ? FROM auth_user WHERE id LIKE 'bulk-%'`,
      now - 60_000
    );
    expect(await deliverDue(env)).toEqual({ send: id, paused: "daily" });
    expect(mails).toEqual([]);
  });
});

describe("beyond production", () => {
  it("prepares and sends only to the admins and Resend's test addresses", async () => {
    const { mails } = mailroom();
    const env = production({
      DEPLOYMENT: "staging",
      PUBLIC_ORIGIN: "https://staging.grabient.com"
    });
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    await reader(env, { liked: true });
    const test = await reader(env, { email: "delivered@resend.dev" });
    const made = await prepare(env, "https://staging.grabient.com", admin.id, 1, "everyone");
    if (!made || "error" in made) throw new Error("not prepared");
    expect((await outbox(env)).map(row => row.user_id).sort()).toEqual([admin.id, test.id].sort());
    const row = await sendRow(env, made.id);
    const start = Date.now() - 1000;
    expect(
      await arm(env, admin.id, made.id, row?.recipients ?? -1, start, start - LEAD_MS)
    ).toBeNull();
    await deliverDue(env);
    expect(mails.map(mail => mail.to).sort()).toEqual([admin.email, "delivered@resend.dev"].sort());
  });

  it("refuses to send a reader's address before Resend is asked", async () => {
    const { mails } = mailroom();
    const env = production({
      DEPLOYMENT: "staging",
      PUBLIC_ORIGIN: "https://staging.grabient.com"
    });
    const letter = { subject: "Hi", html: "<p>Hi</p>", text: "Hi" };
    const to = {
      email: "someone@gmail.com",
      locale: "en" as const,
      unsubscribe: `${ORIGIN}/unsubscribe/x`
    };
    await expect(sendIssue(env, to, letter)).rejects.toBeInstanceOf(NotReachable);
    await expect(
      sendIssue(production({ PUBLIC_ORIGIN: "https://grabient.test" }), to, letter)
    ).rejects.toBeInstanceOf(NotReachable);
    expect(mails).toEqual([]);
    await sendIssue(env, to, letter, { own: true });
    await sendIssue(env, { ...to, email: "bounced@resend.dev" }, letter);
    expect(mails).toHaveLength(2);
  });
});

describe("the sends' answer", () => {
  it("is an admin's alone; a step comes from the site", async () => {
    mailroom();
    const env = production();
    const user = await makeAccount(env);
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", false, admin.id);
    expect((await sendsResponse(get("/api/me/newsletter/sends"), env)).status).toBe(401);
    expect(
      (await sendsResponse(get("/api/me/newsletter/sends", { cookie: user.cookie }), env)).status
    ).toBe(403);
    const read = await sendsResponse(
      get("/api/me/newsletter/sends", { cookie: admin.cookie }),
      env
    );
    const answer = await bodyOf<SendsAnswer>(read);
    expect(answer).toMatchObject({ sends: [], on: false, reaches: true });
    expect(answer.issues.map(issue => issue.number)).toEqual([1]);
    const step = (origin: string) =>
      sendsResponse(
        new Request(new URL("/api/me/newsletter/sends", ORIGIN), {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: admin.cookie, Origin: origin },
          body: JSON.stringify({ action: "prepare", issue: 1, segment: "admins" })
        }),
        env
      );
    expect((await step("https://evil.test")).status).toBe(403);
    const done = await step(ORIGIN);
    const after = await bodyOf<SendsAnswer>(done);
    expect([done.status, after.sends[0]?.state, after.sends[0]?.recipients]).toEqual([
      200,
      "prepared",
      1
    ]);
  });

  it("sends the proof to the admin alone, as readers get it, and touches no outbox row", async () => {
    const { mails } = mailroom();
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await reader(env, { liked: true });
    const id = await prepared(env, admin, "likers");
    const before = await outbox(env);
    expect(await proof(env, admin.id, id)).toBeNull();
    expect(mails.map(mail => [mail.to, mail.key, mail.subject])).toEqual([
      [admin.email, null, "Rising in October, and collections"]
    ]);
    expect(mails[0]?.html).not.toContain(TOKEN_SLOT);
    expect(await outbox(env)).toEqual(before);
  });
});

/* A database that fails the statements whose SQL holds `marker`, `times` times, as an overloaded D1 does. */
function failing(env: TestEnv, marker: string, times = Number.POSITIVE_INFINITY): TestEnv {
  let left = times;
  const db = env.DB;
  const refuse = async () => {
    left--;
    throw new Error("D1_ERROR: Network connection lost.");
  };
  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") {
        return (sql: string) => {
          const statement = target.prepare(sql);
          if (!sql.includes(marker)) return statement;
          return {
            bind: (...args: unknown[]) => {
              const bound = statement.bind(...args);
              const or = <K extends "run" | "first" | "all">(name: K) =>
                left > 0 ? refuse : () => (bound[name] as () => Promise<unknown>).call(bound);
              return { run: or("run"), first: or("first"), all: or("all") };
            }
          };
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return { ...env, DB: proxy as unknown as D1Database } as TestEnv;
}
const HOUR = 3_600_000;
const sendOf = (env: TestEnv, id: string) =>
  first<{ state: string; reason: string | null }>(
    env.DB,
    "SELECT state, reason FROM k_newsletter_sends WHERE id = ?",
    id
  );
const keysPosted = (mails: Mail[]) => {
  const byKey = new Map<string, number>();
  for (const mail of mails) byKey.set(mail.key ?? "", (byKey.get(mail.key ?? "") ?? 0) + 1);
  return byKey;
};

describe("a send that meets trouble", () => {
  it("never sends again what Resend may have taken a day ago or more, after a long pause", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { mails } = mailroom((_, n) => {
      if (n <= 3)
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return Response.json({ id: `email-${n}` });
    });
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    for (let i = 0; i < 4; i++) await reader(env);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    expect(await deliverDue(env)).toMatchObject({ paused: "errors" });
    const later = Date.now() + 25 * HOUR;
    expect(await steer(env, id, "resume", later)).toBeNull();
    expect(await deliverDue(env, later)).toMatchObject({ sent: 2, done: true });
    expect([...keysPosted(mails).values()].every(n => n === 1)).toBe(true);
    expect((await outbox(env)).map(row => row.state).sort()).toEqual([
      "sent",
      "sent",
      "unknown",
      "unknown",
      "unknown"
    ]);
  });

  it("tries an email Resend took again under its own key when the database fails to record it, and never pauses for it", async () => {
    const { mails } = mailroom((_, n) => Response.json({ id: `email-${n}` }));
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    for (let i = 0; i < 2; i++) await reader(env);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    await expect(deliverDue(failing(env, "SET state = ?, sent_at = ?", 1))).rejects.toThrow(
      /D1_ERROR/
    );
    expect(mails).toHaveLength(1);
    const after = await outbox(env);
    expect(after.map(row => [row.state, row.attempts]).sort()).toEqual([
      ["queued", 0],
      ["queued", 0],
      ["queued", 1]
    ]);
    expect(await deliverDue(env)).toMatchObject({ sent: 3, done: true });
    // the one Resend took first went again under the same key, which Resend answers without sending
    const posted = keysPosted(mails);
    expect([...posted.values()].sort()).toEqual([1, 1, 2]);
    expect((await sendOf(env, id))?.state).toBe("done");
  });

  it("gives back what a failing database stopped it from trying, never marking it unknown", async () => {
    const { mails } = mailroom(() => Response.json({ id: "email" }));
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    for (let i = 0; i < 3; i++) await reader(env);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    const broken = failing(env, "SELECT u.email, u.locale, n.token");
    for (let i = 0; i < 3; i++) await expect(deliverDue(broken)).rejects.toThrow(/D1_ERROR/);
    expect((await outbox(env)).map(row => [row.state, row.attempts])).toEqual(
      Array(4).fill(["queued", 0])
    );
    expect(mails).toEqual([]);
    expect(await deliverDue(env)).toMatchObject({ sent: 4, done: true });
  });

  it("pauses when Resend's quota is spent, holding the email untried", async () => {
    let spent = true;
    const { mails } = mailroom(() =>
      spent
        ? Response.json({ name: "monthly_quota_exceeded" }, { status: 429 })
        : Response.json({ id: "email" })
    );
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    await reader(env);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    expect(await deliverDue(env)).toMatchObject({ paused: "quota" });
    expect(await sendOf(env, id)).toMatchObject({ state: "paused", reason: "quota" });
    expect((await outbox(env)).map(row => [row.state, row.attempts])).toEqual([
      ["queued", 0],
      ["queued", 0]
    ]);
    expect(await deliverDue(env)).toBeUndefined();
    spent = false;
    expect(await steer(env, id, "resume")).toBeNull();
    expect(await deliverDue(env)).toMatchObject({ sent: 2, done: true });
    expect(mails).toHaveLength(3);
  });

  it("frees the readers a cancel finds untried, even while a run is out, and keeps the ones Resend may have taken", async () => {
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    for (let i = 0; i < 12; i++) await reader(env);
    let id = "";
    mailroom(async (_, n) => {
      if (n === 1) {
        expect(await steer(env, id, "pause")).toBeNull();
        expect(await steer(env, id, "cancel")).toBeNull();
      }
      return Response.json({ id: `email-${n}` });
    });
    id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    await deliverDue(env);
    const left = (await outbox(env)).filter(row => row.send_id === id);
    expect(left.some(row => row.state === "queued" || row.state === "sending")).toBe(false);
    const again = await prepare(env, SITE, admin.id, 1, "everyone");
    expect(again && "id" in again).toBe(true);
    const freed = (await outbox(env)).filter(
      row => again && "id" in again && row.send_id === again.id
    );
    expect(freed.length).toBe(13 - left.filter(row => row.state === "sent").length);
  });

  it("arms with the readers it holds now, after an account is deleted", async () => {
    mailroom(() => Response.json({ id: "email" }));
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    const gone = await reader(env);
    await reader(env);
    const id = await prepared(env, admin, "everyone");
    await run(env.DB, "DELETE FROM auth_user WHERE id = ?", gone.id);
    const now = Date.now();
    expect(await arm(env, admin.id, id, 3, now + LEAD_MS, now)).toMatchObject({ status: 400 });
    expect(await arm(env, admin.id, id, 2, now + LEAD_MS, now)).toBeNull();
  });

  it("finishes when nothing is left, however many failed on the way", async () => {
    const refused = new Set<string>();
    mailroom(mail =>
      refused.has(mail.to)
        ? Response.json({ name: "validation_error" }, { status: 422 })
        : Response.json({ id: "email" })
    );
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    for (let i = 0; i < 3; i++) refused.add((await reader(env)).email);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    expect(await deliverDue(env)).toMatchObject({ sent: 1, failed: 3, done: true });
    expect((await sendOf(env, id))?.state).toBe("done");
  });

  it("waits for an admin when it has not begun an hour past its start, and goes from a resume", async () => {
    const { mails } = mailroom(() => Response.json({ id: "email" }));
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", false, admin.id);
    await reader(env);
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    expect(await deliverDue(env)).toMatchObject({ waiting: "the newsletter is off" });
    const late = Date.now() + LATE_MS + 60_000;
    await setFlag(env, "newsletter", true, admin.id);
    expect(await deliverDue(env, late)).toEqual({ send: id, paused: "late" });
    expect(mails).toEqual([]);
    expect(await steer(env, id, "resume", late)).toBeNull();
    expect(await deliverDue(env, late)).toMatchObject({ sent: 2, done: true });
  });

  it("checks its letters' files again as it is armed and as it begins", async () => {
    let gone = false;
    const mails: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === "https://api.resend.com/emails") {
        mails.push(url);
        return Response.json({ id: "email" });
      }
      return gone && url.includes("/email/")
        ? new Response("gone", { status: 404 })
        : new Response("ok");
    });
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    await reader(env);
    const id = await prepared(env, admin, "everyone");
    gone = true;
    const now = Date.now();
    const refused = await arm(env, admin.id, id, 2, now + LEAD_MS, now);
    expect(refused?.problems?.[0]).toMatchObject({ kind: "link", status: 404 });
    expect((await sendOf(env, id))?.state).toBe("prepared");
    gone = false;
    await armedNow(env, admin, id);
    gone = true;
    expect(await deliverDue(env)).toEqual({ send: id, paused: "links" });
    expect(mails).toEqual([]);
  });

  it("stops within ten emails of the newsletter being turned off, whatever the isolate last read", async () => {
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    await setFlag(env, "newsletter", true, admin.id);
    for (let i = 0; i < 30; i++) await reader(env);
    const { mails } = mailroom(async (_, n) => {
      // another isolate turns it off: this one's half-minute copy still says on
      if (n === 3) await run(env.DB, "UPDATE k_flags SET enabled = 0 WHERE name = 'newsletter'");
      return Response.json({ id: `email-${n}` });
    });
    const id = await prepared(env, admin, "everyone");
    await armedNow(env, admin, id);
    await deliverDue(env);
    expect(mails.length).toBe(10);
    expect((await outbox(env)).filter(row => row.state === "queued")).toHaveLength(21);
    expect((await sendOf(env, id))?.state).toBe("sending");
  });

  it("refuses to prepare when the admin's choices for the issue cannot be read", async () => {
    mailroom(() => Response.json({ id: "email" }));
    const env = production();
    const admin = await makeAdmin(env, `${unique("admin")}@inbox.grabient.dev`);
    // twice: a read that fails so is asked once more (@grabient/server/db/d1.ts)
    await expect(
      prepare(failing(env, "FROM k_newsletter_leads", 2), SITE, admin.id, 1, "admins")
    ).rejects.toThrow(/D1_ERROR/);
    expect(await all(env.DB, "SELECT id FROM k_newsletter_sends")).toEqual([]);
  });
});
