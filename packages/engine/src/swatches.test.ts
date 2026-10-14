import { expect, test } from "vitest";
import { golden } from "../test/support.ts";
import { ENGLISH } from "./message.ts";
import {
  isSwatchFormat,
  SWATCH_FILES,
  SWATCH_FORMATS,
  type SwatchFormat,
  type SwatchPalette,
  swatchFile,
  swatchName,
  swatchPalette
} from "./swatches.ts";
import type { View } from "./view.ts";

const ORIGIN = "https://grabient.com";
const swatches = golden<{
  entries: {
    id: string;
    seed: string;
    view: View;
    palette: SwatchPalette;
    fileNames: Record<SwatchFormat, string>;
    files: Record<SwatchFormat, string>;
  }[];
  multi: {
    name: string;
    ids?: string[];
    palettes?: SwatchPalette[];
    files: Record<SwatchFormat, string>;
    fileNames?: Record<SwatchFormat, string>;
  }[];
  fileNameCases: { name: string; names: Record<SwatchFormat, string> }[];
}>("swatches");
const base64 = (file: Uint8Array | string) =>
  Buffer.from(typeof file === "string" ? new TextEncoder().encode(file) : file).toString("base64");

test("each palette's swatch files are the bytes the Worker sent before", () => {
  for (const e of swatches.entries) {
    const p = swatchPalette(e.seed, e.view, ORIGIN) as SwatchPalette;
    expect(p, e.id).toEqual(e.palette);
    for (const format of SWATCH_FORMATS) {
      expect(swatchName(p.name, format)).toBe(e.fileNames[format]);
      expect(base64(swatchFile(format, [p])), `${e.id} ${format}`).toBe(e.files[format]);
    }
  }
});

test("a file of several palettes, names the formats mend, and file names a file system refuses", () => {
  const byId = new Map(swatches.entries.map(e => [e.id, e.palette]));
  for (const m of swatches.multi) {
    const list = m.ids
      ? m.ids.map(id => byId.get(id) as SwatchPalette)
      : (m.palettes as SwatchPalette[]);
    for (const format of SWATCH_FORMATS) {
      expect(base64(swatchFile(format, list, m.ids ? m.name : "Odd")), `${m.name} ${format}`).toBe(
        m.files[format]
      );
      if (m.fileNames) expect(swatchName(m.name, format)).toBe(m.fileNames[format]);
    }
  }
  for (const c of swatches.fileNameCases) {
    for (const format of SWATCH_FORMATS) expect(swatchName(c.name, format)).toBe(c.names[format]);
  }
});

test("formats, media types and a translated swatch name", () => {
  expect(SWATCH_FORMATS.filter(isSwatchFormat)).toEqual(["tokens", "ase", "gpl", "grd"]);
  expect(isSwatchFormat("png")).toBe(false);
  expect(SWATCH_FILES.tokens).toEqual({
    extension: "tokens.json",
    type: "application/design-tokens+json"
  });
  const french = { t: (m: string) => (m === "navy" ? "bleu marine" : ENGLISH.t(m)), locale: "fr" };
  const view = { style: "linearGradient", steps: 7, angle: 90 } as const;
  const p = swatchPalette("kWNS69s7i_sVKwfTx8K6arBQ", view, ORIGIN, {
    name: "Nuit",
    language: french
  });
  expect(p?.name).toBe("Nuit");
  expect(p?.names?.[0]).toBe("1 Bleu marine");
  // the precise names, where they are read, in every language
  const named = swatchPalette("kWNS69s7i_sVKwfTx8K6arBQ", view, ORIGIN, {
    language: french,
    names: hex => `Exactly ${hex}`
  });
  expect(named?.names?.[0]).toBe(`1 Exactly ${named?.colors[0]}`);
  expect(
    swatchPalette("not a seed", { style: "linearGradient", steps: 7, angle: 90 }, ORIGIN)
  ).toBeNull();
});
