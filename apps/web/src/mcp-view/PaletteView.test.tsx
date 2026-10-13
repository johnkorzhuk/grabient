import { renderToString } from "@solidjs/web";
import { describe, expect, test } from "vitest";
import { PaletteView, type PaletteViewProps } from "./PaletteView.tsx";
import type { Tile } from "./tiles.ts";

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

describe("the palette view", () => {
  test("draws one palette as a card: its name, its view in words, its seed, its colors and its page", () => {
    const html = draw({ tiles: tiles(1), fullscreen: true });
    expect(html).toContain('aria-label="Palette 1: Harbor at dusk"');
    const text = words(html);
    expect(text).toContain("Harbor at dusk Linear · 6 steps · 45° kW2TytYh4_EseP4znj-qR4_o");
    expect(text).toContain("Open on Grabient");
    expect(html).toContain(
      'href="https://grabient.com/kW2TytYh4_EseP4znj-qR4_o?steps=6&amp;angle=45"'
    );
    expect(html).toContain('aria-label="Full screen"');
    // the stop strip copies each color
    expect(count(html, /aria-label="Copy #[0-9a-f]{6}"/g)).toBe(6);
  });

  test("draws more as a carousel of eight and a card that leads to the rest", () => {
    const html = draw({ tiles: tiles(10), fullscreen: true });
    expect(words(html)).toContain("10 palettes");
    expect(count(html, /data-tile="/g)).toBe(8);
    expect(words(html)).toContain("All palettes 10");
    // a radial view turns with no angle
    expect(words(html)).toContain("Radial bands · 6 steps");
    expect(words(html)).not.toContain("Radial bands · 6 steps · 45°");
  });

  test("full screen shows the chosen palette's name and view, with every palette to choose from", () => {
    const html = draw({ tiles: tiles(3), mode: "fullscreen", selected: 1, inline: true });
    expect(html).toMatch(/<h2[^>]*>[^<]+<\/h2>/);
    expect(words(html)).toContain("Appearance");
    expect(count(html, /aria-pressed="true"/g)).toBeGreaterThanOrEqual(1);
    expect(html).toContain('aria-label="Exit full screen"');
  });

  test("waits in the card's place, and says so once the app goes quiet or sends none", () => {
    expect(draw({})).toContain('aria-busy="true"');
    expect(words(draw({ silent: true }))).toContain("Couldn't load palettes. Open Grabient");
    expect(words(draw({ tiles: [] }))).toBe("No palettes.");
  });
});
