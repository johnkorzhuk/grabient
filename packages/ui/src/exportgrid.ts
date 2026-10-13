/* The selection as one image. The export column's settings say each palette's size and how the palettes stand together
   (`exportLayout`); that is the grid every file is drawn on (`gridFor`), bounded so no image passes 8192 pixels a side
   or 16 million in all (`gridLayout`). The preview, the SVG and every copy compose the selection on that grid, and a
   PNG or JPEG download draws each palette alone at its cell's size, so the image shown is the image exported. */
import { decodePalette } from "@grabient/engine/codec.ts";
import { type ColorKind, cssLine } from "@grabient/engine/css.ts";
import { type Stop, sampleStops } from "@grabient/engine/curve.ts";
import { paletteSvg } from "@grabient/engine/svg.ts";
import {
  isSwatchStyle,
  resolveSize,
  type Size,
  type Style,
  viewSearch
} from "@grabient/engine/view.ts";
import { t } from "./i18n.ts";

/** Width and Height are each palette's size: its pixels, or auto, which follows the other side at Auto's shape (both
    auto with `preset` auto is Auto itself). `preset` names the row the size is: auto, a preset, screen or custom. Gap,
    padding and corners are percentages of a palette's shorter side. */
export interface ExportSettings {
  preset: string;
  width: number | "auto";
  height: number | "auto";
  /** auto: the count of columns that suits the size */
  columns: number | "auto";
  gap: number;
  padding: number;
  corners: number;
}
export const EXPORT_DEFAULTS: ExportSettings = {
  preset: "auto",
  width: "auto",
  height: "auto",
  columns: "auto",
  gap: 10,
  padding: 15,
  corners: 29
};
/* Auto where no stage gives one: a list's cell, and the 16 by 9 room its columns are fitted to */
const CELL: Size = { width: 1200, height: 720 };
const FRAME: Size = { width: 1920, height: 1080 };

export interface ExportLayout {
  cols: number;
  rows: number;
  /** one palette, in pixels of the image */
  cell: { w: number; h: number };
  /** between palettes and around them, in pixels of the image */
  gap: number;
  padding: number;
  /** the whole image */
  dims: Size;
}
/** The image for a count of palettes. Auto is the artwork's measured size on a seed route (`autoSize`) and 1200 by 720
    on a list; a side left auto follows the other at that shape. Auto columns pick the grid whose palettes come out
    largest in the room the image is seen in (the stage, or 16 by 9), then among grids within a hair of that the fewest
    empty places, then the shape nearest the room's. */
export function exportLayout(count: number, s: ExportSettings, autoSize?: Size): ExportLayout {
  const n = Math.max(1, count);
  const size = resolveSize(
    s.preset === "auto" ? null : { width: s.width, height: s.height },
    autoSize ?? CELL
  );
  const cell = { w: Math.max(1, size.width), h: Math.max(1, size.height) };
  const unit = Math.min(cell.w, cell.h) / 100;
  const gap = Math.round(s.gap * unit);
  const padding = Math.round(s.padding * unit);
  const rowsFor = (c: number) => Math.max(1, Math.ceil(n / c));
  const dimsFor = (c: number) => ({
    width: 2 * padding + c * cell.w + (c - 1) * gap,
    height: 2 * padding + rowsFor(c) * cell.h + (rowsFor(c) - 1) * gap
  });
  const room = autoSize ?? FRAME;
  let cols = 1;
  if (s.columns !== "auto") cols = Math.max(1, Math.min(s.columns, n));
  else {
    let bestK = 0;
    let bestEmpty = Number.POSITIVE_INFINITY;
    let bestShape = Number.POSITIVE_INFINITY;
    for (let c = 1; c <= n; c++) {
      const d = dimsFor(c);
      const k = Math.min(room.width / d.width, room.height / d.height);
      const empty = rowsFor(c) * c - n;
      const shape = Math.abs(Math.log(d.width / d.height) - Math.log(room.width / room.height));
      if (
        k > bestK * 1.005 ||
        (k >= bestK * 0.995 && (empty < bestEmpty || (empty === bestEmpty && shape < bestShape)))
      ) {
        cols = c;
        bestK = Math.max(bestK, k);
        bestEmpty = empty;
        bestShape = shape;
      }
    }
  }
  return { cols, rows: rowsFor(cols), cell, gap, padding, dims: dimsFor(cols) };
}

/** A grid as the files are drawn on: a cell's pixels, the columns, the gap and padding, and corners as a percent of
    half a cell's shorter side. */
