import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { Env } from "../env.ts";
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
