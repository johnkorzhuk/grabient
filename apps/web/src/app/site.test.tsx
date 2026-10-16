import { describe, expect, test } from "vitest";
import { navLinks } from "./site.ts";

const href = (to: string) => to;

describe("the brand pages' navigation", () => {
  test("lists the newsletter once it is shown, and not before", () => {
    const shown = navLinks(null, null, href, true).map(link => link.href);
    expect(shown).toContain("/newsletter");
    expect(navLinks(null, null, href, false).map(link => link.href)).toEqual(
      shown.filter(at => at !== "/newsletter")
    );
  });
});