export interface GridOptions {
  width: number;
  height: number;
  columns: number;
  gap: number;
  padding: number;
  radius: number;
}
const DEFAULT_GRID: GridOptions = {
  width: 400,
  height: 200,
  columns: 5,
  gap: 24,
  padding: 32,
  radius: 0
};
export const GRID_MAX_PIXELS = 16_000_000;
export const GRID_MAX_SIDE = 8192;
const integer = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
/** Options from anywhere, as whole numbers in bounds; what is no number takes the default. */
export function gridOptions(value: Partial<GridOptions> = {}): GridOptions {
  return {
    width: integer(value.width, 1, GRID_MAX_SIDE, DEFAULT_GRID.width),
    height: integer(value.height, 1, GRID_MAX_SIDE, DEFAULT_GRID.height),
    columns: integer(value.columns, 1, 50, DEFAULT_GRID.columns),
    gap: integer(value.gap, 0, GRID_MAX_SIDE, DEFAULT_GRID.gap),
    padding: integer(value.padding, 0, GRID_MAX_SIDE, DEFAULT_GRID.padding),
    radius: integer(value.radius, 0, 100, DEFAULT_GRID.radius)
  };
}
/** The image's raw size and the scale that keeps it inside the bounds; never scaled up. */
export function gridLayout(count: number, input: GridOptions) {
  const options = gridOptions(input);
  const columns = Math.min(options.columns, Math.max(1, count));
  const rows = Math.max(1, Math.ceil(count / columns));
  const rawWidth = columns * options.width + (columns - 1) * options.gap + 2 * options.padding;
  const rawHeight = rows * options.height + (rows - 1) * options.gap + 2 * options.padding;
  const scale = Math.min(
    1,
    GRID_MAX_SIDE / rawWidth,
    GRID_MAX_SIDE / rawHeight,
    Math.sqrt(GRID_MAX_PIXELS / (rawWidth * rawHeight))
  );
  return {
    options,
    columns,
    rows,
    rawWidth,
    rawHeight,
    scale,
    width: Math.max(1, Math.floor(rawWidth * scale)),
    height: Math.max(1, Math.floor(rawHeight * scale))
  };
}
/** The grid the column's settings describe, for `count` palettes. */
export function gridFor(count: number, s: ExportSettings, autoSize?: Size): GridOptions {
  const l = exportLayout(count, s, autoSize);
  return gridOptions({
    width: Math.round(l.cell.w),
    height: Math.round(l.cell.h),
    columns: l.cols,
    gap: l.gap,
    padding: l.padding,
    radius: Math.min(100, s.corners * 2)
  });
}
/** One palette alone at its cell's size and corners: a PNG or JPEG download of the selection, a file each. */
export const cellFor = (s: ExportSettings, autoSize?: Size): GridOptions => ({
  ...gridFor(1, s, autoSize),
  columns: 1,
  gap: 0,
  padding: 0
});

/** A palette as the grid draws it: its seed in its view. */
export interface GridItem {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
}
function stopsOf(item: GridItem): Stop[] {
  const palette = decodePalette(item.seed);
  if (!palette) throw new Error(t("Invalid palette."));
  return sampleStops(palette, item.steps);
}
const addressOf = (item: GridItem, origin: string) =>
  new URL(`/${item.seed}${viewSearch(item)}`, origin).toString();
/* where a tile stands on the grid, in the image's raw pixels */
function placeOf(index: number, o: GridOptions, columns: number) {
  return {
    x: o.padding + (index % columns) * (o.width + o.gap),
    y: o.padding + Math.floor(index / columns) * (o.height + o.gap)
  };
}
/* the line a linear gradient runs along in CSS: through the middle, as long as the box's projection on its direction */
function cssLineOf(angle: number, w: number, h: number) {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  return { dx, dy, line: Math.abs(w * dx) + Math.abs(h * dy) };
}

/** Every palette as a CSS class in the reader's spelling, each under its address. */
export function exportGridCss(
  items: readonly GridItem[],
  origin: string,
  kind: ColorKind = "oklch"
): string {
  return `${items
    .map(
      (item, i) =>
        `/* ${addressOf(item, origin)} */\n.palette-${i + 1} {\n  ${cssLine(stopsOf(item), item.style, item.angle, kind)}\n}`
    )
    .join("\n\n")}\n`;
}

