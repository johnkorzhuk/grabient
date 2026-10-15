/* What a palette is, read from the colors it draws: the names its title gives it, the kinds it is, and whether a
   written title's words hold for it. Everything here is a pure function of the seed and the view, so a card, a page,
   the Markdown, the JSON and the agents say the same thing of the same palette. Names are English messages, said in a
   reader's language where they are shown; a title is measured in English, so a seed has one name in every language. */
import { decodePalette } from "./codec.ts";
import { fitChroma, srgbToLch, srgbToOklab, type Triple } from "./color.ts";
import { colorFamily, srgbName } from "./colorname.ts";
import { COLOR_WORDS } from "./colornames.data.ts";
import { sampleLCH, sampleSrgb, sampleStops } from "./curve.ts";
import { onWheel } from "./math.ts";
import { ENGLISH, type Language, msg, sentence } from "./message.ts";
import type { Palette } from "./palette.ts";
import { isSwatchStyle, type Style, styleWords, type View } from "./view.ts";

export type Kind =
  | "dark to light"
  | "light to dark"
  | "light center"
  | "dark center"
  | "even lightness"
  | "neutral"
  | "muted"
  | "pastel"
  | "vivid"
  | "neon"
  | "dark"
  | "light"
  | "warm"
  | "cool"
  | "monochrome"
  | "rainbow"
  | "multicolor"
  | "seamless";
/** The data-visualization classes a palette's JSON carries. */
export type PaletteClass =
  | "achromatic"
  | "monochrome"
  | "sequential"
  | "diverging"
  | "isoluminant"
  | "cyclic"
  | "pastel"
  | "vivid";

/** A gradient read at 33 points, about 3% of its length apart. */
const SAMPLES = 33;
const curve = (P: Palette, n: number) =>
  Array.from({ length: n }, (_, i) => sampleSrgb(P, i / (n - 1)));

interface Sample {
  L: number;
  C: number;
  H: number;
  rel: number;
  name: string;
  family: string;
  lab: Triple;
}
/* the most chroma sRGB holds at each lightness and hue, on a grid of 0.02 by 5°: each cell measured the first time a
   color falls beside it, so a page's first name measures a few cells rather than the whole grid */
const GRID_L = 51;
const GRID_H = 72;
let gamut: Float32Array | null = null;
function gamutChroma(L: number, H: number): number {
  const g = (gamut ??= new Float32Array(GRID_L * GRID_H).fill(Number.NaN));
  const x = Math.min(GRID_L - 1, Math.max(0, L * (GRID_L - 1)));
  const y = onWheel(H) / 5;
  const i = Math.min(GRID_L - 2, Math.floor(x));
  const j = Math.floor(y) % GRID_H;
  const fx = x - i;
  const fy = y - Math.floor(y);
  const k = (j + 1) % GRID_H;
  const at = (a: number, b: number) => {
    const cell = a * GRID_H + b;
    if (Number.isNaN(g[cell])) g[cell] = fitChroma(a / (GRID_L - 1), 0.4, b * 5);
    return g[cell];
  };
  return (
    (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) +
    (at(i, k) * (1 - fx) + at(i + 1, k) * fx) * fy
  );
}
/** How much of the color its lightness and hue allow in sRGB: 1 at the gamut's edge. */
function relativeChroma(L: number, C: number, H: number): number {
  const top = gamutChroma(L, H);
  return top < 0.02 ? 0 : Math.min(1, C / top);
}
const read = (rgbs: readonly Triple[]): Sample[] =>
  rgbs.map(rgb => {
    const [L, C, H] = srgbToLch(rgb);
    const name = srgbName(rgb);
    return {
      L,
      C,
      H: onWheel(H),
      rel: relativeChroma(L, C, H),
      name,
      family: colorFamily(name),
      lab: srgbToOklab(rgb[0], rgb[1], rgb[2])
    };
  });
const share = (s: readonly Sample[], test: (x: Sample) => boolean) =>
  s.filter(test).length / s.length;
const quantile = (values: readonly number[], q: number) => {
  const v = [...values].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(q * v.length))];
};
/* warm and cool by hue, grays with a tint included: a warm gray is warm */
const warmHue = (x: Sample) => x.C >= 0.012 && (x.H >= 330 || x.H < 110);
const coolHue = (x: Sample) => x.C >= 0.012 && x.H >= 150 && x.H < 300;

interface Measures {
  s: Sample[];
  Lmed: number;
  Lmin: number;
  Lmax: number;
  C80: number;
  relMed: number;
  relMax: number;
  neutral: number;
  warm: number;
  cool: number;
  families: Map<string, number>;
  /** the hue's path along the colorful part, in degrees: the way a cyclic palette goes round */
  sweep: number;
  monotone: boolean;
  rise: number;
  center: number;
}
function measure(s: Sample[]): Measures {
  const Ls = s.map(x => x.L);
  const rise = Ls[Ls.length - 1] - Ls[0];
  const monotone = Ls.every(
    (v, i) => i === 0 || (rise >= 0 ? v >= Ls[i - 1] - 0.012 : v <= Ls[i - 1] + 0.012)
  );
  const third = Math.floor(s.length / 3);
  const families = new Map<string, number>();
  for (const x of s) {
    if (x.family !== "neutral")
      families.set(x.family, (families.get(x.family) ?? 0) + 1 / s.length);
  }
  const hues = s.filter(x => x.C >= 0.04).map(x => x.H);
  let sweep = 0;
  for (let i = 1; i < hues.length; i++) {
    const d = hues[i] - hues[i - 1];
    sweep += d - 360 * Math.round(d / 360);
  }
  return {
    s,
    Lmed: quantile(Ls, 0.5),
    Lmin: Math.min(...Ls),
    Lmax: Math.max(...Ls),
    C80: quantile(
      s.map(x => x.C),
      0.8
    ),
    relMed: quantile(
      s.map(x => x.rel),
      0.5
    ),
    relMax: Math.max(...s.map(x => x.rel)),
    neutral: share(s, x => x.family === "neutral" || x.rel < 0.12),
    warm: share(s, warmHue),
    cool: share(s, coolHue),
    families,
    sweep,
    monotone,
    rise,
    center: quantile(Ls.slice(third, s.length - third), 0.5) - (Ls[0] + Ls[Ls.length - 1]) / 2
  };
}

