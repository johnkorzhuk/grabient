/// <reference types="vite/client" />
import { createRootRoute, createRoute, createRouter } from "@tanstack/solid-router";
import { expect, test } from "vitest";
import generated from "../src/routeTree.gen.ts?raw";
import { get } from "./helpers.ts";

/* A file beside a page (/{seed}.png beside /{seed}) is a route with a suffix, and the router must rank it above the
   page's own, which takes any one segment. Nothing in the router's contract says it does: a suffixed route wins only
   as an index route that is tried before its plain sibling. So the app's own routes, as the build generated them, are
   ranked here by the router the app runs, and each address must reach its file's handler. */

const files = new Map(
  [...generated.matchAll(/import \{ Route as (\w+) \} from '\.\/routes\/([^']+)'/g)].map(
    ([, name, file]) => [name, file]
  )
);
const routes = [...generated.matchAll(/(\w+)\.update\(\{\s+id: '([^']+)',\s+path: '([^']+)'/g)].map(
  ([, name, id, path]) => ({ file: files.get(name), id, path })
);

const root = createRootRoute();
const router = createRouter({
  routeTree: root.addChildren(
    routes.map(({ path }) => createRoute({ getParentRoute: () => root, path }))
  )
});

type Handler = (context: {
  request: Request;
  params: Record<string, string>;
}) => Response | Promise<Response>;
const modules = import.meta.glob<{
  Route: { options: { server?: { handlers?: Record<string, Handler | undefined> } } };
}>("../src/routes/**/*.ts");

/** The route the router gives an address to, by its path, and that route's own answer to a GET. */
async function reach(address: string) {
  const request = get(address);
  const [, params, found] = router.getMatchedRoutes(new URL(request.url).pathname);
  const route = routes.find(known => known.path === found?.fullPath);
  const load = route && modules[`../src/routes/${route.file}.ts`];
  const handler = load && (await load()).Route.options.server?.handlers?.GET;
  const answer = handler && (await handler({ request, params }));
  return { route: route?.id, type: answer?.headers.get("Content-Type"), status: answer?.status };
}

test("the generated routes are all here, each with its file", () => {
  expect(routes.length).toBeGreaterThan(100);
  expect(routes.length).toBe(generated.match(/\.update\(\{/g)?.length);
  expect(routes.filter(route => !route.file)).toEqual([]);
});

test.each([
  ["/kS7Q8Yy5S_SChv0.png", "/{$seed}.png/", "image/png"],
  ["/kS7Q8Yy5S_SChv0.svg", "/{$seed}.svg/", "image/svg+xml; charset=utf-8"],
  ["/kS7Q8Yy5S_SChv0.css", "/{$seed}.css/", "text/css; charset=utf-8"],
  ["/kS7Q8Yy5S_SChv0.json", "/{$name}.json/", "application/json"],
  ["/kS7Q8Yy5S_SChv0.tokens.json", "/{$name}.json/", "application/design-tokens+json"],
  ["/kS7Q8Yy5S_SChv0.md", "/{$name}.md/", "text/markdown; charset=utf-8"],
  ["/kS7Q8Yy5S_SChv0.ase", "/{$name}.ase/", "application/octet-stream"],
  ["/kS7Q8Yy5S_SChv0.gpl", "/{$name}.gpl/", "text/plain; charset=utf-8"],
  ["/kS7Q8Yy5S_SChv0.grd", "/{$name}.grd/", "application/octet-stream"],
  ["/sitemap-pages.xml", "/sitemap-{$name}.xml/", "application/xml; charset=utf-8"],
  ["/search/blue.json?limit=1", "/search/{$words}.json", "application/json"],
  ["/palettes/blue.json?limit=1", "/palettes/{$words}.json", "application/json"],
  ["/api/palettes/search?q=blue&limit=1", "/api/palettes_/search", "application/json"],
  ["/api/popular-searches?q=bl", "/api/popular-searches", "application/json"]
])("%s reaches %s", async (address, route, type) => {
  expect(await reach(address)).toEqual({ route, type, status: 200 });
});

test.each([
  ["/@ada/warm-sunsets.md", "/@{$handle}/{$slug}.md/"],
  ["/@ada/warm-sunsets.gpl", "/@{$handle}/{$slug}.gpl/"],
  ["/@ada/warm-sunsets.tokens.json", "/@{$handle}/{$slug}.json/"],
  ["/ocean-gradients.md", "/{$name}.md/"]
])("%s reaches %s, which knows no such collection", async (address, route) => {
  expect(await reach(address)).toEqual({ route, type: "application/json", status: 404 });
});

test("an address without a suffix is still its page's", () => {
  const page = (path: string) => router.getMatchedRoutes(path)[2]?.fullPath;
  expect(page("/kS7Q8Yy5S_SChv0")).toBe("/$id/");
  expect(page("/ocean-gradients")).toBe("/$id/");
  expect(page("/@ada/warm-sunsets")).toBe("/@{$handle}/$slug/");
  expect(page("/palettes")).toBe("/palettes/{-$order}/{-$frame}");
  expect(page("/palettes/rising/3m")).toBe("/palettes/{-$order}/{-$frame}");
  expect(page("/palettes/saved")).toBe("/palettes/saved");
});

test("the recorder's route takes PostHog's addresses, the one that ends in a slash too", () => {
  const taken = (path: string) => router.getMatchedRoutes(path)[2]?.fullPath;
  expect(taken("/e/s/")).toBe("/e/$");
  expect(taken("/e/static/recorder.js")).toBe("/e/$");
});
