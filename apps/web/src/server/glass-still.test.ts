import { glassFieldBackground, glassStillBackground } from "@grabient/engine/glass.ts";
import { glassStillKey } from "@grabient/engine/glass-colors.ts";
import { describe, expect, test } from "vitest";
import { glassStills } from "./glass-still.ts";
import { FIRST_SCREEN_STILLS } from "./stills.ts";

const COLORS = ["#112233", "#445566", "#778899", "#aabbcc", "#ddeeff", "#102030"];
const OTHER = ["#ff0000", "#ffaa00", "#ffff00", "#00ff00", "#0000ff", "#ff00ff"];
const page = (body: string) => `<html><head><title>t</title></head><body>${body}</body></html>`;
const rule = (key: string, background: string) =>
  `[data-glass-still="${key}"]{background:${background}}`;

describe("the glass's stills on a page", () => {
  test("a palette's first screen has the still, and its header's swatch of the same name takes it", () => {
    const key = glassStillKey(COLORS, 90);
    const html = glassStills(
      page(`<span data-glass-still="${key}"></span><div class="s" data-glass-still="${key}"></div>`)
    );
    expect(html).toContain(
      `<style id="glass-still" data-key="${key}">${rule(key, glassStillBackground(COLORS, 90))}</style></head>`
    );
    expect(html).not.toContain("glass-fields");
  });

  test("every other holder shows the still's field, one rule a name, as many as a first screen shows", () => {
    const one = glassStillKey(COLORS, 45);
    const two = glassStillKey(OTHER, 45, 7);
    const html = glassStills(
      page([one, two, one].map(k => `<span class="g" data-glass-still="${k}"></span>`).join(""))
    );
    expect(html).toContain(
      `<style id="glass-fields" data-key="${one} ${two}">${rule(one, glassFieldBackground(COLORS, 45))}${rule(two, glassFieldBackground(OTHER, 45, 7))}</style></head>`
    );
    expect(html).not.toContain('id="glass-still"');
    const many = Array.from({ length: FIRST_SCREEN_STILLS + 3 }, (_, i) =>
      glassStillKey(COLORS, i)
    );
    const capped = glassStills(
      page(many.map(k => `<span data-glass-still="${k}"></span>`).join(""))
    );
    expect(capped.match(/\]\{background:/g)).toHaveLength(FIRST_SCREEN_STILLS);
  });

  test("the field is the still's colors with no filter to paint, and far smaller", () => {
    const field = glassFieldBackground(COLORS, 90);
    expect(field).toMatch(/^url\("data:image\/svg\+xml,.*"\) 50% 50%\/cover no-repeat$/);
    expect(field).not.toMatch(/filter/);
    for (const color of COLORS) expect(field).toContain(color.replace("#", "%23"));
    expect(field.length * 10).toBeLessThan(glassStillBackground(COLORS, 90).length);
  });

  test("a name no page wrote, or a page with none, is left as it was", () => {
    const plain = page(`<span data-glass-still="90|0|red"></span>`);
    expect(glassStills(plain)).toBe(plain);
    expect(glassStills(page("<div></div>"))).toBe(page("<div></div>"));
  });
});
