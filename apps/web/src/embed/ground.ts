/* An effect's ground written in other words than hex (bg=navy, bg=rgb(0 0 0 / 50%)), the blob's or the strings', read
   by the browser into the hex the
   server answers it at: its redirect (server/pipeline.ts) reads the words with engine/css-color.ts cssColorText, and
   the browser follows it for the stylesheet and the script alike while the script's own address keeps the words. The
   color is mixed into sRGB, which Chromium, Firefox and WebKit all compute as `color(srgb r g b / a)`, then clipped
   into it and rounded to bytes as the server's cssColorHex does; for every color tried (named, hex with its alpha,
   rgb(), hsl(), hwb(), lab(), oklch(), color() in sRGB and Display P3, inside sRGB and out) the three give the
   server's hex. Words that are no color, a clear one (but for the strings, whose none is their designed ground: a
   clear one is `#00000000`, engine/effect.ts CLEAR_GROUND), or one that leans on the page (currentcolor, a system
   color), which the server's reader knows none of, are no ground. The server's reader carried here would make the
   blob's script 3.5 KB gzipped heavier. */

const byte = (v: number) =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, "0");

/** A color as the browser computes it in sRGB, `color(srgb r g b / a)` (or `rgb()` and `rgba()`), as the address's
    hex: `#rrggbb`, `#rrggbbaa` where it lets what is behind it through, null for none and for a clear one, which
    `clear` keeps as `#00000000`. */
export function srgbHex(computed: string, clear = false): string | null {
  const modern = /^color\(srgb (\S+) (\S+) (\S+)(?: \/ (\S+))?\)$/.exec(computed);
  const legacy = modern ? null : /^rgba?\((\S+), (\S+), (\S+?)(?:, (\S+))?\)$/.exec(computed);
  const found = modern ?? legacy;
  if (!found) return null;
  const rgb = [found[1], found[2], found[3]].map(v => Number(v) / (modern ? 1 : 255));
  const alpha = found[4] === undefined ? 1 : Number(found[4]);
  if (![...rgb, alpha].every(Number.isFinite)) return null;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  if (a === 0) return clear ? "#00000000" : null;
  return `#${rgb.map(byte).join("")}${a < 255 ? byte(alpha) : ""}`;
}

/** A ground's words as the hex the server answers them at, or null where it keeps no ground: computed on an element
    of the page that is never painted, under two page colors and two schemes, so words that lean on the page differ
    and are none; a clear color kept where `clear` asks (srgbHex). */
export function browserGround(words: string, clear = false): string | null {
  if (!CSS.supports("color", words)) return null;
  const read = (color: string, scheme: string) => {
    const probe = document.createElement("i");
    const style = probe.style;
    style.display = "none";
    style.color = color;
    style.colorScheme = scheme;
    style.backgroundColor = `color-mix(in srgb, ${words}, ${words})`;
    document.documentElement.append(probe);
    const seen = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return seen;
  };
  const seen = read("red", "light");
  return seen === read("blue", "dark") ? srgbHex(seen, clear) : null;
}
