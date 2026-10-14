import { expect, test, vi } from "vitest";

/* What analytics hears of a tag pressed and of the search it leads to. */

const heard = vi.hoisted(() => [] as [string, Record<string, unknown>][]);
// the browser's paths: Node resolves Solid's server build, where isServer is true
vi.mock("@solidjs/web", async original => ({
  ...(await original<typeof import("@solidjs/web")>()),
  isServer: false
}));
vi.mock("../analytics/analytics.ts", () => ({
  trackEvent: (name: string, properties: Record<string, unknown>) => heard.push([name, properties])
}));
vi.stubGlobal("location", { origin: "https://grabient.test" });
const { searchAnswered, tagPressed } = await import("./count.ts");

test("a tag that says a translation is named by its phrase's English, as the counts name it", () => {
  const press = { label: "hora azul", href: "/es/palettes?q=hora+azul", english: "blue hour" };
  tagPressed(press, 2, "palettes");
  searchAnswered("hora azul", "palettes", { tier: "vocabulary", results: 96 });
  tagPressed({ label: "sunset", href: "/?q=sunset" }, 0, "home");
  searchAnswered("sunset", "home", { results: 60, collections: 3 });
  // words typed are told as they were typed
  searchAnswered("atardecer", "palettes", { tier: "vocabulary", results: 96 });
  const answer = { search_type: "tag", tier: "vocabulary", results: 96, surface: "palettes" };
  expect(heard).toEqual([
    ["select_tag", { tag: "blue hour", position: 2, surface: "palettes" }],
    ["view_search_results", { search_term: "blue hour", ...answer }],
    ["select_tag", { tag: "sunset", position: 0, surface: "home" }],
    [
      "view_search_results",
      { search_term: "sunset", search_type: "tag", results: 60, collections: 3, surface: "home" }
    ],
    ["view_search_results", { search_term: "atardecer", ...answer, search_type: "words" }]
  ]);
});
