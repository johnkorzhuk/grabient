import { describe, expect, test } from "vitest";
import {
  cellFor,
  EXPORT_DEFAULTS,
  type ExportLayout,
  type ExportSettings,
  exportGridCss,
  exportGridSvg,
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
import { fixture, golden } from "./support.ts";

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

  test("the SVG and CSS files are written as before", () => {
    expect(exportGridSvg(items, gridOpts, "https://grabient.com")).toBe(fixture("exportGrid.svg"));
    expect(exportGridCss(items, "https://grabient.com", "oklch")).toBe(
      fixture("exportGrid.oklch.css")
    );
    expect(exportGridCss(items, "https://grabient.com", "hex")).toBe(fixture("exportGrid.hex.css"));
    expect(() => exportGridSvg([], gridOpts, "https://grabient.com")).toThrow(
      "Select a palette first."
    );
    expect(() => exportGridCss([{ ...items[0], seed: "nope" }], "https://grabient.com")).toThrow(
      "Invalid palette."
    );
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
