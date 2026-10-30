/* A sheet as SVG: the PNG's rows (paint.ts drawSheet) drawn as shapes, so it stays sharp at any size and its hexes are
   text a reader can select. The rows, the chips and the letters' sizes are the PNG's (sheetBoxes, chipLetters); the
   hexes are set in Poppins where the reader has it, else in the system's sans. */
import { luminance } from "@grabient/engine/color.ts";
import { isSwatchStyle } from "@grabient/engine/view.ts";
import { LOGO_BAR, LOGO_PATH } from "@grabient/ui/logo.data.ts";
import { HEX_SIZES } from "./hex-glyphs.data.ts";
import {
  across,
  blackReads,
  CORNER,
  chipLetters,
  chipsAcross,
  type Look,
  PAPER,
  type Rgb,
  type SheetRow,
  sheetBoxes
} from "./paint.ts";
import { MARGIN, WORDMARK } from "./size.ts";

const hexOf = (rgb: readonly number[]) =>
  `#${rgb.map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const percent = (x: number) => `${Number((x * 100).toFixed(3))}%`;
const escaped = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A look's stops along a gradient's line: blended between, or each band held from its edge to the next. */
function stopsOf(look: Look): string {
  const n = look.colors.length;
  const at = (offset: number, rgb: Rgb) =>
    `<stop offset="${percent(offset)}" stop-color="${hexOf(rgb)}"/>`;
  if (isSwatchStyle(look.style)) {
    return look.colors.map((rgb, i) => at(i / n, rgb) + at((i + 1) / n, rgb)).join("");
  }
  return look.colors.map((rgb, i) => at(n > 1 ? i / (n - 1) : 0, rgb)).join("");
}

/** The sheet of `rows` as an SVG of `width` by `height`, titled for a reader that names it. */
export function sheetSvg(
  rows: readonly SheetRow[],
  width: number,
  height: number,
  title: string
): string {
  const boxes = sheetBoxes(rows.length, width, height);
  const scale = WORDMARK.width / 220;
  const defs: string[] = [];
  const shapes: string[] = [];
  const words: string[] = [];
  if (rows.length) {
    defs.push(
      `<linearGradient id="bar">${stopsOf({ ...rows[0].look, style: "linearGradient" })}</linearGradient>`
    );
  }
  rows.forEach((row, i) => {
    const box = boxes[i];
    const look = across(row.look);
    defs.push(
      `<linearGradient id="g${i}">${stopsOf(look)}</linearGradient>`,
      `<clipPath id="c${i}"><rect x="${box.row.x}" y="${box.row.y}" width="${box.row.width}" height="${box.row.height}" rx="${CORNER}"/></clipPath>`
    );
    const chips = chipsAcross(row.chips, box.chips.width);
    const letters = chipLetters(chips, box.chips.height);
    shapes.push(
      `<g clip-path="url(#c${i})"><rect x="${box.strip.x}" y="${box.strip.y}" width="${box.strip.width}" height="${box.strip.height}" fill="url(#g${i})"/>${chips
        .map(
          chip =>
            `<rect x="${box.chips.x + chip.x}" y="${box.chips.y}" width="${chip.width}" height="${box.chips.height}" fill="${chip.hex}"/>`
        )
        .join("")}</g>`
    );
    if (letters < 0) return;
    for (const chip of chips) {
      const ink = blackReads(luminance(chip.rgb.map(v => v / 255))) ? "#000" : "#fff";
      words.push(
        `<text x="${box.chips.x + chip.x + chip.width / 2}" y="${box.chips.y + box.chips.height / 2}" font-size="${HEX_SIZES[letters].size}" fill="${ink}">${chip.hex}</text>`
      );
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escaped(title)}</title><defs>${defs.join("")}</defs><rect width="${width}" height="${height}" fill="${hexOf(PAPER)}"/><g transform="translate(${MARGIN} ${MARGIN}) scale(${scale})"><path fill="#0a0a0a" d="${LOGO_PATH}"/><rect x="${LOGO_BAR.x}" y="${LOGO_BAR.y}" width="${LOGO_BAR.w}" height="${LOGO_BAR.h}" fill="url(#bar)"/></g>${shapes.join("")}<g font-family="Poppins, ui-sans-serif, system-ui, sans-serif" font-weight="500" text-anchor="middle" dominant-baseline="central">${words.join("")}</g></svg>`;
}