/** The hue wheel under the colorful part of the curve: the degrees it passes over, the least of its thirds in samples
    (warm colors, greens, blues), how many hue families show, how many samples have a hue to read and the share the
    largest family holds of them. */
interface Wheel {
  covered: number;
  third: number;
  hues: number;
  colored: number;
  lead: number;
}
const THIRDS: Readonly<Record<string, number>> = { green: 1, teal: 1, blue: 2, purple: 2 };
function wheelOf(P: Palette, s: readonly Sample[]): Wheel {
  const n = s.length;
  const bins = new Uint8Array(72);
  const colorful = s.map(x => x.family !== "neutral" && x.C >= 0.04);
  /* the curve's own hue keeps its laps: two drawn hues cannot say which way round lies between them */
  const hue = s.map((_, i) => sampleLCH(P, i / (n - 1))[2]);
  const thirds = [0, 0, 0];
  const held = new Map<string, number>();
  let colored = 0;
  for (let i = 0; i < n; i++) {
    if (!colorful[i]) continue;
    const to = i + 1 < n && colorful[i + 1] ? hue[i + 1] : hue[i];
    for (
      let h = Math.floor(Math.min(hue[i], to) / 5);
      h <= Math.floor(Math.max(hue[i], to) / 5);
      h++
    ) {
      bins[((h % 72) + 72) % 72] = 1;
    }
    thirds[THIRDS[s[i].family] ?? 0]++;
    colored++;
    held.set(s[i].family, (held.get(s[i].family) ?? 0) + 1);
  }
  return {
    covered: bins.reduce((a, b) => a + b, 0) * 5,
    third: Math.min(...thirds),
    hues: [...held.values()].filter(c => c >= 2).length,
    colored,
    lead: colored ? Math.max(...held.values()) / colored : 0
  };
}

function kindsOf(m: Measures, wheel: Wheel, loops: boolean, neon: number): Kind[] {
  const kinds: Kind[] = [];
  const range = m.Lmax - m.Lmin;
  const real = [...m.families.values()];
  if (m.monotone && Math.abs(m.rise) >= 0.3)
    kinds.push(m.rise > 0 ? "dark to light" : "light to dark");
  else if (range >= 0.3 && Math.abs(m.center) >= 0.15)
    kinds.push(m.center > 0 ? "light center" : "dark center");
  else if (range < 0.12) kinds.push("even lightness");
  if (m.neutral >= 0.6) kinds.push("neutral");
  else if (m.Lmed >= 0.72 && m.C80 <= 0.15) kinds.push("pastel");
  else if (m.relMed >= 0.7) kinds.push("vivid");
  else if (m.relMed <= 0.45) kinds.push("muted");
  if (neon >= 0.4) kinds.push("neon");
  if (m.Lmed <= 0.38) kinds.push("dark");
  else if (m.Lmed >= 0.8) kinds.push("light");
  if (m.warm >= 0.7) kinds.push("warm");
  else if (m.cool >= 0.7) kinds.push("cool");
  /* three quarters of the wheel, warm colors, greens and blues on three samples each: blue to green the cool way round
     is no rainbow */
  if (wheel.covered >= 270 && wheel.third >= 3 && wheel.hues >= 5) kinds.push("rainbow");
  else if (real.filter(w => w >= 0.1).length >= 4) kinds.push("multicolor");
  else if (
    m.neutral < 0.6 &&
    Math.max(0, ...real) >= 0.9 * (1 - share(m.s, x => x.family === "neutral")) &&
    Math.abs(m.sweep) < 40
  ) {
    kinds.push("monochrome");
  }
  if (loops) kinds.push("seamless");
  return kinds;
}
function classesOf(m: Measures, kinds: readonly Kind[]): PaletteClass[] {
  const out: PaletteClass[] = [];
  const range = m.Lmax - m.Lmin;
  const first = m.s[0];
  const last = m.s[m.s.length - 1];
  if (m.s.every(x => x.C < 0.03)) out.push("achromatic");
  if (kinds.includes("monochrome")) out.push("monochrome");
  if (m.monotone && range >= 0.25) out.push("sequential");
  if (!m.monotone && range >= 0.25 && Math.abs(m.center) >= 0.15) out.push("diverging");
  if (range < 0.08 && Math.abs(m.sweep) >= 60) out.push("isoluminant");
  if (
    Math.abs(m.sweep) >= 300 &&
    Math.abs(first.L - last.L) < 0.06 &&
    Math.abs(((first.H - last.H + 540) % 360) - 180) < 30
  ) {
    out.push("cyclic");
  }
  if (kinds.includes("pastel")) out.push("pastel");
  if (kinds.includes("vivid")) out.push("vivid");
  return out;
}

