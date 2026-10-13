/* A palette as the files design apps import: Adobe Swatch Exchange (Photoshop, Illustrator, InDesign, Procreate,
   Affinity), a GIMP palette (GIMP, Inkscape, Krita, Aseprite), a Photoshop gradient, and design tokens (Figma's
   variables, Penpot, Style Dictionary). A file holds one palette or many, a group per palette where the format has
   groups, each in its view's colors as the Colors tab lists them. The only mention of the site is each palette's
   address, where the format has a comment or a description. */
import { decodePalette } from "./codec.ts";
import { hexBytes } from "./color.ts";
import { srgbName } from "./colorname.ts";
import { sampleStops } from "./curve.ts";
import { ENGLISH, type Language, sentence } from "./message.ts";
import { seedName } from "./name.ts";
import { isSwatchStyle, type View, viewSearch } from "./view.ts";

export type SwatchFormat = "ase" | "gpl" | "grd" | "tokens";
export const SWATCH_FORMATS: readonly SwatchFormat[] = ["tokens", "ase", "gpl", "grd"];
export const isSwatchFormat = (f: string): f is SwatchFormat =>
  SWATCH_FORMATS.includes(f as SwatchFormat);
/** Each format's file name ending and media type. ASE and GRD have no registered type. */
export const SWATCH_FILES: Readonly<Record<SwatchFormat, { extension: string; type: string }>> = {
  ase: { extension: "ase", type: "application/octet-stream" },
  gpl: { extension: "gpl", type: "text/plain; charset=utf-8" },
  grd: { extension: "grd", type: "application/octet-stream" },
  tokens: { extension: "tokens.json", type: "application/design-tokens+json" }
};

/** A palette as a file holds it: its name, its address, its view's colors as #rrggbb, `banded` where the view draws
    them as hard bands, and each color's swatch name ("1 Navy"); without names a swatch is its place alone. */
export interface SwatchPalette {
  name: string;
  address: string;
  colors: readonly string[];
  names?: readonly string[];
  banded: boolean;
}

/** A palette in a view as a swatch file holds it: steps never under its keyframes, each color named by its place and
    the name people give it, the palette named as its card names it unless a name is given. Words are said in
    `language`; the Worker's files are English. Null for a seed that is no palette. */
