import { addCatalog, messageKey, translate } from "@grabient/i18n";
import { first, run } from "@grabient/server/db/d1.ts";
import { setFlag } from "@grabient/server/flags/flags.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import ja from "../../../packages/i18n/messages/ja.json";
import { ISSUES } from "../src/server/newsletter/issues/index.ts";
import { issueFoot, readerOf } from "../src/server/newsletter/list.ts";
import { forgetFacts } from "../src/server/newsletter/page.ts";
import {
  choiceResponse,
  draftsResponse,
  issuesResponse,
  leadResponse,
  testResponse,
  unsubscribeResponse
} from "../src/server/newsletter/routes.ts";
import {
  type Account,
  bodyOf,
  count,
  get,
  makeAccount,
  makeAdmin,
  ORIGIN,
  type TestEnv,
  testEnv,
  unique
} from "./helpers.ts";

addCatalog(
  "ja",
  Object.fromEntries(
    Object.entries(ja as Record<string, string>).map(([english, words]) => [
      messageKey(english),
      words
    ])
  )
);

const RESEND_KEY = "re_test_key";
const newsletterEnv = (values: Partial<TestEnv> = {}) =>
  testEnv({ RESEND_API_KEY: RESEND_KEY, NEWSLETTER_FROM: "news@grabient.com", ...values });

/** A JSON request from the site's own page, unless `origin` says otherwise. */
function json(
  method: string,
  path: string,
  body: unknown,
  init: { cookie?: string; origin?: string | null } = {}
) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "CF-Connecting-IP": "203.0.113.9"
  });
  if (init.cookie) headers.set("Cookie", init.cookie);
  if (init.origin !== null) headers.set("Origin", init.origin ?? ORIGIN);
  return new Request(new URL(path, ORIGIN), { method, headers, body: JSON.stringify(body) });
}
const choice = async (env: TestEnv, account: Account) =>
  bodyOf<{ subscribed: boolean }>(
    await choiceResponse(get("/api/me/newsletter", { cookie: account.cookie }), env)
  );
const set = async (env: TestEnv, account: Account, subscribed: boolean) =>
  choiceResponse(
    json("PUT", "/api/me/newsletter", { subscribed }, { cookie: account.cookie }),
    env
  );
/** A mail app's own unsubscribe button: no origin and no cookie, RFC 8058's one pair as a form. */
const mailApp = (env: TestEnv, token: string) =>
  unsubscribeResponse(
    new Request(new URL(`/unsubscribe/${token}`, ORIGIN), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click"
    }),
    env,
    token
  );
const page = (env: TestEnv, token: string, subscribed: boolean, origin?: string | null) =>
  unsubscribeResponse(
    json("POST", `/unsubscribe/${token}`, { subscribed }, { origin }),
    env,
    token
  );

const rowOf = (env: TestEnv, userId: string) =>
  first<{ token: string; subscribed: number | null }>(
    env.DB,
    "SELECT token, subscribed FROM k_newsletter WHERE user_id = ?",
    userId
  );
const eventsOf = async (env: TestEnv, userId: string) =>
  (
    await env.DB.prepare(
      "SELECT subscribed, source FROM k_newsletter_events WHERE user_id = ? ORDER BY id"
    )
      .bind(userId)
      .all<{ subscribed: number; source: string }>()
  ).results.map(event => `${event.source}:${event.subscribed}`);