/* A title reads a palette as a path: where it starts and ends, the hues it stays in, and the colors it turns through.
   "Blue to brown" promises the straight blend, which passes through gray; a palette that goes round by green has left
   that blend, and the title says green. Distances are in OKLab. */
const dist = (p: Triple, q: Triple) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const mix = (p: Triple, q: Triple, f: number): Triple => [
  p[0] + (q[0] - p[0]) * f,
  p[1] + (q[1] - p[1]) * f,
  p[2] + (q[2] - p[2]) * f
];
/** How far a color lies from the segment between two others. */
function fromLine(p: Triple, a: Triple, b: Triple): number {
  const ab: Triple = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const along = len
    ? Math.min(
        1,
        Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / len)
      )
    : 0;
  return dist(p, mix(a, b, along));
}
/** The name most of a list says, the earliest among equals. */
function commonest(list: readonly string[]): string {
  const count = new Map<string, number>();
  for (const x of list) count.set(x, (count.get(x) ?? 0) + 1);
  let best = list[0];
  let top = 0;
  for (const [x, c] of count) {
    if (c > top) {
      top = c;
      best = x;
    }
  }
  return best;
}
const middle = (where: readonly number[]) => where[where.length >> 1];
/* a name's hue is its family, and black, gray and white are three colors to a reader */
const hueOf = (x: Sample) =>
  x.family !== "neutral" ? x.family : x.L <= 0.3 ? "black" : x.L >= 0.9 ? "white" : "gray";
const chromatic = (x: Sample) => x.family !== "neutral";
/** A turn is named when it lies this far from the blend it leaves; between two near colors 40% of their distance is
    enough, down to a floor, since a pastel's hues lie close and are still its point. */
const TURN = 0.1;
const FAINT = 0.05;
const PART = 0.4;
/** A hue that holds a quarter of a gradient is named, and four names are the most a title lists. */
const STAY = 0.25;
const MOST = 4;

interface Item {
  name: string;
  i: number;
  hue: string;
  rank: 1 | 2 | 3;
  weight: number;
}
/** An end's name: its own color's, unless that lasts under three samples and is of another family than what follows,
    which is then the end a reader sees. Every band of a swatch style is its own. */
function endOf(S: readonly Sample[], last: boolean, swatch: boolean): { name: string; i: number } {
  const n = S.length;
  const at = (k: number) => (last ? n - 1 - k : k);
  const run = (k: number) => {
    let m = 1;
    while (k + m < n && S[at(k + m)].family === S[at(k)].family) m++;
    return m;
  };
  if (swatch || run(0) >= 3) return { name: S[at(0)].name, i: at(0) };
  for (let k = run(0); k <= 2; k += run(k)) {
    const m = run(k);
    if (m < 3) continue;
    /* inside that color, the first name that lasts */
    for (let j = k; j < k + m - 1; j++) {
      if (S[at(j)].name === S[at(j + 1)].name) return { name: S[at(j)].name, i: at(j) };
    }
    return { name: S[at(k)].name, i: at(k) };
  }
  return { name: S[at(0)].name, i: at(0) };
}
/** The colors a title may name, in the order they show: its two ends (rank 3), the hues it stays in (2) and the colors
    it turns through (1), each with its weight among its rank. */