export function swatchPalette(
  seed: string,
  view: Pick<View, "style" | "steps" | "angle">,
  origin: string,
  name?: string,
  language: Language = ENGLISH
): SwatchPalette | null {
  const P = decodePalette(seed);
  if (!P) return null;
  const steps = Math.max(view.steps, P.anchors.length);
  const colors = sampleStops(P, steps).map(s => s.hex);
  const say = (hex: string) =>
    sentence(language.t(srgbName(hexBytes(hex).map(v => v / 255))), language.locale);
  return {
    name: name || seedName(seed, view.style, steps, language) || seed,
    address: `${origin.replace(/\/$/, "")}/${seed}${viewSearch({ style: view.style, steps, angle: view.angle })}`,
    colors,
    names: colors.map((hex, i) => `${i + 1} ${say(hex)}`),
    banded: isSwatchStyle(view.style)
  };
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
/** A swatch's name, the same in every format. */
const swatchLabel = (p: SwatchPalette, i: number) => oneLine(p.names?.[i] ?? "") || String(i + 1);

/* both Adobe formats are big-endian */
function writer() {
  let buf = new Uint8Array(4096);
  let view = new DataView(buf.buffer);
  let at = 0;
  const room = (n: number) => {
    if (at + n <= buf.length) return;
    const next = new Uint8Array(Math.max(buf.length * 2, at + n));
    next.set(buf);
    buf = next;
    view = new DataView(buf.buffer);
  };
  const put = (n: number, write: () => void) => {
    room(n);
    write();
    at += n;
  };
  return {
    at: () => at,
    u16: (v: number) => put(2, () => view.setUint16(at, v)),
    u32: (v: number) => put(4, () => view.setUint32(at, v)),
    i32: (v: number) => put(4, () => view.setInt32(at, v)),
    f32: (v: number) => put(4, () => view.setFloat32(at, v)),
    f64: (v: number) => put(8, () => view.setFloat64(at, v)),
    ascii: (s: string) =>
      put(s.length, () => {
        for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
      }),
    /* UTF-16 code units as JavaScript holds them, so a surrogate pair stays a pair */
    utf16: (s: string) =>
      put(2 * s.length, () => {
        for (let i = 0; i < s.length; i++) view.setUint16(at + 2 * i, s.charCodeAt(i));
      }),
    patch32: (pos: number, v: number) => view.setUint32(pos, v),
    done: () => buf.slice(0, at)
  };
}

/** Adobe Swatch Exchange: a group named for each palette, an RGB color per swatch under its name. */
export function aseFile(palettes: readonly SwatchPalette[]): Uint8Array<ArrayBuffer> {
  const w = writer();
  w.ascii("ASEF");
  w.u16(1);
  w.u16(0);
  w.u32(palettes.reduce((n, p) => n + p.colors.length + 2, 0));
  const name = (s: string) => {
    w.u16(s.length + 1);
    w.utf16(s);
    w.u16(0);
  };
  /* every block states its length */
  const block = (type: number, body: () => void) => {
    w.u16(type);
    const start = w.at();
    w.u32(0);
    body();
    w.patch32(start, w.at() - start - 4);
  };
  for (const p of palettes) {
    block(0xc001, () => name(oneLine(p.name)));
    for (const [i, hex] of p.colors.entries()) {
      block(0x0001, () => {
        name(swatchLabel(p, i));
        w.ascii("RGB ");
        for (const v of hexBytes(hex)) w.f32(v / 255);
        /* a normal (process) color, as a swatch made in Illustrator is */
        w.u16(2);
      });
    }
    block(0xc002, () => {});
  }
  return w.done();
}

/** A GIMP palette: the channels in three columns and each swatch's name, a comment with each palette's address
    before its colors. Krita lists a palette only when the file has its Name line. */
export function gplText(palettes: readonly SwatchPalette[], name: string): string {
  const columns = Math.min(256, Math.max(1, ...palettes.map(p => p.colors.length)));
  const lines = ["GIMP Palette", `Name: ${oneLine(name)}`, `Columns: ${columns}`];
  for (const p of palettes) {
    lines.push(`# ${p.address}`);
    p.colors.forEach((hex, i) => {
      lines.push(
        `${hexBytes(hex)
          .map(v => String(v).padStart(3))
          .join(" ")}\t${swatchLabel(p, i)}`
      );
    });
  }
  return `${lines.join("\n")}\n`;
}

/** A gradient's stops as Photoshop places them, 0 to 4096: blended colors evenly along it, banded colors at both edges
    of each band, so two stops meet at each edge and the change there is hard. */
function gradientStops(p: SwatchPalette): [string, number][] {
  const n = p.colors.length;
  const at = (x: number) => Math.round(x * 4096);
  if (n === 1) {
    return [
      [p.colors[0], 0],
      [p.colors[0], 4096]
    ];
  }
  if (!p.banded) return p.colors.map((hex, i) => [hex, at(i / (n - 1))]);
  return p.colors.flatMap((hex, i): [string, number][] => [
    [hex, at(i / n)],
    [hex, at((i + 1) / n)]
  ]);
}

/** Photoshop gradients (.grd, version 5): one gradient per palette, named for it, stops at its colors. Smoothness is
    0, so Photoshop blends between stops in a straight line as the CSS and the SVG do. The layout is Photoshop's action
    descriptor, read from a file Photoshop wrote. */
export function grdFile(palettes: readonly SwatchPalette[]): Uint8Array<ArrayBuffer> {
  const w = writer();
  const text = (s: string) => {
    w.u32(s.length + 1);
    w.utf16(s);
    w.u16(0);
  };
  /* a key or class of four characters is written after a length of 0 */
  const id = (s: string) => {
    w.u32(0);
    w.ascii(s);
  };
  const object = (cls: string, count: number, name = "") => {
    text(name);
    id(cls);
    w.u32(count);
  };
  const key = (k: string, type: string) => {
    id(k);
    w.ascii(type);
  };
  const long = (k: string, v: number) => {
    key(k, "long");
    w.i32(v);
  };
  const double = (k: string, v: number) => {
    key(k, "doub");
    w.f64(v);
  };
  const choice = (k: string, type: string, value: string) => {
    key(k, "enum");
    id(type);
    id(value);
  };
  w.ascii("8BGR");
  w.u16(5);
  w.u32(16);
  object("null", 1);
  key("GrdL", "VlLs");
  w.u32(palettes.length);
  for (const p of palettes) {
    const stops = gradientStops(p);
    w.ascii("Objc");
    object("Grdn", 1, "Gradient");
    key("Grad", "Objc");
    object("Grdn", 5, "Gradient");
    key("Nm  ", "TEXT");
    text(oneLine(p.name));
    choice("GrdF", "GrdF", "CstS");
    double("Intr", 0);
    key("Clrs", "VlLs");
    w.u32(stops.length);
    for (const [hex, at] of stops) {
      w.ascii("Objc");
      object("Clrt", 4);
      key("Clr ", "Objc");
      object("RGBC", 3);
      const [r, g, b] = hexBytes(hex);
      double("Rd  ", r);
      double("Grn ", g);
      double("Bl  ", b);
      choice("Type", "Clry", "UsrS");
      long("Lctn", at);
      long("Mdpn", 50);
    }
    key("Trns", "VlLs");
    w.u32(2);
    for (const at of [0, 4096]) {
      w.ascii("Objc");
      object("TrnS", 3);
      key("Opct", "UntF");
      w.ascii("#Prc");
      w.f64(100);
      long("Lctn", at);
      long("Mdpn", 50);
    }
  }
  return w.done();
}

/** Design tokens (DTCG 2025.10): a group per palette, a color token per swatch under its name, the palette's address
    the group's description. A name the format forbids (`.`, `{`, `}`, a leading `$`) is mended, and a second of one
    name in a group is numbered. */
export function tokensJson(palettes: readonly SwatchPalette[]): string {
  const keys = (fallback: string) => {
    const used = new Set<string>();
    return (raw: string) => {
      const name = oneLine(raw.replace(/[.{}]/g, " ")).replace(/^\$+/, "") || fallback;
      let key = name;
      for (let n = 2; used.has(key); n++) key = `${name} ${n}`;
      used.add(key);
      return key;
    };
  };
  const group = keys("Palette");
  const component = (v: number) => String(+(v / 255).toFixed(4));
  const groups = palettes.map(p => {
    const token = keys("Color");
    const tokens = p.colors.map(
      (hex, i) =>
        `    ${JSON.stringify(token(swatchLabel(p, i)))}: { "$type": "color", "$value": { "colorSpace": "srgb", "components": [${hexBytes(hex).map(component).join(", ")}], "hex": "${hex}" } }`
    );
    return `  ${JSON.stringify(group(p.name))}: {\n    "$description": ${JSON.stringify(p.address)},\n${tokens.join(",\n")}\n  }`;
  });
  return `{\n${groups.join(",\n")}\n}\n`;
}

/** A format's file, bytes or text. `name` names a GIMP palette of several palettes. */
export function swatchFile(
  format: SwatchFormat,
  palettes: readonly SwatchPalette[],
  name = palettes[0]?.name ?? ""
): Uint8Array<ArrayBuffer> | string {
  if (format === "ase") return aseFile(palettes);
  if (format === "grd") return grdFile(palettes);
  return format === "gpl" ? gplText(palettes, name) : tokensJson(palettes);
}

/** A file's name: the palette's own (design apps show it for what they import) and the format's ending. What a file
    name may not hold becomes a space. */
export const swatchName = (name: string, format: SwatchFormat) =>
  `${
    name
      .replace(/[\\/:*?"<>|\p{Cc}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/, "")
      .slice(0, 120) || "Palette"
  }.${SWATCH_FILES[format].extension}`;
