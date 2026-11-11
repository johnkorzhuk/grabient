import { describe, expect, test } from "vitest";
import { footerLinks, navLinks } from "./site.ts";

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

describe("the footer's links", () => {
  test("are the privacy policy, MCP, About and the code, in that order, on every page, and never the Terms", () => {
    const links = footerLinks(null, 2014, href);
    // the Terms are linked where they are agreed to, on the sign-in page
    expect(links.map(link => [link.href, link.label])).toEqual([
      ["/privacy", "Privacy"],
      ["/mcp-server", "MCP"],
      ["/about", "About"],
      ["https://github.com/johnkorzhuk/grabient", "GitHub"]
    ]);
    // the code alone leaves the site, with its stars
    expect(links.map(link => [!!link.external, link.stars ?? null])).toEqual([
      [false, null],
      [false, null],
      [false, null],
      [true, 2014]
    ]);
  });

  test("mark the page on screen, About's as the privacy policy's and MCP's", () => {
    for (const [page, at] of [
      ["privacy", "/privacy"],
      ["mcp", "/mcp-server"],
      ["about", "/about"]
    ] as const) {
      const current = footerLinks(page, null, href).filter(link => link.current);
      expect(current.map(link => link.href)).toEqual([at]);
    }
    expect(footerLinks(null, null, href).some(link => link.current)).toBe(false);
  });

  test("lead a crawler to About in every language, whose copies are indexed, and to the privacy policy in English alone", () => {
    const english = footerLinks(null, null, href);
    expect(english.map(link => [link.href, link.rel])).toEqual([
      ["/privacy", undefined],
      ["/mcp-server", undefined],
      ["/about", undefined],
      ["https://github.com/johnkorzhuk/grabient", undefined]
    ]);
    const japanese = footerLinks(null, null, to => `/ja${to}`);
    expect(japanese.map(link => [link.href, link.rel])).toEqual([
      ["/ja/privacy", "nofollow"],
      ["/ja/mcp-server", undefined],
      ["/ja/about", undefined],
      ["https://github.com/johnkorzhuk/grabient", undefined]
    ]);
  });
});