function pathOf(S: readonly Sample[], swatch: boolean, loops: boolean) {
  const n = S.length;
  const hues = S.map(hueOf);
  const a = endOf(S, false, swatch);
  const z = endOf(S, true, swatch);
  /* a palette that loops ends on the color it began with, whatever the two are called */
  const b = loops ? { name: a.name, i: z.i } : z;
  const returns = a.name === b.name;
  let list: Item[] = [
    { ...a, hue: hues[a.i], rank: 3, weight: 1 },
    { ...b, hue: hues[b.i], rank: 3, weight: 1 }
  ];
  const ends = [list[0].hue, list[1].hue];
  const held = new Map<string, number>();
  for (const hue of hues) held.set(hue, (held.get(hue) ?? 0) + 1 / n);
  for (const [hue, w] of held) {
    if (w < (swatch ? 0.2 : STAY)) continue;
    let longest: number[] = [];
    let run: number[] = [];
    hues.forEach((h, i) => {
      if (h !== hue) run = [];
      else {
        run.push(i);
        if (run.length > longest.length) longest = run;
      }
    });
    const mid = middle(longest);
    const name = commonest(S.filter((_, i) => hues[i] === hue).map(x => x.name));
    if (mid <= a.i || mid >= b.i) continue;
    /* an end's own hue is said by the end, unless the palette comes back to its start and this is the other color it
       holds */
    if (ends.includes(hue) && !(returns && name !== a.name && dist(S[mid].lab, S[a.i].lab) >= TURN))
      continue;
    list.push({ name, i: mid, hue, rank: 2, weight: w });
  }
  while (list.length > MOST) {
    const lightest = list.filter(x => x.rank === 2).sort((x, y) => x.weight - y.weight)[0];
    list.splice(list.indexOf(lightest), 1);
  }
  list.sort((x, y) => x.i - y.i);
  /* turns, the widest first: where the palette lies farthest from the blend between the points already found */
  let knots = [0, n - 1];
  for (let guard = 0; guard < 8; guard++) {
    let at = -1;
    let far = 0;
    for (let w = 0; w + 1 < knots.length; w++) {
      const j = knots[w];
      const k = knots[w + 1];
      for (let i = j + 1; i < k; i++) {
        const d = dist(S[i].lab, mix(S[j].lab, S[k].lab, (i - j) / (k - j)));
        if (d > far) {
          far = d;
          at = i;
        }
      }
    }
    if (at < 0 || far < FAINT) break;
    knots = [...knots, at].sort((x, y) => x - y);
    const k = list.findIndex(x => x.i > at);
    if (k <= 0) continue;
    if (new Set(list.map(x => x.name)).size >= MOST) break;
    /* a turn is named when it shows a hue the names either side of it do not, by the commonest name of that hue
       between them */
    const A = list[k - 1];
    const B = list[k];
    const from = Math.ceil((A.i + at) / 2);
    const to = Math.floor((at + B.i) / 2);
    const count = new Map<string, number>();
    for (let i = from; i <= to; i++) {
      if (hues[i] !== A.hue && hues[i] !== B.hue) count.set(hues[i], (count.get(hues[i]) ?? 0) + 1);
    }
    let hue: string | null = null;
    let top = swatch ? 0 : 1;
    for (const [h, c] of count) {
      if (c > top || (c === top && h === hues[at])) {
        top = c;
        hue = h;
      }
    }
    /* a turn of a neighbor's own hue is named when it leaves the line between them: the bright blue between navy and
       lavender */
    const same = !hue && fromLine(S[at].lab, S[A.i].lab, S[B.i].lab) >= TURN;
    if (same) hue = hues[at];
    if (!hue) continue;
    const where: number[] = [];
    for (let i = from; i <= to; i++) {
      if (hues[i] === hue && (!same || (S[i].name !== A.name && S[i].name !== B.name)))
        where.push(i);
    }
    if (!where.length) continue;
    const pos = middle(where);
    /* in the dark a hue hardly shows, and only the wide swing counts */
    const needed =
      S[pos].L < 0.3 ? TURN : Math.min(TURN, Math.max(FAINT, PART * dist(S[A.i].lab, S[B.i].lab)));
    if (!same && dist(S[pos].lab, mix(S[A.i].lab, S[B.i].lab, (pos - A.i) / (B.i - A.i))) < needed)
      continue;
    const name = commonest(where.map(i => S[i].name));
    const had = list.find(x => x.name === name);
    /* a color the palette comes back to is said once, where it first shows */
    if (had) {
      if (had.i > pos) {
        had.i = pos;
        list.sort((x, y) => x.i - y.i);
      }
      continue;
    }
    list.push({ name, i: pos, hue, rank: 1, weight: far });
    list.sort((x, y) => x.i - y.i);
  }
  list = list.filter((x, k) => list.findIndex(y => y.name === x.name) === k);
  return { list, first: a.name, last: b.name };
}

/* A search result's title link is cut at about 580px of Arial at 20px, so a name is held to what that leaves after its
   style's words and the site's name (the page title is "{name} {style words} | Grabient"). Arial's advance widths per
   1000 units, a to z and A to Z. */
const LOWER = [
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
  278, 556, 500, 722, 500, 500, 500
];
const UPPER = [
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611
];
function linkWidth(text: string): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    w +=
      c >= 97 && c <= 122
        ? LOWER[c - 97]
        : c >= 65 && c <= 90
          ? UPPER[c - 65]
          : c === 45
            ? 333
            : c === 124
              ? 260
              : 278;
  }
  return w / 50;
}
const LINK = 580;
const room = (style: Style) => LINK - linkWidth(` ${styleWords(style)} | Grabient`);
/** A list of names as English says it, to measure. */
const say = (names: readonly string[], ends: boolean) =>
  names.length < 2
    ? names[0]
    : names.length === 2
      ? `${names[0]} ${ends ? "to" : "and"} ${names[1]}`
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/* the words a tone would repeat: "dark navy" says nothing "navy" does not */
const SAYS = {
  pastel: /white|cream/,
  dark: /dark|navy|black|midnight|maroon|eggplant/,
  muted: /gray|black|white|beige|taupe|tan|brown|off-white|khaki|sand|mauve|olive/
};
/** What a pastel title says of a light name: "Pastel blue and pink", never "Pastel light blue and pink". */
const PALER: Readonly<Record<string, string>> = {
  "light blue": msg("blue"),
  "light pink": msg("pink"),
  "light green": msg("green"),
  "pale yellow": msg("yellow")
};
/* the words a title says before its colors, in the order English says them: that it loops, its tone, how its hues
   relate */
const SAID = [
  "seamless",
  "pastel",
  "neon",
  "dark",
  "muted",
  "vivid",
  "warm",
  "cool",
  "monochrome",
  "analogous",
  "complementary",
  "triadic",
  "duotone",
  "tritone"
] as const;
/** A word a title says before its colors. */
export type Word = (typeof SAID)[number];
/* the order the words are given room in: the rarest first, by how few of the gallery's palettes each holds for */
const RAREST: readonly Word[] = [
  "seamless",
  "triadic",
  "dark",
  "muted",
  "neon",
  "tritone",
  "complementary",
  "pastel",
  "duotone",
  "monochrome",
  "vivid",
  "analogous",
  "warm",
  "cool"
];
const SCHEMES: readonly Word[] = [
  "monochrome",
  "analogous",
  "complementary",
  "triadic",
  "duotone",
  "tritone"
];
const apart = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};
/* hue families by angle, for words about how many hues a palette has: a muted palette people call gray keeps its
   hues. Seven families: the last band, 330 to 360, is the red of the first. */
