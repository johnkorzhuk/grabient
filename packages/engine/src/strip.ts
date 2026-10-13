/* The stop strip's layout: equal neighbors fuse into one chip, a long run on a wide screen breaks into two serpentine
   rows, and the label size comes from the narrowest chip. */
import { hexToSrgb, luminance } from "./color.ts";

export interface StripStop {
  hex: string;
  paint?: string;
}
export interface StripCell {
  hex: string;
  paint: string;
  ink: "onLight" | "onDark";
  span: number;
}
/** `rows` are in the gradient's order; whoever draws them runs the second right to left, so both ends of the gradient
    sit at the left. */
export interface StripLayout {
  rows: StripCell[][];
  two: boolean;
  vertical: boolean;
  size: number;
  show: boolean;
}

/** WCAG: whichever of black or white text contrasts more with this exact color. */
function inkFor(hex: string): StripCell["ink"] {
  const L = luminance(hexToSrgb(hex) ?? [0, 0, 0]);
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? "onLight" : "onDark";
}

/** `oneRow` keeps a single row at any width: a phone on its side. */
export function layoutStops(
  stops: readonly StripStop[],
  width: number,
  oneRow = false
): StripLayout {
  const cells: StripCell[] = [];
  for (const s of stops) {
    const last = cells[cells.length - 1];
    if (last && last.hex === s.hex) last.span++;
    else cells.push({ hex: s.hex, paint: s.paint ?? s.hex, ink: inkFor(s.hex), span: 1 });
  }
  const units = stops.length;
  /* two rows when one row's chips would be under 56px, never on a phone (under 640px) or under eight stops */
  const two = !oneRow && width >= 640 && width / Math.max(1, units) < 56 && units >= 8;
  const nrows = two ? 2 : 1;
  const cols = Math.ceil(units / nrows);
  const rows: StripCell[][] = Array.from({ length: nrows }, () => []);
  let u = 0;
  for (const c of cells) {
    let left = c.span;
    while (left > 0) {
      const row = Math.min(nrows - 1, Math.floor(u / cols));
      const take = Math.min(left, cols - (u - row * cols));
      rows[row].push({ ...c, span: take });
      u += take;
      left -= take;
    }
  }
  /* the second row's last chip fills it */
  if (nrows === 2 && rows[1].length)
    rows[1][rows[1].length - 1].span += cols - rows[1].reduce((a, c) => a + c.span, 0);
  const unit = width / cols;
  const rowHeight = two ? 56 : oneRow ? 52 : 72;
  const narrow = Math.min(...rows.flat().map(c => c.span * unit));
  const run = 7 * 7.4;
  const fit = (along: number, across: number) =>
    Math.min(13, Math.floor((12 * (along - 10)) / run), Math.floor((across - 8) / 1.1));
  const across = fit(narrow, rowHeight);
  const upright = fit(rowHeight, narrow);
  const vertical = upright >= 10 && (across < 10 || upright > across * 1.25);
  const size = vertical ? upright : across;
  return { rows, two, vertical, size, show: size >= 10 };
}

/** The stop nearest a place along the palette, 0 to 1. */
export const stopNear = (units: number, t: number) =>
  Math.round(Math.max(0, Math.min(1, t)) * (units - 1));

/** The chip that carries the stop nearest `t`: its row, and its place in the row in the gradient's order. Fused
    neighbors are one chip, so the stops they merged all answer with it. */
export function cellAt(L: StripLayout, units: number, t: number): { row: number; cell: number } {
  const cols = Math.ceil(units / L.rows.length);
  const k = stopNear(units, t);
  const row = Math.min(L.rows.length - 1, Math.floor(k / cols));
  const cells = L.rows[row];
  let u = row * cols;
  for (let i = 0; i < cells.length; i++) {
    u += cells[i].span;
    if (k < u) return { row, cell: i };
  }
  return { row, cell: cells.length - 1 };
}

/** Where a keyframe at `t` is marked: its row, and how far along it in percent. The second row runs right to left,
    and a mark keeps 1.5% clear of the strip's ends. */
export function placeMark(L: StripLayout, units: number, t: number): { row: number; x: number } {
  const cols = Math.ceil(units / L.rows.length);
  const p = t * (units - 1);
  const row = Math.min(L.rows.length - 1, Math.floor((p + 0.5) / cols));
  const along = Math.max(0.015, Math.min(0.985, (p - row * cols + 0.5) / cols));
  return { row, x: 100 * (row ? 1 - along : along) };
}