const tokenOf = async (env: TestEnv, account: Account) => {
  await set(env, account, false);
  const row = await rowOf(env, account.id);
  if (!row) throw new Error("No row");
  return row.token;
};
/** A RATE_LIMITER that cannot answer. */
const down = {
  idFromName: () => {
    throw new Error("The limiter is down");
  },
  get: () => {
    throw new Error("The limiter is down");
  }
} as unknown as DurableObjectNamespace;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("an account's choice", () => {
  it("is read and changed by that account alone, from the site alone", async () => {
    const env = newsletterEnv();
    const ada = await makeAccount(env);
    expect((await choiceResponse(get("/api/me/newsletter"), env)).status).toBe(401);
    expect(
      (
        await choiceResponse(
          json("POST", "/api/me/newsletter", { subscribed: false }, { cookie: ada.cookie }),
          env
        )
      ).status
    ).toBe(405);
    expect(
      (
        await choiceResponse(
          json(
            "PUT",
            "/api/me/newsletter",
            { subscribed: false },
            { cookie: ada.cookie, origin: "https://evil.test" }
          ),
          env
        )
      ).status
    ).toBe(403);
    for (const bad of [{}, { subscribed: "no" }, { subscribed: 0 }, { subscribed: null }]) {
      expect(
        (await choiceResponse(json("PUT", "/api/me/newsletter", bad, { cookie: ada.cookie }), env))
          .status
      ).toBe(400);
    }
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_newsletter WHERE user_id = ?", ada.id)
    ).toBe(0);
    expect(
      (
        await choiceResponse(get("/api/me/newsletter", { cookie: ada.cookie }), {
          ...env,
          BETTER_AUTH_SECRET: undefined
        })
      ).status
    ).toBe(503);
  });

  it("is subscribed until it says otherwise, and each change is kept with where it was made", async () => {
    const env = newsletterEnv();
    const ada = await makeAccount(env);
    const bob = await makeAccount(env);
    expect(await choice(env, ada)).toEqual({ subscribed: true });
    expect(await bodyOf(await set(env, ada, true))).toEqual({ subscribed: true });
    expect(await rowOf(env, ada.id)).toBeNull();
    expect(await eventsOf(env, ada.id)).toEqual([]);
    const ended = await set(env, ada, false);
    expect(ended.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await bodyOf(ended)).toEqual({ subscribed: false });
    const row = await rowOf(env, ada.id);
    expect(row?.subscribed).toBe(0);
    expect(row?.token).toMatch(/^[0-9a-f]{64}$/);
    await set(env, ada, false);
    expect(await eventsOf(env, ada.id)).toEqual(["settings:0"]);
    await set(env, ada, true);
    expect((await rowOf(env, ada.id))?.token).toBe(row?.token);
    expect(await eventsOf(env, ada.id)).toEqual(["settings:0", "settings:1"]);
    expect(await choice(env, bob)).toEqual({ subscribed: true });
  });

  it("logs one change when two presses land together", async () => {
    const env = newsletterEnv();
    const ada = await makeAccount(env);
    await Promise.all([set(env, ada, false), set(env, ada, false)]);
    expect(await eventsOf(env, ada.id)).toEqual(["settings:0"]);
  });

  it("changes while the rate limiter is down", async () => {
    const env = newsletterEnv({ RATE_LIMITER: down });
    const ada = await makeAccount(env);
    expect(await bodyOf(await set(env, ada, false))).toEqual({ subscribed: false });
    expect(await bodyOf(await set(env, ada, true))).toEqual({ subscribed: true });
  });
});

