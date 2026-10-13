import { addCatalog, messageKey, translate } from "@grabient/i18n";
import { run } from "@grabient/server/db/d1.ts";
import { setFlag } from "@grabient/server/flags/flags.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import ja from "../../../packages/i18n/messages/ja.json";
import { alertOwner, documentAlert, signInDigest } from "../src/server/alerts/alerts.ts";
import { contactResponse } from "../src/server/contact/contact.ts";
import { emailLocale, sendAccountEmail } from "../src/server/email/letters/account.ts";
import {
  address,
  bodyOf,
  ORIGIN,
  post,
  type TestEnv,
  testEnv,
  unique,
  watchLimits
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the contact form", () => {
  const message = {
    email: " reader@example.test ",
    message: "  The export button does nothing.  "
  };

  it("sends a message to the site's address as plain text, with the sender to reply to", async () => {
    const env = testEnv();
    const answer = await contactResponse(post("/api/contact", message), env);
    expect([answer.status, await bodyOf(answer)]).toEqual([200, { success: true }]);
    expect(env.EMAIL.last).toMatchObject({
      from: { name: "Grabient", email: env.EMAIL_FROM },
      to: "hello@grabient.com",
      replyTo: "reader@example.test",
      subject: "Grabient contact",
      text: "The export button does nothing."
    });
    expect(env.EMAIL.last.html).toBeUndefined();
    await contactResponse(post("/api/contact", { message: "No reply needed here." }), env);
    expect(env.EMAIL.last.replyTo).toBeUndefined();
  });

  it("refuses another site, a bad message, and a deploy that cannot count or send", async () => {
    const env = testEnv();
    const refused = async (request: Request, environment: TestEnv = env) => {
      const answer = await contactResponse(request, environment);
      return [answer.status, (await bodyOf<{ error: string }>(answer)).error];
    };
    expect(await refused(post("/api/contact", message, { origin: "https://evil.test" }))).toEqual([
      403,
      "Invalid request."
    ]);
    expect(await refused(new Request(`${ORIGIN}/api/contact`))).toEqual([
      405,
      "Method not allowed"
    ]);
    const invalid = "Write 5 to 5,000 characters, and a valid email for a reply.";
    for (const bad of [
      { message: "  hi  " },
      { message: "x".repeat(5001) },
      { message: "Long enough words.", email: "not an address" },
      { message: "Long enough words.", email: `${"a".repeat(250)}@x.io` },
      {}
    ]) {
      expect(await refused(post("/api/contact", bad))).toEqual([400, invalid]);
    }
    expect(
      await refused(post("/api/contact", message), { ...env, RATE_LIMITER: undefined })
    ).toEqual([503, "Contact is temporarily unavailable."]);
    const bare = new Request(`${ORIGIN}/api/contact`, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    expect(await refused(bare)).toEqual([503, "Contact is temporarily unavailable."]);
    expect(env.EMAIL.sent).toEqual([]);
  });

  it("answers a filled hidden field as sent, sending nothing and spending none of the site's day", async () => {
    const { env, asked } = watchLimits(testEnv());
    const answer = await contactResponse(
      post("/api/contact", { ...message, website: "https://spam.test" }),
      env
    );
    expect([answer.status, await bodyOf(answer)]).toEqual([200, { success: true }]);
    expect(env.EMAIL.sent).toEqual([]);
    expect(asked).toEqual(["contactForm"]);
  });

  it("is unavailable while an admin has email off, and the owner's alerts still go", async () => {
    const env = testEnv();
    await setFlag(env, "email", false, unique("admin"));
    try {
      const answer = await contactResponse(post("/api/contact", message), env);
      expect([answer.status, await bodyOf(answer)]).toEqual([
        503,
        { error: "Contact is temporarily unavailable." }
      ]);
      expect(await alertOwner(env, unique("kind"), "Grabient: a test", ["A line."])).toBe(true);
      expect(env.EMAIL.sent.map(sent => sent.subject)).toEqual(["Grabient: a test"]);
    } finally {
      await setFlag(env, "email", true, unique("admin"));
    }
    expect((await contactResponse(post("/api/contact", message), env)).status).toBe(200);
  });

  it("allows an address five messages in ten minutes", async () => {
    const env = testEnv();
    const ip = address();
    const statuses = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await contactResponse(post("/api/contact", message, { ip }), env)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("says when Email Service refuses, and logs its code", async () => {
    const env = testEnv();
    vi.spyOn(env.EMAIL, "send").mockRejectedValue(
      Object.assign(new Error("refused"), { code: "E_DELIVERY_FAILED" })
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const answer = await contactResponse(post("/api/contact", message), env);
    expect([answer.status, await bodyOf(answer)]).toEqual([
      502,
      { error: "Couldn't send the message. Try again." }
    ]);
    expect(errors).toHaveBeenCalledWith("contact: the message was not sent", "E_DELIVERY_FAILED");
  });
});

describe("the owner's alerts", () => {
  it("go to the site's address at most once a day for each kind", async () => {
    const env = testEnv();
    const key = unique("kind");
    const day = Date.UTC(2026, 9, 13, 8);
    expect(await alertOwner(env, key, "Grabient: a test", ["One.", "Two."], day)).toBe(true);
    expect(await alertOwner(env, key, "Grabient: a test", ["One."], day + 3_600_000)).toBe(false);
    expect(env.EMAIL.sent).toHaveLength(1);
    expect(env.EMAIL.last).toMatchObject({
      to: "hello@grabient.com",
      subject: "Grabient: a test",
      text: "One.\n\nTwo."
    });
    expect(await alertOwner(env, key, "Grabient: a test", ["Next day."], day + 86_400_000)).toBe(
      true
    );
    expect(await alertOwner({ ...env, OAUTH_KV: undefined }, unique("kind"), "S", ["T"])).toBe(
      false
    );
  });

  it("never stop the job when one cannot be sent, and try again next time", async () => {
    const env = testEnv();
    const key = unique("kind");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi
      .spyOn(env.EMAIL, "send")
      .mockRejectedValueOnce(new Error("Email Service is down"));
    expect(await alertOwner(env, key, "S", ["T"])).toBe(false);
    expect(await alertOwner(env, key, "S", ["T"])).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("name a client document that changed, or one unreachable for a week", async () => {
    const env = testEnv();
    const clientId = `https://${unique("app")}.test/client.json`;
    expect(
      await documentAlert(env, { clientId, fields: ["redirect_uris"], notify: "changed" })
    ).toBe(true);
    expect(env.EMAIL.last.subject).toBe("Grabient: a saved client document changed");
    expect(env.EMAIL.last.text).toContain("Fields that differ: redirect_uris.");
    expect(
      await documentAlert(env, { clientId, fields: [], why: "HTTP 503", notify: "unreachable" })
    ).toBe(true);
    expect(env.EMAIL.last.subject).toBe(
      "Grabient: a client document has been unreachable for a week"
    );
    expect(env.EMAIL.last.text).toContain("(HTTP 503 the last time)");
  });

  it("digest the last six hours of apps signing in when a refresh races or KV refuses", async () => {
    const queries: string[] = [];
    const answers = [
      {
        data: [
          { category: "grant", reason: "refresh_token_mismatch", n: 3.2 },
          { category: "grant", reason: "invalid_scope", n: 9 }
        ]
      },
      { data: [{ grant: "refresh_token", client: "cimd", n: 2 }] }
    ];
    const env = testEnv({
      DEPLOYMENT: "production",
      ANALYTICS: {
        query: async ({ query }) => {
          queries.push(query);
          return answers.shift();
        }
      }
    });
    const digest = await signInDigest(env);
    expect(digest).toEqual({ watched: 3, emailed: true });
    expect(queries[0]).toContain('FROM events.analyticsEngine."grabient_usage"');
    expect(env.EMAIL.last.subject).toBe("Grabient: apps signing in");
    expect(env.EMAIL.last.text).toContain("- grant/refresh_token_mismatch: 3");
    expect(env.EMAIL.last.text).toContain("- refresh_token cimd: 2");
    expect(await signInDigest({ ...env, ANALYTICS: undefined })).toMatchObject({
      emailed: false,
      watched: 0
    });
    expect((await signInDigest({ ...env, DEPLOYMENT: "preview" })).skipped).toBeTruthy();
  });
});

describe("account emails", () => {
  const url = `${ORIGIN}/api/auth/magic-link/verify?token=t`;
  const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  it("are written in the language of the page that asked, else the reader's own", () => {
    const headers = (values: Record<string, string>) => new Headers(values);
    expect(
      emailLocale(headers({ Referer: `${ORIGIN}/ja/login`, Cookie: "grabient-locale=de" }))
    ).toBe("ja");
    expect(emailLocale(headers({ Cookie: "grabient-locale=de", "Accept-Language": "fr" }))).toBe(
      "de"
    );
    expect(emailLocale(headers({ "Accept-Language": "fr-CA,fr;q=0.9" }))).toBe("fr");
    expect(emailLocale(null)).toBe("en");
  });

  it("carry their head as PNG bytes under the id the email names", async () => {
    const env = testEnv();
    const request = new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      headers: { Referer: `${ORIGIN}/ja/login` }
    });
    await sendAccountEmail(
      env,
      "reader@example.test",
      { kind: "sign-in-link", url },
      { request, paint: async () => PNG }
    );
    const sent = env.EMAIL.last;
    expect(sent.subject).toBe(translate("ja", "Sign in to Grabient"));
    expect(sent.attachments).toEqual([
      {
        disposition: "inline",
        contentId: "grabient-head",
        filename: "grabient.png",
        type: "image/png",
        content: PNG
      }
    ]);
    expect(sent.html).toContain('src="cid:grabient-head"');
    expect(sent.html).toMatch(
      /class="btn-label" href="https:\/\/grabient\.test\/api\/auth\/magic-link\/verify\?token=t"/
    );
  });

  it("go naming the head's address when it cannot be drawn or cannot travel", async () => {
    const env = testEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await sendAccountEmail(
      env,
      "reader@example.test",
      { kind: "sign-in-code", code: "482913" },
      {
        paint: async () => {
          throw new Error("no painter");
        }
      }
    );
    expect(env.EMAIL.last.attachments).toBeUndefined();
    expect(env.EMAIL.last.html).toMatch(/<strong>482913<\/strong>/);
    const send = env.EMAIL.send.bind(env.EMAIL);
    vi.spyOn(env.EMAIL, "send").mockImplementation(async message => {
      if ("attachments" in message && message.attachments) throw new Error("too large");
      return send(message);
    });
    await sendAccountEmail(
      env,
      "reader@example.test",
      { kind: "deletion", url: `${ORIGIN}/settings?token=d` },
      {
        paint: async () => PNG
      }
    );
    expect(env.EMAIL.last.subject).toBe("Confirm account deletion");
    expect(env.EMAIL.last.attachments).toBeUndefined();
    expect(env.EMAIL.last.html).not.toContain("cid:");
  });

  it("wear a Rising palette that makes a head, or the brand's", async () => {
    const env = testEnv();
    await sendAccountEmail(env, "reader@example.test", { kind: "sign-in-link", url });
    const brand = env.EMAIL.last.html;
    await run(
      env.DB,
      "INSERT OR REPLACE INTO k_palettes (seed, style, steps, angle, created_at, rising) VALUES (?, 'linearGradient', 32, 180, ?, 1000000)",
      "kWzVMw17K7kq5vM-LD1shs7Y",
      Date.now()
    );
    try {
      await sendAccountEmail(env, "reader@example.test", { kind: "sign-in-link", url });
      expect(env.EMAIL.last.html).toContain(
        "/api/og?seed=kWzVMw17K7kq5vM-LD1shs7Y&#38;style=linearGradient&#38;steps=32&#38;angle=180&#38;head=800x200"
      );
      expect(brand).toContain(`${ORIGIN}/email/head-sheet.png`);
    } finally {
      await run(env.DB, "DELETE FROM k_palettes WHERE seed = ?", "kWzVMw17K7kq5vM-LD1shs7Y");
    }
  });
});