const HUE_BANDS = [40, 75, 110, 165, 215, 275, 330, 360];
function hueFamilies(s: readonly Sample[]): number[] {
  const counts = new Array(7).fill(0);
  for (const x of s) if (x.C >= 0.015) counts[HUE_BANDS.findIndex(top => x.H < top) % 7]++;
  return counts.map(n => n / s.length);
}
/* muted: little color for its lightness, or little color at all (a pale wash near white) */
const quiet = (m: Measures) => m.relMed <= 0.6 || m.C80 <= 0.07;

export interface PaletteReading {
  /** the drawn colors' names, in order */
  names: string[];
  /** what the title names: one to four colors in the order they show, or a rainbow's two ends (none where it ends as
      it began) */
  colors: string[];
  /** its colors run round the wheel, and the title says rainbow in place of a list */
  rainbow: boolean;
  /** the two names are its ends, "navy to lavender"; false for two of its colors, "blue and pink" */
  ends: boolean;
  /** the words said before the colors, in the order they are said; two at most */
  words: Word[];
  kinds: Kind[];
  classes: PaletteClass[];
}

/** A palette as its colors say it in a style. Kinds and classes read the curve, which the style does not change;
    swatch styles name their bands at `steps`. */
export function readPalette(
  P: Palette,
  style: Style = "linearGradient",
  steps = 7
): PaletteReading {
  const swatch = isSwatchStyle(style);
  const along = read(curve(P, SAMPLES));
  const m = measure(along);
  const wheel = wheelOf(P, along);
  let length = 0;
  for (let i = 1; i < SAMPLES; i++) length += dist(along[i].lab, along[i - 1].lab);
  /* its two ends match and something happens between them: it loops with no seam */
  const loops = dist(along[0].lab, along[SAMPLES - 1].lab) <= 0.03 && length >= 0.2;
  const neon = share(along, x => x.rel >= 0.9 && x.C >= 0.17 && x.L >= 0.6);
  const kinds = kindsOf(m, wheel, loops, neon);
  const classes = classesOf(m, kinds);
  const rainbow = kinds.includes("rainbow");
  const S = swatch ? read(sampleStops(P, Math.max(2, Math.round(steps))).map(s => s.rgb)) : along;
  const { list, first, last } = pathOf(S, swatch, loops);
  const returns = first === last;
  const width = room(style);
  const fits = (text: string) => linkWidth(text[0].toUpperCase() + text.slice(1)) <= width;
  const body = (items: readonly Item[], pale: boolean) => {
    const paler = (name: string) => (pale ? (PALER[name] ?? name) : name);
    /* two names that read the same once pale ("Pastel blue and blue") are one */
    const names = rainbow
      ? paler(first) === paler(last)
        ? []
        : [paler(first), paler(last)]
      : items.map(x => paler(x.name)).filter((name, i, all) => all.indexOf(name) === i);
    const text = rainbow
      ? names.length
        ? `rainbow from ${names[0]} to ${names[1]}`
        : "rainbow"
      : say(names, names.length === 2 && !returns && !swatch);
    return { names, text };
  };
  /* the colors first: while they alone pass the room, the weakest turn goes, and after the turns the smallest stay.
     Seamless outranks a fourth name */
  let items = list;
  while (
    !rainbow &&
    items.length > 2 &&
    !fits(`${loops ? "seamless " : ""}${body(items, false).text}`)
  ) {
    const rank = items.some(x => x.rank === 1) ? 1 : 2;
    const least = items.filter(x => x.rank === rank).sort((x, y) => x.weight - y.weight)[0];
    items = items.filter(x => x !== least);
  }

  /* a tone is said only where every named color bears it: no vivid beige */
  const named = rainbow ? [] : items.map(x => S[x.i]);
  const names = rainbow ? [] : items.map(x => x.name);
  const said = rainbow ? "rainbow" : names.join(" ");
  const all = (test: (x: Sample) => boolean) => named.every(test);
  const gray = (name: string) => colorFamily(name) === "neutral";
  const bright = (x: Sample) => x.rel >= 0.55 && x.C >= 0.09;
  const tone = ((): Word | null => {
    if (kinds.includes("pastel") && !SAYS.pastel.test(said) && all(x => x.L >= 0.65))
      return "pastel";
    if (kinds.includes("neon") && !names.some(gray) && all(bright)) return "neon";
    if (kinds.includes("dark") && !SAYS.dark.test(said) && all(x => x.L <= 0.55)) return "dark";
    if (
      m.relMed <= 0.45 &&
      wheel.colored >= SAMPLES * 0.4 &&
      !SAYS.muted.test(said) &&
      all(x => x.rel <= 0.7)
    ) {
      return "muted";
    }
    /* a rainbow is taken to be vivid; one well under that says so, by the title check's own reading of muted */
    if (rainbow) return m.relMed <= 0.6 && quiet(measure(read(curve(P, 65)))) ? "muted" : null;
    /* vivid never says a gray: "vivid white to teal" reads as nothing */
    if (kinds.includes("vivid") && !names.some(gray) && all(bright)) return "vivid";
    /* a palette of grays says which way they lean: a cool gray */
    if (names.every(name => gray(name) && name !== "black" && name !== "white")) {
      return kinds.includes("warm") ? "warm" : kinds.includes("cool") ? "cool" : null;
    }
    if (!named.every(chromatic)) return null;
    return named.every(x => x.H >= 330 || x.H < 110)
      ? "warm"
      : named.every(x => x.H >= 150 && x.H < 300)
        ? "cool"
        : null;
  })();
  /* A scheme is the relation between the hues the title names, said only where the colorful part keeps to those hues:
     a sweep through every hue between two names is no duotone. Too little color to read, and nothing is said. */
  const scheme = ((): Word | null => {
    const hues = named.filter(chromatic);
    const covered = wheel.covered;
    if (rainbow || wheel.colored < SAMPLES * 0.2 || !hues.length) return null;
    const plain = hues.length === named.length;
    /* the title check counts a gray's tint as a hue, and a computed title passes its own check */
    if (new Set(hues.map(x => x.family)).size === 1) {
      return covered <= 60 &&
        wheel.lead >= 0.85 &&
        hueFamilies(along).filter(w => w >= 0.15).length <= 2
        ? "monochrome"
        : null;
    }
    const sorted = hues.map(x => x.H).sort((x, y) => x - y);
    const gaps = sorted.map((h, i) => (sorted[(i + 1) % sorted.length] - h + 360) % 360 || 360);
    if (360 - Math.max(...gaps) <= 80) return covered <= 110 ? "analogous" : null;
    /* names within 40° of one another are one hue */
    const cuts = gaps.map((g, i) => (g > 40 ? i : -1)).filter(i => i >= 0);
    const centers = cuts.map((cut, k) => {
      const from = sorted[(cut + 1) % sorted.length];
      return (from + ((sorted[cuts[(k + 1) % cuts.length]] - from + 360) % 360) / 2) % 360;
    });
    if (cuts.length === 2) {
      if (apart(centers[0], centers[1]) >= 150) return covered <= 120 ? "complementary" : null;
      return plain && items.length === 2 && covered <= 150 ? "duotone" : null;
    }
    if (cuts.length !== 3 || covered > 220) return null;
    const seps = [
      apart(centers[0], centers[1]),
      apart(centers[1], centers[2]),
      apart(centers[0], centers[2])
    ];
    if (Math.min(...seps) >= 90 && Math.max(...seps) <= 160) return "triadic";
    return plain && items.length === 3 ? "tritone" : null;
  })();
  /* the rarest words first, two at most, each only while the title still fits its room */
  const held = [loops ? "seamless" : null, tone, scheme]
    .filter((w): w is Word => !!w)
    .sort((x, y) => RAREST.indexOf(x) - RAREST.indexOf(y));
  let words: Word[] = [];
  const titled = (list: readonly Word[]) =>
    [...SAID.filter(w => list.includes(w)), body(items, list.includes("pastel")).text].join(" ");
  for (const word of held) {
    /* warm and cool are said where no scheme is: beside monochrome or analogous the names have said it */
    if (
      (word === "warm" || word === "cool") &&
      named.some(chromatic) &&
      words.some(w => SCHEMES.includes(w))
    )
      continue;
    if (words.length < 2 && fits(titled([...words, word]))) words = [...words, word];
  }
  const colors = body(items, words.includes("pastel")).names;
  return {
    names: S.map(x => x.name),
    colors,
    rainbow,
    ends: !rainbow && colors.length === 2 && !returns && !swatch,
    words: SAID.filter(w => words.includes(w)),
    kinds,
    classes
  };
}

