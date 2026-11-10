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
  test("are the legal pages, MCP, About and the code, in that order, on every page", () => {
    const links = footerLinks(null, 2014, href);
    expect(links.map(link => [link.href, link.label])).toEqual([
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
      ["/mcp-server", "MCP"],
      ["/about", "About"],
      ["https://github.com/johnkorzhuk/grabient", "GitHub"]
    ]);
    // the code alone leaves the site, with its stars
    expect(links.map(link => [!!link.external, link.stars ?? null])).toEqual([
      [false, null],
      [false, null],
      [false, null],
      [false, null],
      [true, 2014]
    ]);
  });

  test("mark the page on screen, About's as the legal pages' and MCP's", () => {
    for (const [page, at] of [
      ["privacy", "/privacy"],
      ["terms", "/terms"],
      ["mcp", "/mcp-server"],
      ["about", "/about"]
    ] as const) {
      const current = footerLinks(page, null, href).filter(link => link.current);
      expect(current.map(link => link.href)).toEqual([at]);
    }
    expect(footerLinks(null, null, href).some(link => link.current)).toBe(false);
  });

  test("lead a crawler to About in every language, whose copies are indexed, and to the legal pages in English alone", () => {
    const english = footerLinks(null, null, href);
    expect(english.map(link => [link.href, link.rel])).toEqual([
      ["/privacy", undefined],
      ["/terms", undefined],
      ["/mcp-server", undefined],
      ["/about", undefined],
      ["https://github.com/johnkorzhuk/grabient", undefined]
    ]);
    const japanese = footerLinks(null, null, to => `/ja${to}`);
    expect(japanese.map(link => [link.href, link.rel])).toEqual([
      ["/ja/privacy", "nofollow"],
      ["/ja/terms", "nofollow"],
      ["/ja/mcp-server", undefined],
      ["/ja/about", undefined],
      ["https://github.com/johnkorzhuk/grabient", undefined]
    ]);
  });
});