/** The selection on its grid as one SVG: each tile titled with its palette's address and its ids its own. A linear
    gradient is drawn on the CSS gradient line in the tile's own pixels; the other styles are the palette's own SVG. */
export function exportGridSvg(
  items: readonly GridItem[],
  input: GridOptions,
  origin: string
): string {
  if (!items.length) throw new Error(t("Select a palette first."));
  const layout = gridLayout(items.length, input);
  const o = layout.options;
  const tiles = items.map((item, index) => {
    const { x, y } = placeOf(index, o, layout.columns);
    const stops = stopsOf(item);
    let inner: string;
    if (item.style === "linearGradient") {
      const { dx, dy, line } = cssLineOf(item.angle, o.width, o.height);
      const cx = o.width / 2;
      const cy = o.height / 2;
      const id = `grid_linear_${index}`;
      const corner = ((o.radius / 100) * Math.min(o.width, o.height)) / 2;
      inner = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${cx - (dx * line) / 2}" y1="${cy - (dy * line) / 2}" x2="${cx + (dx * line) / 2}" y2="${cy + (dy * line) / 2}">${stops.map(s => `<stop offset="${s.t}" stop-color="${s.hex}"/>`).join("")}</linearGradient></defs><rect width="${o.width}" height="${o.height}" rx="${corner}" fill="url(#${id})"/>`;
    } else {
      const svg = paletteSvg(
        stops.map(s => s.hex),
        item.style,
        item.angle,
        { seed: item.seed, search: viewSearch(item), baseUrl: origin },
        { width: o.width, height: o.height, gridItemIndex: index, borderRadius: o.radius }
      );
      inner = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
    }
    const title = addressOf(item, origin)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
    return `<g transform="translate(${x} ${y})"><title>${title}</title>${inner}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.rawWidth} ${layout.rawHeight}" fill="none">\n${tiles.join("\n")}\n</svg>`;
}

/** The 2D drawing a raster export needs, from a page's canvas or a worker's. */
export type GridContext = Pick<
  CanvasRenderingContext2D,
  | "scale"
  | "save"
  | "restore"
  | "beginPath"
  | "roundRect"
  | "clip"
  | "fillRect"
  | "createLinearGradient"
  | "createRadialGradient"
  | "createConicGradient"
> & { fillStyle: CanvasRenderingContext2D["fillStyle"] };
/** The grid painted on a context sized to `gridLayout`'s width and height. Bands are hard stops, as on the page. */
export function paintGrid(ctx: GridContext, items: readonly GridItem[], input: GridOptions): void {
  const layout = gridLayout(items.length, input);
  const o = layout.options;
  ctx.scale(layout.width / layout.rawWidth, layout.height / layout.rawHeight);
  items.forEach((item, index) => {
    const { x, y } = placeOf(index, o, layout.columns);
    const cx = x + o.width / 2;
    const cy = y + o.height / 2;
    let gradient: CanvasGradient;
    if (item.style.startsWith("angular"))
      gradient = ctx.createConicGradient(((item.angle - 90) * Math.PI) / 180, cx, cy);
    else if (item.style.startsWith("radial"))
      gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(o.width, o.height) / 2);
    else {
      const { dx, dy, line } = cssLineOf(item.angle, o.width, o.height);
      gradient = ctx.createLinearGradient(
        cx - (dx * line) / 2,
        cy - (dy * line) / 2,
        cx + (dx * line) / 2,
        cy + (dy * line) / 2
      );
    }
    const stops = stopsOf(item);
    stops.forEach((stop, i) => {
      if (isSwatchStyle(item.style)) {
        gradient.addColorStop(i / stops.length, stop.hex);
        gradient.addColorStop((i + 1) / stops.length, stop.hex);
      } else gradient.addColorStop(stop.t, stop.hex);
    });
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, o.width, o.height, ((o.radius / 100) * Math.min(o.width, o.height)) / 2);
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, o.width, o.height);
    ctx.restore();
  });
}

/** The grid as a PNG, its ground clear, or a JPEG on white paper. Browser only. */
export function exportGridImage(
  items: readonly GridItem[],
  input: GridOptions,
  type: "image/png" | "image/jpeg" = "image/png"
): Promise<Blob> {
  if (!items.length) return Promise.reject(new Error(t("Select a palette first.")));
  const layout = gridLayout(items.length, input);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error(t("This browser can't export images.")));
  if (type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  paintGrid(ctx, items, input);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error(t("Couldn't export the image.")))),
      type,
      type === "image/jpeg" ? 0.92 : undefined
    )
  );
}