const WORDS: Readonly<Record<Word, string>> = {
  seamless: msg("seamless {colors}"),
  pastel: msg("pastel {colors}"),
  neon: msg("neon {colors}"),
  dark: msg("dark {colors}"),
  muted: msg("muted {colors}"),
  vivid: msg("vivid {colors}"),
  warm: msg("warm {colors}"),
  cool: msg("cool {colors}"),
  monochrome: msg("monochrome {colors}"),
  analogous: msg("analogous {colors}"),
  complementary: msg("complementary {colors}"),
  triadic: msg("triadic {colors}"),
  duotone: msg("duotone {colors}"),
  tritone: msg("tritone {colors}")
};
/** The colors as words inside a sentence: "navy, blue and lavender". */
function colorsPhrase(r: PaletteReading, { t }: Language): string {
  const [a, b, c, d] = r.colors.map(name => t(name));
  if (r.rainbow)
    return r.colors.length
      ? t(msg("rainbow from {start} to {end}"), { start: a, end: b })
      : t(msg("rainbow"));
  if (r.colors.length === 1) return a;
  if (r.colors.length === 2) {
    return r.ends
      ? t(msg("{start} to {end}"), { start: a, end: b })
      : t(msg("{first} and {second}"), { first: a, second: b });
  }
  if (r.colors.length === 3)
    return t(msg("{first}, {second} and {third}"), { first: a, second: b, third: c });
  return t(msg("{first}, {second}, {third} and {fourth}"), {
    first: a,
    second: b,
    third: c,
    fourth: d
  });
}
/** The palette's name inside a sentence: "vivid analogous navy, blue and lavender". Each word wraps what follows. */
export const readingPhrase = (r: PaletteReading, language: Language = ENGLISH): string =>
  r.words.reduceRight(
    (phrase, word) => language.t(WORDS[word], { colors: phrase }),
    colorsPhrase(r, language)
  );
/** The palette's name as a title starts: "Vivid analogous navy, blue and lavender". */
export const readingName = (r: PaletteReading, language: Language = ENGLISH): string =>
  sentence(readingPhrase(r, language), language.locale);

