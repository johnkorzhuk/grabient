import { color, font, motion, radius, size, space } from "@grabient/ui/tokens.ts";
import type { JSX } from "@solidjs/web";

/* The tokens as the document shows them: a value as CSS writes it, and a color token as what it paints. Every value is
   read from @grabient/ui's generated tokens, so the document says what the site draws. */
export type Paint = Exclude<keyof typeof color.dark, "grain" | "scheme">;

const SCALES = { space, radius, font, size, motion } as const;
type Scale = keyof typeof SCALES;

/* a token's CSS variable: color.paperSolid is --color-paper-solid */
const cssVar = (path: string): string =>
  `var(--${path.replace(".", "-").replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)})`;

/** A token's value as CSS writes it: 44px, 150ms, 1.45, a font stack. A color is its paint, so it has none here. */
export function tokenValue(path: string): string {
  const [group, name] = path.split(".") as [Scale, string];
  const value = (SCALES[group] as Record<string, string | number> | undefined)?.[name];
  if (value === undefined || typeof value === "string") return value ?? "";
  if (group === "motion") return `${value}ms`;
  if (group === "font" && !name.startsWith("fs")) return String(value);
  return `${value}px`;
}

/* a translucent color as a design tool shows it: the hex, then the opacity */
const byte = (n: string) => Number(n).toString(16).padStart(2, "0");
/** A color token's value in a theme, written short: #ececea, or #ececea 64% for a translucent one. */
export function colorValue(name: Paint, theme: "dark" | "light"): string {
  const value = color[theme][name];
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
  return rgba
    ? `#${byte(rgba[1])}${byte(rgba[2])}${byte(rgba[3])} ${Math.round(Number(rgba[4]) * 100)}%`
    : value;
}

const SHADOWS = new Set<Paint>(["shadow", "shadowPop", "shadowFrost", "rim"]);
/** What a color token paints, drawn on a swatch: a shadow on the ground it falls on, the rule as its dash, any other
    as a fill. */
export function paintOf(name: Paint): JSX.CSSProperties {
  const value = cssVar(`color.${name}`);
  if (SHADOWS.has(name)) return { "background-color": "var(--color-bg)", "box-shadow": value };
  if (name === "dashRule")
    return {
      "background-image": value,
      "background-size": "var(--size-dash-period) 1px",
      "background-repeat": "repeat-x",
      "background-position": "left center"
    };
  return { "background-color": value };
}
