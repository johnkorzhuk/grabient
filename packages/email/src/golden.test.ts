import { describe, expect, test } from "vitest";
import {
  sampleAccount,
  sampleBlurbs,
  sampleIssue,
  sampleMcpIssue,
  samplePartnerIssue
} from "../test/sample.ts";
import { PARTS } from "../test/spec.ts";
import { fixture, fixtureJson, meaning, ORIGIN } from "../test/support.ts";
import { insetStyles } from "./document.ts";
import { headFault, pickHead, seedStops } from "./head.ts";
import { confirmDeletion, signInCode, signInLink } from "./letters.ts";
import { headAddress, pictureAddress, VIEW } from "./palette.ts";
import { blurb } from "./partner.ts";
import { BRAND, HEAD_CID, HEAD_FILES, SCHEMES, SIZE } from "./theme.ts";

/* The emails grabient4 sent, captured: each must say the same in HTML (the gradients' colors, not how many decimals
   their stops are written with) and byte for byte in plain text. */

const letters: Record<string, () => { html: string; text: string }> = {
  "account/sign-in-link": () => sampleAccount.link({ origin: ORIGIN }),
  "account/sign-in-code": () => sampleAccount.code({ origin: ORIGIN }),
  "account/account-deletion": () => sampleAccount.deletion({ origin: ORIGIN }),
  "account/sign-in-link-brand": () => sampleAccount.link({ origin: ORIGIN, brand: true }),
  "account/sign-in-link-ar": () => sampleAccount.link({ origin: ORIGIN, locale: "ar" }),
  "account/account-deletion-ja": () => sampleAccount.deletion({ origin: ORIGIN, locale: "ja" }),
  "account/account-deletion-vi": () => sampleAccount.deletion({ origin: ORIGIN, locale: "vi" }),
  "account/sign-in-link-dark": () => sampleAccount.link({ origin: ORIGIN, scheme: "dark" }),
  "account/sign-in-link-carried": () =>
    signInLink({
      origin: ORIGIN,
      url: `${ORIGIN}/api/auth/magic-link/verify?token=sample`,
      palette: { seed: "kWzVMw17K7kq5vM-LD1shs7Y", style: "linearGradient", steps: 32, angle: 180 },
      carried: true
    }),
  "account/sign-in-code-carried-brand": () =>
    signInCode({ origin: ORIGIN, code: "482913", carried: true }),
  "newsletter/sample-issue": () => sampleIssue({ origin: ORIGIN }),
  "newsletter/sample-mcp-issue": () => sampleMcpIssue({ origin: ORIGIN }),
  "newsletter/sample-mcp-issue-listed": () =>
    sampleMcpIssue({ origin: ORIGIN, listed: ["Claude", "ChatGPT"] }),
  "newsletter/sample-partner-issue": () => samplePartnerIssue({ origin: ORIGIN }),
  "blurb/line": () => sampleBlurbs(ORIGIN).line,
  "blurb/short": () => sampleBlurbs(ORIGIN).short,
  "blurb/card": () => sampleBlurbs(ORIGIN).card,
  "blurb/line-ja": () =>
    blurb({ origin: ORIGIN, size: "line", locale: "ja", href: `${ORIGIN}/?ref=them` })
};

describe("each email says what grabient4's said", () => {
  test.each(Object.keys(letters))("%s", name => {
    const letter = letters[name]();
    expect(letter.text).toBe(fixture(`${name}.txt`));
    expect(meaning(letter.html)).toBe(meaning(fixture(`${name}.html`)));
  });
  test("the deletion email's link is the one given", () => {
    const url = `${ORIGIN}/settings?token=t`;
    expect(confirmDeletion({ origin: ORIGIN, url }).text).toContain(`Confirm deletion: ${url}`);
  });
});

test("the constants a sender reads", () => {
  const constants = fixtureJson<Record<string, unknown>>("constants.json");
  expect({ SIZE, BRAND, HEAD_FILES, HEAD_CID, VIEW, SCHEMES }).toEqual({
    SIZE: constants.SIZE,
    BRAND: constants.BRAND,
    HEAD_FILES: constants.HEAD_FILES,
    HEAD_CID: constants.HEAD_CID,
    VIEW: constants.VIEW,
    SCHEMES: constants.SCHEMES
  });
});

test("the parts list, as grabient4 wrote it", () => {
  expect(PARTS).toEqual(fixtureJson("parts.json"));
});

test("the inset styles a page gives its colors", () => {
  const symbolic = insetStyles({
    paper: "var(--paper)",
    edge: "var(--edge)",
    shadow: "var(--shadow)",
    ink: "var(--ink)",
    ink2: "var(--ink2)",
    ink3: "var(--ink3)",
    line: "var(--line)",
    fill: "var(--fill)",
    onInk: "var(--on-ink)"
  });
  expect(symbolic).toBe(fixture("inset-styles-symbolic.css"));
});

describe("palettes", () => {
  interface Seen {
    of: Parameters<typeof headFault>[0];
    headFault: Record<"sheet" | "letter" | "lead", string | null>;
    picture: Record<"lead" | "card" | "tile", string>;
    head: Record<"sheet" | "letter" | "lead", string>;
  }
  const views = fixtureJson<Seen[]>("palettes/views.json");
  test.each(views.map((seen, i) => [i, seen] as const))(
    "view %i: heads and addresses",
    (_, seen) => {
      for (const size of ["sheet", "letter", "lead"] as const) {
        expect(headFault(seen.of, size)).toBe(seen.headFault[size]);
      }
      if (seen.headFault.sheet === "unread") return;
      for (const size of ["lead", "card", "tile"] as const) {
        expect(pictureAddress(ORIGIN, seen.of, size)).toBe(seen.picture[size]);
      }
      for (const size of ["sheet", "letter", "lead"] as const) {
        expect(headAddress(ORIGIN, seen.of, size)).toBe(seen.head[size]);
      }
    }
  );
  test("pickHead draws among the palettes that make a head", () => {
    const picks = fixtureJson<{
      candidates: Parameters<typeof pickHead>[0];
      first: unknown;
      last: unknown;
    }>("palettes/pick-head.json");
    expect(pickHead(picks.candidates, () => 0)).toEqual(picks.first);
    expect(pickHead(picks.candidates, () => 0.999)).toEqual(picks.last);
    expect(pickHead([])).toBeUndefined();
  });
  test("a palette's wash reads it 33 times", () => {
    const { seed, stops } = fixtureJson<{ seed: string; stops: string[] }>(
      "palettes/seed-stops.json"
    );
    expect(seedStops(seed)).toEqual(stops);
  });
});