/* a list draws the same palettes again and again: each reading is kept, in English, first in first out */
const READINGS = new Map<string, PaletteReading | null>();
const KEEP = 4096;
/** A palette's reading by its seed, in a style; null for a seed that is no palette. */
export function seedReading(
  seed: string,
  style: Style = "linearGradient",
  steps = 7
): PaletteReading | null {
  const key = `${seed} ${style} ${isSwatchStyle(style) ? Math.round(steps) : 0}`;
  let reading = READINGS.get(key);
  if (reading === undefined) {
    const P = decodePalette(seed);
    reading = P ? readPalette(P, style, steps) : null;
    if (READINGS.size >= KEEP) READINGS.delete(READINGS.keys().next().value as string);
    READINGS.set(key, reading);
  }
  return reading;
}
/** A palette's name by its seed, in a style: what its card and page call it. Empty for a seed that is no palette. */
export function seedName(
  seed: string,
  style: Style = "linearGradient",
  steps = 7,
  language: Language = ENGLISH
): string {
  const reading = seedReading(seed, style, steps);
  return reading ? readingName(reading, language) : "";
}
/** The palette's title without the site's name: "Vivid navy, blue and lavender linear gradient". */
export const paletteTitle = (
  reading: PaletteReading,
  style: Style,
  language: Language = ENGLISH
): string =>
  language.t(msg("{name} {style}"), {
    name: readingName(reading, language),
    style: styleWords(style)
  });
/** What a search result shows under the title: the name, the style, and the colors as hex. */
export const paletteDescription = (
  reading: PaletteReading,
  view: Pick<View, "style" | "steps">,
  hexes: readonly string[],
  language: Language = ENGLISH
): string =>
  language.t(
    msg(
      "{name} {style} with {steps, plural, one {# color} other {# colors}}: {hexes}. Edit it and copy or download CSS, SVG, PNG or shader code."
    ),
    {
      name: readingName(reading, language),
      style: styleWords(view.style),
      steps: view.steps,
      hexes: hexes.join(", ")
    }
  );

/* A written title, checked against the colors the palette draws. A color word holds when part of the palette falls in
   the range its named colors cover (colornames.data.ts); a word about the whole palette holds when the palette is
   that. Words that name no color (tropical, surge) are the writer's own and always hold. The tables are Maps: they are
   read with words a writer chose, and only their own entries count. */
const grouped = <T>(groups: readonly (readonly [string, T])[]) =>
  new Map(groups.flatMap(([words, value]) => words.split(" ").map(word => [word, value] as const)));
const hues = (m: Measures, share: number) => hueFamilies(m.s).filter(w => w >= share).length;
const QUALITIES = grouped<(m: Measures) => boolean>([
  ["pastel", m => m.Lmed >= 0.68 && m.C80 <= 0.17],
  ["soft", m => !(m.relMed >= 0.7 && m.Lmax - m.Lmin >= 0.5)],
  ["muted dusty faded washed subdued desaturated smoky matte", quiet],
  ["vivid vibrant bold saturated intense", m => m.relMax >= 0.6],
  ["neon electric fluorescent", m => m.relMax >= 0.75],
  ["bright", m => m.relMax >= 0.6 || m.Lmax >= 0.85],
  ["dark", m => m.Lmin <= 0.45],
  ["deep", m => m.Lmin <= 0.5 || m.relMax >= 0.75],
  ["pale", m => m.Lmax >= 0.75],
  ["warm", m => m.warm >= 0.2],
  ["cool", m => m.cool >= 0.2],
  ["monochrome monochromatic", m => hues(m, 0.15) <= 2],
  ["rainbow spectrum", m => hues(m, 0.05) >= 4],
  ["multicolor", m => hues(m, 0.05) >= 3],
  ["neutral", m => share(m.s, x => x.C < 0.06) >= 0.3 || m.relMed <= 0.4]
]);
/* A shade before a color belongs to the color: a dusty blue is a blue that is dusty and need not make the whole
   palette dusty. A dark or pale shade loosens the color's own lightness, a grayer one its chroma. Warm and cool gray
   name a gray. Soft is always the whole palette's. */
type Shade = { test: (x: Sample) => boolean; loosen?: "darker" | "paler" | "grayer" };
const SHADES = grouped<Shade>([
  ["muted dusty faded washed smoky dusky", { test: x => x.rel <= 0.7, loosen: "grayer" }],
  ["pale light powder baby pastel", { test: x => x.L >= 0.65, loosen: "paler" }],
  ["deep", { test: x => x.L <= 0.6 || x.rel >= 0.7, loosen: "darker" }],
  ["dark", { test: x => x.L <= 0.55, loosen: "darker" }],
  ["bright vivid neon electric hot", { test: x => x.rel >= 0.55 }],
  ["warm cool", { test: () => true }]
]);
/* words that are a scene or a thing as often as a color: never checked themselves, so forest green is checked for its
   green */
