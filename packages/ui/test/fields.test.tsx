import { decodePalette } from "@grabient/engine/codec.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { renderToString } from "@solidjs/web";
import { describe, expect, test } from "vitest";
import { HexField } from "../src/HexField.tsx";
import { Keyframes } from "../src/Keyframes.tsx";
import { Plot } from "../src/Plot.tsx";
import { Scrub } from "../src/Scrub.tsx";
import { StopStrip } from "../src/StopStrip.tsx";
import { BRAND_SUPPLY } from "../src/supply.ts";

const P = decodePalette(BRAND_SUPPLY[0]) as Palette;
const keys = P.anchors
  .map((_, i) => sampleStops(P, P.anchors.length)[i])
  .map(s => ({ hex: s.hex }));
const none = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("the editor's side, drawn on the server", () => {
  test("a number field is a named spin button with its value, read only until typed in", () => {
    const html = renderToString(() => (
      <Scrub
        label="Lightness"
        value={0.8431}
        min={0}
        max={1}
        grain={0.001}
        fmt={v => v.toFixed(3)}
        onInput={none}
      />
    ));
    expect(html).toContain('role="spinbutton"');
    expect(html).toContain('aria-label="Lightness"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('value="0.843"');
    expect(html).toMatch(/\breadonly\b/);
    expect(html).toContain("--aw:84.31%");
    /* a field with no ends has no range bar to fill, and one through zero marks zero */
    expect(
      renderToString(() => <Scrub label="Travel" value={20} min={-180} max={180} onInput={none} />)
    ).toContain("--at0:50.00%");
  });

  test("a lock joins the field's end with its name and pressed state", () => {
    const html = renderToString(() => (
      <Scrub
        label="Chroma"
        value={0.1}
        min={0}
        max={0.35}
        small
        locked
        lockLabel="Lock chroma"
        onLock={none}
        onInput={none}
      />
    ));
    expect(html).toContain('aria-label="Lock chroma"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-joined="end"');
    expect(html).toContain('data-size="md"');
  });

  test("the hex field names its input, and its swatch opens a dialog it has not drawn yet", () => {
    const plain = renderToString(() => <HexField value="#f9c251" onCommit={() => true} />);
    expect(plain).toContain('aria-label="Hex color"');
    expect(plain).toContain('value="#f9c251"');
    expect(plain).not.toContain("Color picker");
    const picking = renderToString(() => (
      <HexField quiet value="#f9c251" onCommit={() => true} onPick={none} />
    ));
    expect(picking).toContain('aria-haspopup="dialog"');
    expect(picking).toContain('aria-expanded="false"');
    expect(picking).not.toContain('role="dialog"');
  });

  test("the keyframes are a listbox of options, the held ones selected, and the count stops at its limits", () => {
    const html = renderToString(() => (
      <Keyframes
        stops={keys}
        selection={[1]}
        lead={1}
        onPick={none}
        min={2}
        max={keys.length}
        onAdd={none}
        onRemove={none}
      />
    ));
    expect(html).toContain('role="listbox"');
    expect(count(html, 'role="option"')).toBe(keys.length);
    expect(count(html, 'aria-selected="true"')).toBe(1);
    expect(html).toContain(`Keyframe 2, ${keys[1].hex}`);
    expect(html).toContain('aria-label="Keyframe count"');
    /* at the most keyframes, plus says it cannot and stays where it is */
    expect(html).toMatch(/aria-disabled="true"[^>]*aria-label="Add keyframe"/);
  });

  test("the strip is a group of copy presses laid out at 900px until measured", () => {
    const stops = sampleStops(P, 9).map(s => ({ hex: s.hex }));
    const html = renderToString(() => (
      <StopStrip stops={stops} reading={0.5} marks={[{ t: 0.25, paint: "#ff0000" }]} />
    ));
    expect(html).toContain('aria-label="Palette colors"');
    expect(count(html, 'aria-label="Copy #')).toBe(9);
    expect(count(html, "data-read")).toBe(1);
    expect(count(html, 'tabindex="0"')).toBe(1);
    expect(html).toContain("--c:#ff0000");
    /* seventeen stops at 900px are under 56px each: two rows, the second running back */
    const many = renderToString(() => (
      <StopStrip stops={sampleStops(P, 17).map(s => ({ hex: s.hex }))} />
    ));
    expect(many).toContain("data-two");
    expect(many).toContain("data-back");
  });

  test("a plot is a named picture at 480px until measured, a dot to each keyframe", () => {
    const html = renderToString(() => (
      <Plot
        palette={P}
        axis="l"
        height={160}
        stops={keys}
        selection={[0]}
        onPick={none}
        onNudge={none}
        aria-label="Lightness"
      />
    ));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Lightness"');
    expect(html).toContain('width="480"');
    expect(count(html, 'class="dot"')).toBe(P.anchors.length);
    expect(count(html, 'class="ring" data-on=""')).toBe(1);
    expect(html).toContain(">1</text>");
    const hue = renderToString(() => (
      <Plot
        palette={P}
        axis="h"
        height={160}
        stops={keys}
        selection={[]}
        onPick={none}
        onNudge={none}
        aria-label="Hue"
      />
    ));
    expect(hue).toContain('class="hue"');
    expect(hue).toMatch(/°<\/text>/);
  });
});
