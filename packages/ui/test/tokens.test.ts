import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { stale } from "../scripts/build-tokens.ts";
import { color, font, motion, space } from "../src/tokens.ts";

const root = join(import.meta.dirname, "..");
const tokens = JSON.parse(readFileSync(join(root, "tokens.json"), "utf8"));
const css = readFileSync(join(root, "src/tokens.css"), "utf8");
const host = readFileSync(join(root, "src/tokens-host.css"), "utf8");

describe("tokens", () => {
  test("the generated files are what tokens.json makes", () => {
    expect(stale(root)).toEqual([]);
  });

  test("every token is a custom property named by its group and name", () => {
    expect(css).toContain("--space-s4: 16px;");
    expect(css).toContain("--size-control-big: 40px;");
    expect(css).toContain("--font-lh-ui: 1.45;");
    expect(css).toContain("--motion-ease: cubic-bezier(0.2, 0.7, 0.2, 1);");
    const names = css.match(/^\s*--[\w-]+:/gm) ?? [];
    const scale = ["space", "radius", "font", "size", "motion"];
    const count = scale.reduce(
      (n, g) => n + Object.keys(tokens[g]).filter(k => !k.startsWith("$")).length,
      0
    );
    const colors = Object.keys(tokens.color).filter(k => !k.startsWith("$"));
    const light = colors.filter(k => tokens.color[k].$value.dark !== tokens.color[k].$value.light);
    expect(names.length).toBe(count + colors.length + light.length);
  });

  test("dark rests on :root and light overrides only what differs", () => {
    expect(css).toMatch(/:root,\s*\[data-theme="dark"\] \{[^}]*--color-bg: #0c0c0e;/);
    expect(css).toMatch(/\[data-theme="light"\] \{[^}]*--color-bg: #f3f2ee;/);
    const lightBlock = css.slice(css.indexOf('[data-theme="light"]'));
    expect(lightBlock).not.toContain("--color-on-art");
  });

  test("an MCP host's variables stand behind the tokens, with Grabient's values as fallbacks", () => {
    expect(host).toContain("--color-bg: var(--color-background-primary, #0c0c0e);");
    expect(host).toContain("--radius-control: var(--border-radius-lg, 10px);");
    expect(host).toContain("--font-bold: var(--font-weight-semibold, 700);");
    /* the token named as the host's own variable takes it by name, and never refers to itself */
    expect(host).not.toMatch(/--font-sans:/);
    expect(host).not.toMatch(/--font-mono:/);
    expect(host).toMatch(
      /\[data-host\]\[data-theme="light"\] \{[^}]*--color-bg: var\(--color-background-primary, #f3f2ee\);/
    );
  });

  test("code that draws reads numbers in px and ms", () => {
    expect(space.s4).toBe(16);
    expect(font.fs0).toBe(10.5);
    expect(font.lsTitle).toBe("-0.025em");
    expect(motion.reveal).toBe(560);
    expect(color.dark.grain).toBe(0.045);
    expect(color.light.bg).toBe("#f3f2ee");
  });
});
