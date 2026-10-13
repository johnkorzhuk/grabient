import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

/* A component's look comes from the tokens: its colors, type, spacing, radii, shadows and timings are variables, never
   literals, so a theme or a host changes every component at once. */
const src = join(import.meta.dirname, "../src");
const COLOR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/i;
const SYSTEM =
  /^(padding|margin)(-[a-z-]+)?$|^(gap|row-gap|column-gap|font|font-size|font-family|font-weight|line-height|letter-spacing|box-shadow|color|background-color|outline-color|transition-duration|text-shadow)$|^border(-[a-z]+)*-(radius|color)$/;
/* a length or a time that is not zero, once the variables and the environment's values are taken out */
const RAW = /(?<![\w.-])(?!0(?:\.0+)?(?:px|em|rem|ms|s)?\b)\d*\.?\d+(?:px|em|rem|ms|s)\b/;
const unwrap = (value: string) => value.replace(/\b(var|env)\([^()]*(\([^()]*\)[^()]*)*\)/g, "");

test("component styles take their values from the tokens", () => {
  const findings: string[] = [];
  for (const file of readdirSync(src).filter(f => f.endsWith(".module.css"))) {
    const css = readFileSync(join(src, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, prop, value] of css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
      if (COLOR.test(value)) findings.push(`${file}: ${prop}: ${value.trim()}`);
      else if (SYSTEM.test(prop) && RAW.test(unwrap(value)))
        findings.push(`${file}: ${prop}: ${value.trim()}`);
    }
  }
  expect(findings).toEqual([]);
});
