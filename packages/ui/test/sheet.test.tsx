import { decodePalette } from "@grabient/engine/codec.ts";
import { contrastGrounds, contrastInks } from "@grabient/engine/contrast.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { renderToString } from "@solidjs/web";
import { describe, expect, test } from "vitest";
import { ContrastGrid } from "../src/ContrastGrid.tsx";
import { FigurePane } from "../src/FigurePane.tsx";
import { FormatStrip, placesOf, SWATCH_CHIPS } from "../src/FormatStrip.tsx";
import { type CodeSource, PaletteCode } from "../src/PaletteCode.tsx";
import { BRAND_SUPPLY } from "../src/supply.ts";

const P = decodePalette(BRAND_SUPPLY[1]) as Palette;
const hexes = sampleStops(P, 9).map(s => s.hex);
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("the format strip", () => {
  test("a format keeps its place in every mode, and formats never shown together share one", () => {
    expect(
      placesOf([
        ["url", "css", "svg", "png"],
        ["md", "css", "svg", "png"],
        ["md", "css", "svg", "png"]
      ])
    ).toEqual([["url", "md"], ["css"], ["svg"], ["png"]]);
    expect(
      placesOf([
        ["png", "svg", "css"],
        ["png", "svg", "jpeg"]
      ])
    ).toEqual([["png"], ["svg"], ["css", "jpeg"]]);
  });

  test("the server draws Copy, its mode press saying what a press turns it to", () => {
    const html = renderToString(() => (
      <FormatStrip
        size="lg"
        copy={["url", "css", "svg", "png"]}
        download={["md", "css", "svg", "png"]}
        swatches={SWATCH_CHIPS}
      />
    ));
    expect(html).toContain('aria-label="Copy"');
    expect(html).toContain('aria-label="Copying. Switch to download"');
    expect(html).toContain('aria-label="Swatches"');
    /* every chip's name stays in the markup, the unseen layers holding the strip's width */
    expect(html).toContain("> URL<");
    expect(html).toContain("data-unseen");
  });

  test("a strip of one mode has no mode press", () => {
    const html = renderToString(() => <FormatStrip variant="paper" copy={["svg", "png"]} />);
    expect(html).not.toContain("Switch to");
    expect(count(html, "<button")).toBe(2);
  });
});

describe("the sheet's panes", () => {
  test("a named figure is a group by its name, its copies at the head's end", () => {
    const html = renderToString(() => (
      <FigurePane name="Color space" aside={<button type="button">copy</button>} fill>
        <div>scene</div>
      </FigurePane>
    ));
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Color space"');
    expect(html).toContain("data-fill");
    const noted = renderToString(() => (
      <FigurePane note="The dots are keyframes.">
        <div />
      </FigurePane>
    ));
    expect(noted).toMatch(/aria-labelledby="([^"]+)"[\s\S]*id="\1"/);
  });

  test("the code opens on its first kind, a tab each, with Copy and the kind's note", () => {
    const sources: CodeSource[] = [
      { id: "seed", label: "Seed", text: () => BRAND_SUPPLY[1], note: () => "The whole palette." },
      {
        id: "css",
        label: "CSS",
        spellings: [
          { id: "oklch", label: "oklch" },
          { id: "hex", label: "hex" }
        ],
        text: s => `background: ${s};`
      }
    ];
    const html = renderToString(() => <PaletteCode sources={sources} initial="seed" />);
    expect(html).toContain('role="tablist"');
    expect(count(html, 'role="tab"')).toBe(2);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain('aria-label="Seed, as text"');
    expect(html).toContain(BRAND_SUPPLY[1]);
    expect(html).toContain("The whole palette.");
    expect(html).not.toContain('aria-label="Syntax"');
    const css = renderToString(() => <PaletteCode sources={sources} initial="css" />);
    expect(css).toContain('aria-label="Syntax"');
    expect(css).toContain(">oklch;<");
  });

  test("the contrast grid has a row to each ink and a named cell to each ground, the key at rest", () => {
    const html = renderToString(() => (
      <ContrastGrid colors={hexes.map(hex => ({ hex }))} aria-label="Text contrast" />
    ));
    const grounds = contrastGrounds(hexes);
    const inks = contrastInks(grounds);
    expect(html).toContain('role="grid"');
    expect(count(html, 'role="row"')).toBe(inks.length);
    expect(count(html, 'role="gridcell"')).toBe(inks.length * grounds.length);
    expect(count(html, 'tabindex="0"')).toBe(1);
    expect(html).toContain(`#ffffff on ${grounds[0]}`);
    expect(html).toContain("4.5:1");
    expect(html).not.toContain("Add text color");
    const mine = renderToString(() => (
      <ContrastGrid
        colors={hexes.map(hex => ({ hex }))}
        aria-label="Text contrast"
        inks={["#333333"]}
        onInks={() => {}}
      />
    ));
    expect(mine).toContain('aria-label="Add text color"');
    expect(mine).toContain('aria-label="Change #333333"');
  });
});