describe("the unsubscribe address", () => {
  it("refuses a token that is malformed or no account's, and writes nothing", async () => {
    const env = newsletterEnv();
    const token = await tokenOf(env, await makeAccount(env));
    for (const bad of [
      "",
      "abc",
      token.slice(1),
      `${token}0`,
      token.toUpperCase(),
      `${token.slice(0, 63)}g`,
      "0".repeat(64)
    ]) {
      const answer = await mailApp(env, bad);
      expect(answer.status).toBe(404);
      expect(await bodyOf(answer)).toEqual({ error: "This link isn't valid." });
    }
  });

  it("ends the newsletter with no sign-in, answering a mail app with a plain 200", async () => {
    const env = newsletterEnv();
    const ada = await makeAccount(env);
    const token = await tokenOf(env, ada);
    await set(env, ada, true);
    const ended = await mailApp(env, token);
    expect(ended.status).toBe(200);
    expect(await bodyOf(ended)).toEqual({ subscribed: false });
    expect(ended.headers.getSetCookie()).toEqual([]);
    expect(ended.headers.get("Location")).toBeNull();
    expect(ended.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await choice(env, ada)).toEqual({ subscribed: false });
    expect((await mailApp(env, token)).status).toBe(200);
    expect(await eventsOf(env, ada.id)).toEqual(["settings:0", "settings:1", "mail-app:0"]);
  });

  it("subscribes again only by the page's own press", async () => {
    const env = newsletterEnv();
    const ada = await makeAccount(env);
    const token = await tokenOf(env, ada);
    expect(await bodyOf(await page(env, token, true, null))).toEqual({ subscribed: false });
    expect(await bodyOf(await page(env, token, true, "https://evil.test"))).toEqual({
      subscribed: false
    });
    expect(await bodyOf(await page(env, token, true))).toEqual({ subscribed: true });
    expect(await bodyOf(await page(env, token, false))).toEqual({ subscribed: false });
    expect(await eventsOf(env, ada.id)).toEqual(["settings:0", "page:1", "page:0"]);
  });

  it("ends while the limiter is down, and counts only a link's presses back, ten an hour", async () => {
    const env = newsletterEnv();
    const ada = await makeAccount(env);
    const token = await tokenOf(env, ada);
    await page(env, token, true);
    expect(await bodyOf(await mailApp({ ...env, RATE_LIMITER: down }, token))).toEqual({
      subscribed: false
    });
    let refusedAt = 0;
    for (let press = 2; press <= 12 && !refusedAt; press++) {
      const again = await page(env, token, true);
      if (again.status === 429) refusedAt = press;
      else await mailApp(env, token);
    }
    expect(refusedAt).toBe(11);
    expect((await mailApp(env, token)).status).toBe(200);
  });

  it("goes with the account", async () => {
    const env = newsletterEnv();
    const ada = await makeAccount(env);
    const token = await tokenOf(env, ada);
    await run(env.DB, "DELETE FROM auth_user WHERE id = ?", ada.id);
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_newsletter WHERE user_id = ?", ada.id)
    ).toBe(0);
    expect(
      await count(env, "SELECT COUNT(*) AS n FROM k_newsletter_events WHERE user_id = ?", ada.id)
    ).toBe(0);
    expect((await mailApp(env, token)).status).toBe(404);
  });
});

describe("an issue's reader", () => {
  it("is the account's address, its language and its own way out, written once", async () => {
    const env = newsletterEnv();
    const eve = await makeAccount(env);
    await run(env.DB, "UPDATE auth_user SET locale = 'ja' WHERE id = ?", eve.id);
    const reader = await readerOf(env, ORIGIN, eve.id);
    const row = await rowOf(env, eve.id);
    expect(reader).toEqual({
      email: eve.email,
      locale: "ja",
      unsubscribe: `${ORIGIN}/ja/unsubscribe/${row?.token}`
    });
    expect(row?.subscribed).toBeNull();
    expect(await eventsOf(env, eve.id)).toEqual([]);
    const batch = vi.spyOn(env.DB, "batch");
    expect(await readerOf(env, ORIGIN, eve.id)).toEqual(reader);
    expect(batch).not.toHaveBeenCalled();
    const foot = issueFoot(reader ?? { locale: "en", unsubscribe: "" });
    expect(foot).toEqual({
      locale: "ja",
      reason: translate("ja", "You get this because you signed up for Grabient."),
      unsubscribe: { label: translate("ja", "Unsubscribe"), href: reader?.unsubscribe }
    });
    expect(foot.reason).not.toBe("You get this because you signed up for Grabient.");
  });

  it("is in English for a language the site lacks, and no one for an account that ended it", async () => {
    const env = newsletterEnv();
    const cy = await makeAccount(env);
    await run(env.DB, "UPDATE auth_user SET locale = 'xx' WHERE id = ?", cy.id);
    expect((await readerOf(env, ORIGIN, cy.id))?.locale).toBe("en");
    const dee = await makeAccount(env);
    await run(
      env.DB,
      "INSERT INTO k_newsletter (user_id, token, subscribed, updated_at) VALUES (?, ?, 0, 0)",
      dee.id,
      "d".repeat(64)
    );
    expect(await readerOf(env, ORIGIN, dee.id)).toBeNull();
    expect(await readerOf(env, ORIGIN, unique("nobody"))).toBeNull();
  });
});

