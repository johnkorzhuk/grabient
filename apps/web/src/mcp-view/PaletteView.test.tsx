import { renderToString } from "@solidjs/web";
import { describe, expect, test } from "vitest";
import { PaletteView, type PaletteViewProps } from "./PaletteView.tsx";
import { stopsOf, type Tile } from "./tiles.ts";

/* The view as an app first draws it, in each of its states. */

const SEEDS = [
  "kW2TytYh4_EseP4znj-qR4_o",
  "kSU4odi5a3S3FOu",
  "kQ9AZIsQNAw",
  "kQjwzk9bzKQ",
  "kWnpBn7C5BGgIwLVmMCS0hAg",
  "kY40k9WZ--isVvOKjbZMhO1O2kuu",
  "kcoggPwofML8QRpJGkWWSLFGKmxLfFcRzQREQ",
  "kcJGJunjE_SqxQA3MUFwzFB0-xQVcMUFaDFCo",
  "kUISool0009C0NP5lTTg",
  "kYwY8g0sfAzbBQAgpzvMYy6FyDvA"
];
const tiles = (count: number): Tile[] =>
  SEEDS.slice(0, count).map((seed, i) => ({
    tile: i + 1,
    seed,
    style: i % 2 ? "radialSwatches" : "linearGradient",
    steps: 6,
    angle: 45,
    ...(i === 0 ? { title: "Harbor at dusk" } : {})
  }));
const draw = (props: Partial<PaletteViewProps>) =>
  renderToString(() => (
    <PaletteView tiles={null} origin="https://grabient.com" mode="inline" {...props} />
  ));
const words = (markup: string) =>
  markup
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const count = (markup: string, pattern: RegExp) => markup.match(pattern)?.length ?? 0;
/* each carousel card's markup, which holds no list of its own */
const slides = (markup: string) =>
  markup.match(/<li\b[^>]*\bdata-tile="\d+"[^>]*>[\s\S]*?<\/li>/g) ?? [];
const presses = (markup: string) => count(markup, /<(?:button|a)\b/g);

describe("the palette view", () => {
  test("draws one palette as a card: its name, its view in words, its seed, and only Full screen and its page to press", () => {
    const html = draw({ tiles: tiles(1), fullscreen: true });
    expect(html).toContain('aria-label="Palette 1: Harbor at dusk"');
    const text = words(html);
    expect(text).toContain("Harbor at dusk Linear · 6 steps · 45° kW2TytYh4_EseP4znj-qR4_o");
    expect(text).toContain("Open on Grabient");
    expect(html).toContain(
      'href="https://grabient.com/kW2TytYh4_EseP4znj-qR4_o?steps=6&amp;angle=45"'
    );
    expect(html).toContain('aria-label="Full screen"');
    // Full screen is the one button, and Open the one link: the strip and the colors to copy are full screen's
    expect(count(html, /<button\b/g)).toBe(1);
    expect(count(html, /<a\b/g)).toBe(1);
    expect(html).not.toContain('aria-label="Copy ');
    expect(html).not.toContain('data-part="strip"');
  });

  test("draws more as a carousel of eight and a card that leads to the rest", () => {
    const html = draw({ tiles: tiles(10), fullscreen: true });
    expect(words(html)).toContain("10 palettes");
    expect(count(html, /data-tile="/g)).toBe(8);
    expect(words(html)).toContain("All palettes 10");
    // a radial view turns with no angle
    expect(words(html)).toContain("Radial bands · 6 steps");
    expect(words(html)).not.toContain("Radial bands · 6 steps · 45°");
    // a card's one press is its picture, which opens full screen on it
    expect(count(html, /aria-label="Open palette \d+ in full screen"/g)).toBe(8);
    expect(slides(html)).toHaveLength(8);
    for (const card of slides(html)) expect(presses(card)).toBe(1);
    expect(html).not.toContain('aria-label="Copy ');
  });

  test("in an app with no full screen, a card's one press is its page, and a carousel's cards have none", () => {
    const card = draw({ tiles: tiles(1), fullscreen: false });
    expect(count(card, /<button\b/g)).toBe(0);
    expect(count(card, /<a\b/g)).toBe(1);
    const row = draw({ tiles: tiles(5), fullscreen: false });
    expect(slides(row)).toHaveLength(5);
    for (const slide of slides(row)) expect(presses(slide)).toBe(0);
  });

  test("full screen shows the chosen palette's name, view, strip and colors, with every palette to choose from", () => {
    const html = draw({ tiles: tiles(3), mode: "fullscreen", selected: 1, inline: true });
    expect(html).toMatch(/<h2[^>]*>[^<]+<\/h2>/);
    expect(words(html)).toContain("Appearance");
    expect(count(html, /aria-pressed="true"/g)).toBeGreaterThanOrEqual(1);
    expect(html).toContain('aria-label="Exit full screen"');
    expect(html).toContain('aria-label="Copy CSS"');
    expect(count(html, /aria-label="Copy #[0-9a-f]{6}"/g)).toBe(stopsOf(tiles(3)[1]).length);
  });

  test("waits in the card's place, and says so once the app goes quiet or sends none", () => {
    expect(draw({})).toContain('aria-busy="true"');
    expect(words(draw({ silent: true }))).toContain("Couldn't load palettes. Open Grabient");
    expect(words(draw({ tiles: [] }))).toBe("No palettes.");
  });
});
