import { expect, it } from "vitest";
import redirects from "./fixtures/redirects.json" with { type: "json" };
import { loginHref, safeRedirect } from "./session.ts";

it("leads back only to a path on this site, as grabient4 did", () => {
  for (const [input, safe, login] of redirects) {
    const raw = input === "(undefined)" ? undefined : input;
    expect([input, safeRedirect(raw), loginHref(raw ?? "/")]).toEqual([input, safe, login]);
  }
});
