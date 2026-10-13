import { describe, expect, it } from "vitest";
import { inboxOf, sendEmail } from "./send.ts";

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
    const email = { to: "ada@example.test", subject: "S", html: "<p>H</p>", text: "T" };
    await sendEmail({ EMAIL, EMAIL_FROM: "noreply@grabient.com" }, email);
    expect(sent).toEqual([{ from: { name: "Grabient", email: "noreply@grabient.com" }, ...email }]);
    await expect(sendEmail({ EMAIL_FROM: "noreply@grabient.com" }, email)).rejects.toThrow(
      "Email delivery is not configured"
    );
  });
});
