import { describe, expect, test } from "vitest";
import { composeGridSvg, gridTiles, scopeSvgIds } from "../src/exportcompose.ts";
import {
  cellFor,
  EXPORT_DEFAULTS,
  type ExportLayout,
  type ExportSettings,
  exportLayout,
  GRID_MAX_PIXELS,
  GRID_MAX_SIDE,
  type GridItem,
  type GridOptions,
  gridFor,
  gridLayout,
  gridOptions,
  paintGrid
} from "../src/exportgrid.ts";
import { golden } from "./support.ts";

type Size = { width: number; height: number };
const layouts = golden<{
  EXPORT_DEFAULTS: ExportSettings;
  cases: { count: number; autoSize: Size | null; settings: ExportSettings; layout: ExportLayout }[];
}>("exportLayout");
const grids = golden<{
  GRID_MAX_PIXELS: number;
  GRID_MAX_SIDE: number;
  options: { input: Partial<GridOptions>; options: GridOptions }[];
  layouts: { count: number; input: GridOptions; layout: ReturnType<typeof gridLayout> }[];
}>("gridOptions");
const { items, gridOpts } = golden<{ items: GridItem[]; gridOpts: GridOptions }>(
  "exportGrid.items"
);

describe("the selection's image", () => {
  test("the column's settings lay the palettes out as before", () => {
    expect(EXPORT_DEFAULTS).toEqual(layouts.EXPORT_DEFAULTS);
    for (const c of layouts.cases)
      expect(exportLayout(c.count, c.settings, c.autoSize ?? undefined)).toEqual(c.layout);
  });

  test("grid options are whole numbers in bounds, and no image passes 8192 a side or 16M pixels", () => {
    expect([GRID_MAX_PIXELS, GRID_MAX_SIDE]).toEqual([grids.GRID_MAX_PIXELS, grids.GRID_MAX_SIDE]);
    for (const c of grids.options) expect(gridOptions(c.input)).toEqual(c.options);
    for (const c of grids.layouts) expect(gridLayout(c.count, c.input)).toEqual(c.layout);
  });

  test("each tile stands in whole pixels of the image, meeting the next as the scaled grid has them", () => {
    const input = gridOptions({ width: 1200, height: 720, columns: 10, gap: 72, padding: 108 });
    const { layout, tiles } = gridTiles(100, input);
    expect(layout.scale).toBeLessThan(1);
    for (const tile of tiles) {
      for (const v of [tile.x, tile.y, tile.width, tile.height])
        expect(Number.isInteger(v)).toBe(true);
      expect(tile.x + tile.width).toBeLessThanOrEqual(layout.width);
      expect(tile.y + tile.height).toBeLessThanOrEqual(layout.height);
    }
    // a row's tiles never overlap, and each is within a pixel of the scaled cell
    for (let i = 1; i < 10; i++)
      expect(tiles[i].x).toBeGreaterThan(tiles[i - 1].x + tiles[i - 1].width - 1);
    const cell = 1200 * (layout.width / layout.rawWidth);
    for (const tile of tiles) expect(Math.abs(tile.width - cell)).toBeLessThanOrEqual(1);
    // unscaled, the image's pixels are the raw ones
    const one = gridTiles(
      3,
      gridOptions({ width: 400, height: 200, columns: 3, gap: 24, padding: 32 })
    );
    expect(one.tiles.map(t => [t.x, t.y, t.width, t.height])).toEqual([
      [32, 32, 400, 200],
      [456, 32, 400, 200],
      [880, 32, 400, 200]
    ]);
  });

  test("a tile's SVG takes ids of its own, its images' documents left as they are", () => {
    const svg =
      '<svg width="10" height="10"><defs><linearGradient id="g"/><clipPath id="c"/></defs>' +
      '<rect fill="url(#g)" clip-path="url(#c)"/><use href="#g"/><use xlink:href="#c"/>' +
      "<image href=\"data:image/svg+xml,%3Csvg id='g'%3E%3Crect fill='url(%23g)'/%3E%3C/svg%3E\"/>" +
      '<rect fill="url(#elsewhere)"/></svg>';
    const scoped = scopeSvgIds(svg, "t2-");
    expect(scoped).toContain('id="t2-g"');
    expect(scoped).toContain('id="t2-c"');
    expect(scoped).toContain('fill="url(#t2-g)" clip-path="url(#t2-c)"');
    expect(scoped).toContain('<use href="#t2-g"/><use xlink:href="#t2-c"/>');
    // the image's own document, and a reference to an id the document does not hold, stay as written
    expect(scoped).toContain("%3Csvg id='g'%3E%3Crect fill='url(%23g)'/%3E");
    expect(scoped).toContain('fill="url(#elsewhere)"');
    expect(scopeSvgIds('<svg><rect fill="red"/></svg>', "t1-")).toBe(
      '<svg><rect fill="red"/></svg>'
    );
  });

  test("the SVG lays each palette's own SVG in its place, clipped to its corners and titled", () => {
    const tile = (fill: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><defs><linearGradient id="a"><stop stop-color="${fill}"/></linearGradient></defs><rect width="400" height="200" fill="url(#a)"/></svg>`;
    const input = gridOptions({
      width: 400,
      height: 200,
      columns: 2,
      gap: 24,
      padding: 32,
      radius: 20
    });
    const svg = composeGridSvg(
      [
        { svg: tile("#ff0000"), title: "https://grabient.com/k1?style=glass&a=1" },
        { svg: tile("#0000ff"), title: "https://grabient.com/k2" }
      ],
      input
    );
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" [^>]*width="888" height="264" viewBox="0 0 888 264">/
    );
    // each palette's ids are its own, so the two gradients never meet
    expect(svg).toContain(
      '<svg x="32" y="32" xmlns="http://www.w3.org/2000/svg" width="400" height="200"'
    );
    expect(svg).toContain('<svg x="456" y="32"');
    expect(svg).toContain('id="t1-a"><stop stop-color="#ff0000"/>');
    expect(svg).toContain('id="t2-a"><stop stop-color="#0000ff"/>');
    expect(svg).toContain('fill="url(#t2-a)"');
    // a tenth of the shorter side a corner, as the column's 20% of half of it says, and the address as its title
    expect(svg).toContain(
      '<g clip-path="url(#t1-corners)"><title>https://grabient.com/k1?style=glass&amp;a=1</title><defs><clipPath id="t1-corners"><rect x="32" y="32" width="400" height="200" rx="20" ry="20"/>'
    );
    expect(
      composeGridSvg([{ svg: tile("#fff"), title: "x" }], { ...input, radius: 0 })
    ).not.toContain("clip-path");
    expect(() => composeGridSvg([], input)).toThrow("Select a palette first.");
  });

  test("the files are drawn on the grid the panel shows, and a raster download is one cell", () => {
    const s = { ...EXPORT_DEFAULTS, corners: 20 };
    const l = exportLayout(5, s, { width: 1000, height: 600 });
    expect(gridFor(5, s, { width: 1000, height: 600 })).toEqual({
      width: l.cell.w,
      height: l.cell.h,
      columns: l.cols,
      gap: l.gap,
      padding: l.padding,
      radius: 40
    });
    expect(cellFor(s, { width: 1000, height: 600 })).toMatchObject({
      columns: 1,
      gap: 0,
      padding: 0,
      width: 1000
    });
  });

  test("a raster draws each tile clipped to its corners, bands as hard stops", () => {
    const calls: string[] = [];
    const gradient = {
      addColorStop: (o: number, c: string) => calls.push(`stop ${o.toFixed(3)} ${c}`)
    };
    const ctx = new Proxy(
      {},
      {
        get: (_, name: string) =>
          name === "fillStyle"
            ? undefined
            : (...args: unknown[]) => {
                calls.push(
                  `${name} ${args.map(a => (typeof a === "number" ? +a.toFixed(2) : "…")).join(" ")}`
                );
                return gradient;
              },
        set: () => true
      }
    );
    paintGrid(ctx as never, [{ ...items[1], steps: 2 }], { ...gridOpts, columns: 1 });
    expect(calls).toContain("roundRect 9 9 101 65 13");
    expect(calls.filter(c => c.startsWith("stop"))).toHaveLength(4);
  });
});
