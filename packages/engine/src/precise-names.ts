/* The precise names swatch files give colors: meodai's color-name-list (MIT, see NOTICE), whose name nearest in OKLab
   names a color. The app's build writes the list as text: every color's six hex digits on the first line, then the
   names one per line in the colors' order. The broad names (colorname.ts) name colors everywhere else. */
import { linOklab, toLinear } from "./color.ts";

/** A color's precise name, from its #rrggbb. */
export type Namer = (hex: string) => string;

/** The list as the build writes it. Sorted by color, the hex digits compress to a fraction of their size. */
export function colorNamesText(colors: readonly { name: string; hex: string }[]): string {
  for (const c of colors) {
    if (!/^#[0-9a-f]{6}$/i.test(c.hex) || !c.name.trim() || c.name.includes("\n")) {
      throw new Error(`A color name can't be listed: ${JSON.stringify(c)}`);
    }
  }
  const sorted = [...colors].sort((p, q) => p.hex.toLowerCase().localeCompare(q.hex.toLowerCase()));
  return `${sorted.map(c => c.hex.slice(1).toLowerCase()).join("")}\n${sorted.map(c => c.name).join("\n")}`;
}

/* a byte's linear value, read once: tens of thousands of colors are converted when the list is read */
let linear: Float64Array | null = null;
function oklabOf(v: number) {
  linear ??= Float64Array.from({ length: 256 }, (_, i) => toLinear(i / 255));
  return linOklab(linear[v >> 16]!, linear[(v >> 8) & 255]!, linear[v & 255]!);
}

const STEPS = 2 ** 20;
const SLOTS = 2 ** 16;

/** Names colors from the list's text: each by the listed color nearest it in OKLab. */
export function preciseNamer(text: string): Namer {
  const cut = text.indexOf("\n");
  const names = text.slice(cut + 1).split("\n");
  const n = names.length;
  if (cut !== n * 6) throw new Error("The color names don't match their colors.");
  if (n >= SLOTS) throw new Error("The color names are more than the list can order.");
  const labs = names.map((_, i) => oklabOf(parseInt(text.slice(6 * i, 6 * i + 6), 16)));
  /* in order of lightness, so a search walks out from the color's own and stops once lightness alone is farther than
     the nearest it has found. Each color's lightness, to a millionth, and its place make one number, which a typed
     array sorts many times faster than a comparison can. */
  const keys = Float64Array.from(labs, ([L], i) => Math.round(L * STEPS) * SLOTS + i).sort();
  const order = Uint32Array.from(keys, key => key % SLOTS);
  const Ls = Float64Array.from(keys, key => Math.floor(key / SLOTS) / STEPS);
  const As = Float64Array.from(order, i => labs[i]![1]);
  const Bs = Float64Array.from(order, i => labs[i]![2]);
  return hex => {
    const [l, a, b] = oklabOf(parseInt(hex.slice(1, 7), 16));
    let up = 0;
    for (let hi = n; up < hi; ) {
      const mid = (up + hi) >> 1;
      if (Ls[mid]! < l) up = mid + 1;
      else hi = mid;
    }
    let down = up - 1;
    let nearest = Math.min(up, n - 1);
    let least = Number.POSITIVE_INFINITY;
    for (;;) {
      const above = up < n ? (Ls[up]! - l) ** 2 : Number.POSITIVE_INFINITY;
      const below = down >= 0 ? (Ls[down]! - l) ** 2 : Number.POSITIVE_INFINITY;
      if (Math.min(above, below) >= least) break;
      const i = above <= below ? up++ : down--;
      const d = (Ls[i]! - l) ** 2 + (As[i]! - a) ** 2 + (Bs[i]! - b) ** 2;
      if (d < least) {
        least = d;
        nearest = i;
      }
    }
    return names[order[nearest]!]!;
  };
}
