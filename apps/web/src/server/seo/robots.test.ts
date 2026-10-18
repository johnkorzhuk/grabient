import { readFileSync } from "node:fs";
import type { Env } from "@grabient/server/env.ts";
import { expect, test } from "vitest";
import { robotsTxt } from "./robots.ts";
import { indexed, publicOrigin } from "./site.ts";

const golden = (name: string) =>
  readFileSync(new URL(`fixtures/robots.${name}.txt`, import.meta.url), "utf8");
const request = (url: string) => new Request(url);

/** Each deploy as cloudflare.config.ts sets it, and a host it answers on. */
const DEPLOYS: Record<string, [Pick<Env, "DEPLOYMENT" | "PUBLIC_ORIGIN">, string]> = {
  production: [
    { DEPLOYMENT: "production", PUBLIC_ORIGIN: "https://grabient.com" },
    "https://www.grabient.com/robots.txt"
  ],
  staging: [
    { DEPLOYMENT: "staging", PUBLIC_ORIGIN: "https://staging.grabient.com" },
    "https://staging.grabient.com/robots.txt"
  ],
  "staging's version preview": [
    { DEPLOYMENT: "staging", PUBLIC_ORIGIN: "https://staging.grabient.com" },
    "https://ab12cd-grabient-staging.jkorzhuk.workers.dev/robots.txt"
  ],
  preview: [
    { DEPLOYMENT: "preview" },
    "https://seo-grabient-staging.jkorzhuk.workers.dev/robots.txt"
  ],
  development: [{ DEPLOYMENT: "development" }, "http://localhost:5173/robots.txt"]
};

test.each(Object.entries(DEPLOYS))(
  "%s answers robots.txt and its pages as the fixtures say",
  (name, [env, url]) => {
    const origin = publicOrigin(env, request(url));
    const text = robotsTxt(indexed(env), origin);
    expect(text).toBe(golden(name === "production" ? "production" : "staging"));
    expect(indexed(env)).toBe(name === "production");
    expect(origin).toBe(env.PUBLIC_ORIGIN ?? new URL(url).origin);
  }
);

test("a deploy that only claims production's name, or only its origin, is not indexed", () => {
  expect(indexed({ DEPLOYMENT: "production" })).toBe(false);
  expect(indexed({ DEPLOYMENT: "production", PUBLIC_ORIGIN: "https://staging.grabient.com" })).toBe(
    false
  );
  expect(indexed({ DEPLOYMENT: "staging", PUBLIC_ORIGIN: "https://grabient.com" })).toBe(false);
  expect(indexed({ DEPLOYMENT: "production", PUBLIC_ORIGIN: "https://grabient.com/" })).toBe(true);
});

/** Whether a crawler may fetch `path`, as RFC 9309 reads robots.txt: the group naming the crawler, else `*`; of its
    rules, the longest that matches, an Allow winning a tie; `*` matching any run and a last `$` the end. */
function allowed(text: string, agent: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[] }[] = [];
  let open = false;
  for (const line of text.split("\n")) {
    const [, field = "", value = ""] = /^([A-Za-z-]+):\s*(.*)$/.exec(line.trim()) ?? [];
    if (field.toLowerCase() === "user-agent") {
      if (!open) groups.push({ agents: [], rules: [] });
      groups.at(-1)?.agents.push(value.toLowerCase());
      open = true;
    } else if (/^(?:allow|disallow)$/i.test(field)) {
      groups.at(-1)?.rules.push({ allow: field.toLowerCase() === "allow", pattern: value });
      open = false;
    }
  }
  const group =
    groups.find(g => g.agents.includes(agent.toLowerCase())) ??
    groups.find(g => g.agents.includes("*"));
  const matches = (pattern: string) => {
    const anchored = pattern.endsWith("$");
    const body = (anchored ? pattern.slice(0, -1) : pattern)
      .split("*")
      .map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
  };
  const hit = (group?.rules ?? [])
    .filter(rule => rule.pattern && matches(rule.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow))[0];
  return !hit || hit.allow;
}

test("production's rules keep crawlers from an account's pages, search crawlers from Random, and none from a collection named like them", () => {
  const text = robotsTxt(true, "https://grabient.com");
  const kept = [
    "/saved",
    "/saved?q=blue",
    "/settings",
    "/settings?tab=privacy",
    "/unsubscribe",
    "/unsubscribe/aaaa",
    "/ja/saved",
    "/pt-br/unsubscribe/aaaa",
    "/collections/saved",
    "/collections/saved?q=blue",
    "/ja/collections/saved",
    "/e",
    "/e/static/recorder.js",
    "/api/me/palettes",
    "/oauth/authorize"
  ];
  const open = [
    "/saved-by-the-bell",
    "/settings-in-stone",
    "/unsubscribed-blues",
    "/random-walk",
    "/ja/random-walk",
    "/es",
    "/es/palettes",
    "/",
    "/palettes",
    "/palettes?q=saved",
    "/kS7Q8Yy5S_SChv0",
    "/ocean-gradients",
    "/collections",
    "/sitemap.xml",
    "/llms.txt"
  ];
  for (const agent of ["Googlebot", "GPTBot"]) {
    for (const path of kept)
      expect([agent, path, allowed(text, agent, path)]).toEqual([agent, path, false]);
    for (const path of open)
      expect([agent, path, allowed(text, agent, path)]).toEqual([agent, path, true]);
  }
  // who a palette credits is a page's own fetch for one reader, never a crawler's
  for (const agent of ["Googlebot", "GPTBot", "meta-externalagent"])
    expect([agent, allowed(text, agent, "/api/palette-credit?seed=kS7Q8Yy5S_SChv0")]).toEqual([
      agent,
      false
    ]);
  // the old site's addresses: search crawlers follow their 301s, AI crawlers read today's from the sitemap
  for (const path of ["/_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu", "/~abcdefg?style=radialGradient"])
    expect([
      path,
      allowed(text, "Googlebot", path),
      allowed(text, "Bingbot", path),
      allowed(text, "meta-externalagent", path),
      allowed(text, "ClaudeBot", path)
    ]).toEqual([path, true, true, false, false]);
  // the gallery's lists as JSON and Random are the agents' to read, as llms.txt says, and no search crawler's
  for (const path of [
    "/api/palettes",
    "/random",
    "/random?style=radialGradient",
    "/ja/random?style=radialGradient"
  ])
    expect([path, allowed(text, "Googlebot", path), allowed(text, "GPTBot", path)]).toEqual([
      path,
      false,
      true
    ]);
});
