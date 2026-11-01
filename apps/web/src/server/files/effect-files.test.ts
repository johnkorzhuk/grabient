import { decodePalette } from "@grabient/engine/codec.ts";
import { parseEffect } from "@grabient/engine/effect.ts";
import { effectStylesheet, effectSvg } from "@grabient/engine/effect-code.ts";
import { expect, test } from "vitest";
import { effectCssAnswer, effectSvgAnswer } from "./effect-files.ts";

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const P = decodePalette(SEED)!;
const ORIGIN = "https://grabient.test";
const effect = (query: string) => {
  const found = parseEffect(new URLSearchParams(query));
  if (!found) throw new Error(`no effect in ${query}`);
  return found;
};

test("an effect's stylesheet is the engine's, any page may load it, and no search engine lists it", async () => {
  const blob = effect("style=blob&shape=3");
  const answer = effectCssAnswer(ORIGIN, SEED, P, blob, 45);
  expect(await answer.text()).toBe(effectStylesheet(P, SEED, blob, 45, ORIGIN));
  expect(answer.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
  expect(answer.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(answer.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
  expect(answer.headers.get("X-Robots-Tag")).toBe("noindex");
  expect(answer.headers.has("Set-Cookie")).toBe(false);
});

test("an effect's SVG is the engine's at the size asked, and a link preview reads a page whose card is its first frame", async () => {
  const glass = effect("style=glass&speed=2");
  const request = new Request(`${ORIGIN}/${SEED}.svg?style=glass&speed=2`);
  const answer = effectSvgAnswer(request, ORIGIN, SEED, P, glass, 90, null);
  expect(await answer.text()).toBe(effectSvg(P, SEED, glass, 90, null, ORIGIN));
  expect(answer.headers.get("Access-Control-Allow-Origin")).toBe("*");
  const preview = effectSvgAnswer(
    new Request(request.url, { headers: { "User-Agent": "Slackbot-LinkExpanding 1.0" } }),
    ORIGIN,
    SEED,
    P,
    glass,
    90,
    null
  );
  const html = await preview.text();
  expect(preview.headers.get("Content-Type")).toContain("text/html");
  expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/api/og?seed=${SEED}`);
  expect(html).toContain("style=glass");
});
