import { describe, expect, it } from "vitest";
import type { Env } from "../env.ts";
import { inboxOf, mailAccount, sendEmail, setAccountMailer } from "./send.ts";

describe("inboxOf", () => {
  it("counts an inbox once however its address is written", () => {
    const cases = [
      ["Ada@Example.test", "ada@example.test"],
      [" ada@example.test ", "ada@example.test"],
      ["ada+news@example.test", "ada@example.test"],
      ["a.d.a@gmail.com", "ada@gmail.com"],
      ["A.D.A+x@GoogleMail.com", "ada@gmail.com"],
      ["ada@gmail.co", "ada@gmail.co"],
      ["+tag@example.test", "+tag@example.test"],
      ["noat", "noat"],
      ["@example.test", "@example.test"],
      ["a@b@c.test", "a@b@c.test"],
      ["ADA.LOVELACE+promo@outlook.com", "ada.lovelace@outlook.com"]
    ];
    for (const [address, inbox] of cases)
      expect([address, inboxOf(address!)]).toEqual([address, inbox]);
  });
});

describe("sendEmail", () => {
  it("sends from Grabient's address, and refuses where the deploy has no sender", async () => {
    const sent: unknown[] = [];
    const EMAIL = {
      send: async (message: unknown) => {
        sent.push(message);
        return { messageId: "1" };
      }
    } as SendEmail;
    const email = {
      to: "ada@example.test",
      subject: "S",
      html: "<p>H</p>",
      text: "T",
      attachments: [
        {
          disposition: "inline" as const,
          contentId: "head",
          filename: "head.png",
          type: "image/png",
          content: new Uint8Array([137, 80, 78, 71])
        }
      ]
    };
    await sendEmail({ EMAIL, EMAIL_FROM: "noreply@grabient.com" }, email);
    expect(sent).toEqual([{ from: { name: "Grabient", email: "noreply@grabient.com" }, ...email }]);
    await expect(sendEmail({ EMAIL_FROM: "noreply@grabient.com" }, email)).rejects.toThrow(
      "Email delivery is not configured"
    );
  });
});

describe("an account's email", () => {
  it("is the app's to write and send: nothing goes until the app says how", async () => {
    const env = { EMAIL_FROM: "noreply@grabient.com" } as Env;
    const code = { kind: "sign-in-code", code: "123456" } as const;
    await expect(mailAccount(env, "ada@example.test", code)).rejects.toThrow(
      "No account mailer is set"
    );
    const asked = new Request("https://grabient.test/api/auth/sign-in/magic-link");
    const sent: unknown[][] = [];
    setAccountMailer(async (...email) => void sent.push(email));
    await mailAccount(env, "ada@example.test", code, asked);
    expect(sent).toEqual([[env, "ada@example.test", code, asked]]);
  });
});