describe("an admin's test issue", () => {
  const resend = () => {
    const sent: { url: string; init: RequestInit }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      sent.push({ url: String(input instanceof Request ? input.url : input), init: init ?? {} });
      return Response.json({ id: "resend-id" });
    });
    return sent;
  };
  const test = (env: TestEnv, cookie: string, origin?: string | null) =>
    testResponse(json("POST", "/api/me/newsletter/test", {}, { cookie, origin }), env);

  it("is refused to anyone but a subscribed admin, from the site, with a sender, under the limits", async () => {
    const sent = resend();
    const env = newsletterEnv();
    const user = await makeAccount(env);
    const admin = await makeAdmin(env);
    expect((await testResponse(json("POST", "/api/me/newsletter/test", {}), env)).status).toBe(401);
    expect((await test(env, user.cookie)).status).toBe(403);
    expect((await test(env, admin.cookie, "https://evil.test")).status).toBe(403);
    expect(
      (await testResponse(get("/api/me/newsletter/test", { cookie: admin.cookie }), env)).status
    ).toBe(405);
    expect((await test({ ...env, RESEND_API_KEY: undefined }, admin.cookie)).status).toBe(503);
    expect((await test({ ...env, RATE_LIMITER: down }, admin.cookie)).status).toBe(503);
    await setFlag(env, "newsletter", false, admin.id);
    try {
      const off = await test(env, admin.cookie);
      expect([off.status, await bodyOf(off)]).toEqual([
        503,
        { error: "The newsletter is turned off in Site features." }
      ]);
      const token = await tokenOf(env, user);
      expect((await mailApp(env, token)).status).toBe(200);
    } finally {
      await setFlag(env, "newsletter", true, admin.id);
    }
    await set(env, admin, false);
    expect((await test(env, admin.cookie)).status).toBe(409);
    expect(sent).toEqual([]);
  });

  it("sends the issue about to go out to the admin alone, with their own foot and a mail app's unsubscribe button", async () => {
    const sent = resend();
    const env = newsletterEnv();
    const admin = await makeAdmin(env);
    await run(env.DB, "UPDATE auth_user SET locale = 'ja' WHERE id = ?", admin.id);
    const done = await test(env, admin.cookie);
    expect([done.status, await bodyOf(done)]).toEqual([200, { sent: true }]);
    expect(sent).toHaveLength(1);
    const [{ url, init }] = sent;
    const body = JSON.parse(String(init.body));
    const headers = new Headers(init.headers);
    expect([url, init.method, headers.get("Authorization")]).toEqual([
      "https://api.resend.com/emails",
      "POST",
      `Bearer ${RESEND_KEY}`
    ]);
    const token = (await rowOf(env, admin.id))?.token;
    const unsubscribe = `${ORIGIN}/ja/unsubscribe/${token}`;
    expect(body).toMatchObject({
      from: "Grabient <news@grabient.com>",
      to: [admin.email],
      reply_to: "hello@grabient.com",
      headers: {
        "List-Unsubscribe": `<${unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
      }
    });
    const newest = ISSUES.reduce((a, b) => (b.number > a.number ? b : a)).write(ORIGIN);
    expect(body.subject).toBe(`[Test] ${newest.subject}`);
    for (const part of ["head", "chips", "issue", "palettes", "collection", "button", "foot"]) {
      expect(body.html).toContain(`data-part="${part}"`);
    }
    expect(body.html).toMatch(
      /data-part="head" src="[^"]*\/api\/og\?seed=k[\w-]+[^"]*head=1200x540"/
    );
    expect(body.html).toContain('lang="ja"');
    expect(body.text).toContain(unsubscribe);
    expect(body.text).toContain(
      translate("ja", "You get this because you signed up for Grabient.")
    );
    expect(JSON.stringify(body)).not.toContain(RESEND_KEY);
    expect(await bodyOf(await mailApp(env, token ?? ""))).toEqual({ subscribed: false });
  });

  it("tells the admin where to look when Resend refuses, and logs Resend's words", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { statusCode: 403, name: "validation_error", message: "The domain is not verified." },
        { status: 403 }
      )
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const env = newsletterEnv();
    const admin = await makeAdmin(env);
    const refused = await test(env, admin.cookie);
    expect([refused.status, await bodyOf(refused)]).toEqual([
      502,
      { error: "Couldn't send the test. See the Worker's log." }
    ]);
    expect(errors.mock.calls.flat().join(" ")).toContain(
      "Resend answered 403 validation_error: The domain is not verified."
    );
  });
});

describe("the issues' answers", () => {
  it("give everyone the published issues, two at a time, kept at the edge", async () => {
    const env = newsletterEnv();
    const answer = await issuesResponse(get("/api/newsletter"), env);
    expect(answer.headers.get("CDN-Cache-Control")).toBe("max-age=300");
    const body = await bodyOf<{ issues: { number: number; title: string }[]; next: number | null }>(
      answer
    );
    expect(body.issues.map(issue => issue.number)).toEqual(
      ISSUES.filter(issue => issue.published)
        .map(issue => issue.number)
        .sort((a, b) => b - a)
        .slice(0, 2)
    );
    expect(await bodyOf(await issuesResponse(get("/api/newsletter?before=1"), env))).toEqual({
      issues: [],
      next: null
    });
    expect(await bodyOf(await issuesResponse(get("/api/newsletter?before=x"), env))).toEqual(body);
  });

  it("give an admin alone the drafts, never kept", async () => {
    const env = newsletterEnv();
    const user = await makeAccount(env);
    const admin = await makeAdmin(env);
    expect((await draftsResponse(get("/api/me/newsletter/drafts"), env)).status).toBe(401);
    expect(
      (await draftsResponse(get("/api/me/newsletter/drafts", { cookie: user.cookie }), env)).status
    ).toBe(403);
    expect(
      (
        await draftsResponse(
          json("POST", "/api/me/newsletter/drafts", {}, { cookie: admin.cookie }),
          env
        )
      ).status
    ).toBe(405);
    const drafts = await draftsResponse(
      get("/api/me/newsletter/drafts", { cookie: admin.cookie }),
      env
    );
    expect(drafts.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await bodyOf<{ issues: { number: number }[] }>(drafts);
    expect(body.issues.map(issue => issue.number)).toEqual(
      ISSUES.filter(issue => !issue.published)
        .map(issue => issue.number)
        .sort((a, b) => b - a)
    );
    await run(env.DB, "UPDATE auth_user SET role = 'user' WHERE id = ?", admin.id);
    expect(
      (await draftsResponse(get("/api/me/newsletter/drafts", { cookie: admin.cookie }), env)).status
    ).toBe(403);
  });
});

describe("an issue's lead", () => {
  const october = ISSUES.find(issue => issue.number === 1);
  const picks = october?.write(ORIGIN).picks?.map(chosen => chosen.seed) ?? [];
  const extra = october?.leads?.[0]?.seed ?? "";
  const read = (env: TestEnv, query: string, cookie?: string) =>
    leadResponse(get(`/api/me/newsletter/lead?${query}`, cookie ? { cookie } : {}), env);
  const choose = (env: TestEnv, body: unknown, cookie: string, origin?: string | null) =>
    leadResponse(json("POST", "/api/me/newsletter/lead", body, { cookie, origin }), env);
  /* the lead the issue's head links to, on a page of it */
  const ledWith = (html: string) =>
    /data-part="lead"[^>]*>\s*<a [^>]*href="https:\/\/[^/]+\/(k[\w-]+)/.exec(html)?.[1];
  afterEach(async () => {
    await run(newsletterEnv().DB, "DELETE FROM k_newsletter_leads");
    forgetFacts();
  });

  it("is an admin's alone, from the site, among the palettes the issue offers", async () => {
    const env = newsletterEnv();
    const user = await makeAccount(env);
    const admin = await makeAdmin(env);
    expect((await read(env, "issue=1")).status).toBe(401);
    expect((await read(env, "issue=1", user.cookie)).status).toBe(403);
    expect((await choose(env, { issue: 1, seed: extra }, user.cookie)).status).toBe(403);
    expect(
      (await choose(env, { issue: 1, seed: extra }, admin.cookie, "https://evil.test")).status
    ).toBe(403);
    expect(
      (
        await leadResponse(
          json("PUT", "/api/me/newsletter/lead", {}, { cookie: admin.cookie }),
          env
        )
      ).status
    ).toBe(405);
    expect((await read(env, "issue=x", admin.cookie)).status).toBe(400);
    expect((await read(env, "issue=99", admin.cookie)).status).toBe(404);
    expect((await read(env, "issue=1&seed=kNotOffered000000", admin.cookie)).status).toBe(400);
    expect((await choose(env, { issue: 1, seed: "kNotOffered000000" }, admin.cookie)).status).toBe(
      400
    );
    expect(await first(env.DB, "SELECT seed FROM k_newsletter_leads")).toBeNull();
  });

  it("draws the issue under each palette it offers, named as its page is, and the one chosen leads it", async () => {
    const env = newsletterEnv();
    const admin = await makeAdmin(env);
    await run(
      env.DB,
      `INSERT INTO k_palette_texts (seed, title, embed, created_at, updated_at) VALUES (?, ?, '', 0, 0)
       ON CONFLICT (seed) DO UPDATE SET title = excluded.title`,
      picks[2],
      "Ember Sunset Bloom"
    );
    forgetFacts();
    try {
      const shown = await read(env, "issue=1", admin.cookie);
      expect(shown.headers.get("Cache-Control")).toBe("private, no-store");
      const sheet = await bodyOf<{
        options: { seed: string; name: string }[];
        chosen: string | null;
        shown: string;
        html: string;
      }>(shown);
      expect(sheet.options.map(option => option.seed)).toEqual([
        ...picks,
        ...(october?.leads ?? []).map(option => option.seed)
      ]);
      expect(sheet.options[2].name).toBe("Ember Sunset Bloom");
      expect(sheet.options.every(option => option.name.length > 0)).toBe(true);
      expect([sheet.chosen, sheet.shown, ledWith(sheet.html)]).toEqual([null, picks[0], picks[0]]);
      const other = await bodyOf<{ shown: string; html: string }>(
        await read(env, `issue=1&seed=${extra}`, admin.cookie)
      );
      expect([other.shown, ledWith(other.html)]).toEqual([extra, extra]);

      const chosen = await choose(env, { issue: 1, seed: extra }, admin.cookie);
      expect(await bodyOf(chosen)).toMatchObject({ chosen: extra, shown: extra });
      expect(await first(env.DB, "SELECT issue, seed, chosen_by FROM k_newsletter_leads")).toEqual({
        issue: 1,
        seed: extra,
        chosen_by: admin.id
      });
      const page = await bodyOf<{ issues: { number: number; html: string }[] }>(
        await issuesResponse(get("/api/newsletter"), env)
      );
      expect(ledWith(page.issues.find(issue => issue.number === 1)?.html ?? "")).toBe(extra);
      // a pick chosen trades places with the first
      await choose(env, { issue: 1, seed: picks[2] }, admin.cookie);
      const traded = await bodyOf<{ issues: { number: number; html: string }[] }>(
        await issuesResponse(get("/api/newsletter"), env)
      );
      const html = traded.issues.find(issue => issue.number === 1)?.html ?? "";
      expect(ledWith(html)).toBe(picks[2]);
      expect(html).toContain(`href="${ORIGIN}/${picks[0]}`);
    } finally {
      await run(env.DB, "DELETE FROM k_palette_texts WHERE seed = ? AND embed = ''", picks[2]);
    }
  });
});
