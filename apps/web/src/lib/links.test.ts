import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { languagePath } from "./links.ts";

interface Row {
  input: string;
  route: string;
  menu: string;
  resolved?: string;
}
const { menu }: { menu: Row[] } = JSON.parse(
  readFileSync(new URL("fixtures/menu-path.json", import.meta.url), "utf8")
);
/* G4 named an address it had still to resolve or redirect a kind of its own; here the server has resolved or
   redirected every address before a page renders, so those rows are no page this menu is drawn on. */
const drawn = menu.filter(
  row => row.route !== "redirect" && !(row.route === "query" && !row.resolved)
);

test.each(drawn)("the language menu on $input", row => {
  expect(languagePath(row.input, row.route !== "notfound")).toBe(row.resolved ?? row.menu);
});

test("the language menu offers no landing's campaign tags, which say nothing of the page", () => {
  expect(languagePath("/palettes?q=sea&utm_source=news&gclid=x")).toBe("/palettes?q=sea");
  expect(languagePath("/kS7Q8Yy5S_SChv0?lock=hue&fbclid=x", true, true)).toBe(
    "/kS7Q8Yy5S_SChv0?lock=hue"
  );
});
