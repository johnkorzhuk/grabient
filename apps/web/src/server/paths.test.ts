import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { ceilingPath } from "./paths.ts";

/* The site's ceilings count as a page any address outside the API that no route serves, which Start answers with its
   not-found page: read against the route tree the build generates, so a file route added later is never taken for one
   and answered with the app's frame past the ceiling. */

const routes = new URL("../routes/", import.meta.url);
const tree = readFileSync(new URL("../routeTree.gen.ts", import.meta.url), "utf8");

/** Each route's address and whether it draws a page, which only a .tsx route file does. */
function routeTree(): { path: string; page: boolean }[] {
  const files = new Map(
    [...tree.matchAll(/^import \{ Route as (\w+) \} from '\.\/routes\/(.+)'$/gm)].map(
      ([, name = "", file = ""]) => [name, file]
    )
  );
  return [...tree.matchAll(/=\s*(\w+)\.update\(\{\s*id: '[^']*',\s*path: '([^']*)'/g)].map(
    ([, name = "", path = ""]) => ({
      path,
      page: !existsSync(new URL(`${files.get(name)}.ts`, routes))
    })
  );
}

/** An address the route answers: each parameter a word, an optional one left out, a splat one segment. */
const sample = (path: string) =>
  path
    .replace(/\{-\$\w+\}/g, "")
    .replace(/\{\$\w+\}|\$\w+|\$/g, "x")
    .replace(/\/{2,}/g, "/")
    .replace(/(.)\/$/, "$1");
/** The addresses the route answers, a splat route's root among them, which it matches with its splat empty. */
const samples = (path: string) =>
  path.endsWith("/$") ? [sample(path), sample(path.slice(0, -2))] : [sample(path)];

test("the route tree is read whole", () => {
  const read = routeTree();
  expect(read.length).toBe(tree.match(/\.update\(\{/g)?.length);
  expect(read.filter(route => route.page).length).toBeGreaterThan(20);
  expect(read.filter(route => !route.page).length).toBeGreaterThan(60);
});

test("counts no address a route serves without a page as a page", () => {
  const counted = routeTree()
    .filter(route => !route.page)
    .flatMap(route => samples(route.path))
    .filter(path => ceilingPath(path, new URLSearchParams()) === "page");
  expect(counted).toEqual([]);
});

test("counts the lists' and the searches' data however its address is cased, as the router matches it", () => {
  const params = new URLSearchParams("q=x");
  const data = routeTree()
    .map(route => sample(route.path))
    .filter(path => ceilingPath(path, params) === "data");
  expect(data.length).toBeGreaterThan(10);
  for (const path of data) {
    // the segments after the first in capitals, and the whole address, whose first then names no API to the pages
    const shouted = path.replace(
      /^(\/[^/]+)(.*)$/,
      (_, first: string, rest: string) => first + rest.toUpperCase()
    );
    expect([shouted, ceilingPath(shouted, params)]).toEqual([shouted, "data"]);
    expect([path, ceilingPath(path.toUpperCase(), params)]).not.toEqual([path, null]);
  }
});

test("counts as a page an address no route serves, whatever it is named", () => {
  for (const path of [
    "/wp-login.php",
    "/.env",
    "/x.xml",
    "/a/b.c",
    "/og/x",
    "/fonts/x.woff2",
    "/i18n/x.json",
    "/e",
    "/mcp/x",
    "/favicon/x.png"
  ])
    expect([path, ceilingPath(path, new URLSearchParams())]).toEqual([path, "page"]);
  for (const path of [
    "/LLMS.TXT",
    "/x.PNG",
    "/@Ada/Warm.SVG",
    "/Sitemap.xml",
    "/OG/v/x.png",
    "/.well-known",
    "/oauth"
  ])
    expect([path, ceilingPath(path, new URLSearchParams())]).toEqual([path, null]);
});