const SCENES = new Set(
  "wisteria wheat forest sky snow mist fog smoke leaf pine spruce iris heather porcelain steel".split(
    " "
  )
);
const ALIASES = new Map([
  ["gray", "grey"],
  ["near-black", "black"],
  ["off-white", "white"],
  ["multicolored", "multicolor"],
  ["multicolour", "multicolor"],
  ["neutrals", "neutral"],
  ["pastels", "pastel"],
  ["colour", ""],
  ["color", ""]
]);
/** Each designer's color word and the colors it may name: lightness, chroma, and for a colorful word its hues. */
const RANGES = new Map(Object.entries(COLOR_WORDS));
function within(x: Sample, range: readonly number[]): boolean {
  const [L0, L1, C0, C1, h0, h1] = range;
  if (x.L < L0 || x.L > L1 || x.C < C0 || x.C > C1) return false;
  /* a colorful word needs a color with a hue (no gray is blue); a pale word (champagne, cream) names a whisper of one */
  if (range.length < 6) return true;
  return x.C >= (C0 < 0.01 ? 0.006 : 0.015) && (x.H - h0 + 360) % 360 <= (h1 - h0 + 360) % 360;
}

/** The words of a written title or description that the palette's colors contradict, in the order they appear. */
export function titleFaults(text: string, P: Palette): string[] {
  const s = read(curve(P, 65));
  const m = measure(s);
  const faults: string[] = [];
  /* a word also holds where people would call part of the palette by it, inside a longer name too (the green of dark
     green), so a palette's own computed title always holds */
  const said = new Set(s.map(x => x.name));
  const namedAs = (phrase: string) => {
    const word = phrase.replace(/\bgrey\b/g, "gray");
    return [...said].some(
      name =>
        name === word || name.endsWith(` ${word}`) || (word === "white" && name === "off-white")
    );
  };
  const colorKey = (word: string | undefined): string | null => {
    if (!word) return null;
    const key = ALIASES.get(word) ?? word;
    if (RANGES.has(key)) return key;
    return word.endsWith("s") && RANGES.has(word.slice(0, -1)) ? word.slice(0, -1) : null;
  };
  const rangeOf = (key: string) => RANGES.get(key) as readonly number[];
  const present = (key: string, also: (x: Sample) => boolean = () => true, range = rangeOf(key)) =>
    s.filter(x => within(x, range) && also(x)).length >= 2;
  const colorHolds = (key: string) => present(key) || namedAs(key);
  const holds = (word: string): boolean | null => {
    const quality = ALIASES.get(word) ?? word;
    if (!quality) return null;
    const test = QUALITIES.get(quality);
    if (test) return test(m);
    const key = colorKey(word);
    return key ? colorHolds(key) : null;
  };
  const fault = (word: string) => {
    if (!faults.includes(word)) faults.push(word);
  };
  const lower = text.toLowerCase().normalize("NFKD");
  const found = [...lower.matchAll(/[a-z]+(?:-[a-z]+)*/g)];
  const tokens = found.map(match => match[0]);
  /* two words make one color only when nothing but a space stands between them: "near-black, gray" is two colors */
  const joined = (i: number) =>
    i + 1 < found.length &&
    /^ +$/.test(lower.slice(found[i].index + tokens[i].length, found[i + 1].index));
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const next = joined(i) ? colorKey(tokens[i + 1]) : null;
    const pair = `${raw} ${tokens[i + 1]}`;
    if (SCENES.has(raw) || SCENES.has(raw.replace(/s$/, ""))) {
      /* sky blue, forest green, snow white: the scene says which shade, loosely, and the color is checked */
      if (next) {
        const [, , C0, C1, ...hue] = rangeOf(next);
        if (
          !present(next, () => true, [0.06, 1, Math.min(C0, 0.012), C1, ...hue]) &&
          !colorHolds(next)
        )
          fault(pair);
        i++;
      }
      continue;
    }
    if (raw === "rose" && tokens[i + 1] === "gold" && joined(i)) {
      if (!present("rose gold")) fault("rose gold");
      i++;
      continue;
    }
    /* blue gray is a gray with a little blue in it */
    const own = colorKey(raw);
    if (
      own &&
      rangeOf(own).length === 6 &&
      joined(i) &&
      (tokens[i + 1] === "gray" || tokens[i + 1] === "grey")
    ) {
      const [L0, L1, , C1, ...hue] = rangeOf(own);
      const grayed = present(own, () => true, [L0, L1, 0.004, C1, ...hue]) && present("grey");
      if (!grayed && !namedAs(pair) && !namedAs(`gray ${own}`)) fault(pair);
      i++;
      continue;
    }
    const shade = SHADES.get(raw);
    if (shade && next) {
      /* deep cyan is darker than most cyans, pale blue barely blue; a shade that is the whole palette's holds too: a
         vivid palette is a vivid navy, blue and lavender */
      const [L0, L1, C0, C1, ...hue] = rangeOf(next);
      const range =
        shade.loosen === "darker"
          ? [0.06, L1, C0, C1, ...hue]
          : shade.loosen === "paler"
            ? [L0, 1, Math.min(C0, 0.006), C1, ...hue]
            : shade.loosen === "grayer"
              ? [L0, L1, Math.min(C0, 0.012), C1, ...hue]
              : rangeOf(next);
      if (
        !present(next, shade.test, range) &&
        !namedAs(pair) &&
        !(QUALITIES.get(raw)?.(m) && colorHolds(next))
      ) {
        fault(pair);
      }
      i++;
      continue;
    }
    let verdict = holds(raw);
    /* a joined word the table lacks is read part by part: blue-green */
    if (verdict === null && raw.includes("-")) {
      const parts = raw
        .split("-")
        .map(holds)
        .filter(v => v !== null);
      verdict = parts.length ? parts.every(Boolean) : null;
    }
    if (verdict === false) fault(raw);
  }
  return faults;
}
