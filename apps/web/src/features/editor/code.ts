import type { Palette } from "@grabient/engine";
import {
  COLOR_KINDS,
  type ColorKind,
  colorKind,
  colorsText,
  cssBlock,
  cssWide
} from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { paletteMarkdown } from "@grabient/engine/markdown.ts";
import { SHADER_KINDS, type ShaderKind, shaderText } from "@grabient/engine/shader.ts";
import { specJson } from "@grabient/engine/spec.ts";
import { artworkSvg } from "@grabient/engine/svg.ts";
import { gplText, swatchPalette, tokensJson } from "@grabient/engine/swatches.ts";
import { DEFAULT_SIZE, isSwatchStyle, type Style, viewSearch } from "@grabient/engine/view.ts";
import { DEFAULT_LOCALE, inLocale, msg, t } from "@grabient/i18n";
import type { CodeSource } from "@grabient/ui/PaletteCode.tsx";
import { createSignal } from "solid-js";
import { colorFormat } from "../../lib/color-format.ts";
import { namesNow, preciseNames } from "../../lib/color-names.ts";
import type { PaletteFacts } from "./facts.ts";
import type { Rest } from "./rest.ts";

/* The palette as text, in the sheet's code pane: its seed, CSS, colors, shader, JSON, SVG and Markdown. Labels and notes
   are translated; spellings (oklch, hex, GLSL) are notation and stay as written.

   The Markdown is written here by the engine's function the Worker serves the file with, so the tab shows at once and
   an edit asks the server nothing. What only the database knows of a palette (its written words, the collections that
   hold it) comes with a page the server rendered for it. A palette opened from a card comes with neither: its served
   file is asked for once, when the tab shows and the palette has rested, and takes the tab's place. A palette made
   by an edit has no words written for it and is never asked about. */

interface View {
  style: Style;
  steps: number;
  angle: number;
}

const CSS_SPELLINGS = (["oklch", "hex", "rgb", "hsl"] as const).map(id => ({ id, label: id }));
const origin = () => (typeof location === "undefined" ? "https://grabient.com" : location.origin);

/* the files read from the server, by address, the latest few: a reader opens a handful of palettes from cards */
const FILES_KEPT = 32;
const [files, setFiles] = createSignal<ReadonlyMap<string, string>>(new Map());
/* the files on their way: one ask per address at a time */
const asking = new Set<string>();
function served(address: string, rest: Rest, seed: string) {
  if (asking.has(address)) return;
  asking.add(address);
  setTimeout(() => {
    rest.asked(seed);
    fetch(address)
      .then(answer =>
        answer.ok ? answer.text() : Promise.reject(new Error(String(answer.status)))
      )
      .then(text =>
        setFiles(map => {
          const next = new Map(map).set(address, text.trimEnd());
          if (next.size > FILES_KEPT) next.delete(next.keys().next().value as string);
          return next;
        })
      )
      .catch(() => {})
      .finally(() => asking.delete(address));
  }, rest.left());
}

/** What the page knows of the palette beyond its colors. */
export interface Known {
  /** the server rendered the page for this palette: nothing it knows of it is missing */
  facts: PaletteFacts | null;
  /** the palette a page opened on, which no edit made */
  opened: boolean;
}

export function codeSources(
  P: Palette,
  v: View,
  seed: string,
  known: () => Known,
  rest: Rest
): CodeSource[] {
  const stops = sampleStops(P, v.steps);
  const n = stops.length;
  const bands = isSwatchStyle(v.style);
  /* precisely named once the names are read, which asking for a swatch file's text starts */
  const swatch = () => {
    void preciseNames();
    return swatchPalette(seed, v, origin(), { names: namesNow() });
  };
  const markdown = () => {
    const address = `/${seed}.md${viewSearch(v)}`;
    const had = files().get(address);
    if (had !== undefined) return had;
    const { facts, opened } = known();
    if (!facts && opened && typeof window !== "undefined") {
      rest.is(seed, `${v.style} ${v.steps} ${v.angle}`);
      served(address, rest, seed);
    }
    /* the file is English, as the one served at its address is: a translated collection keeps its English title */
    const heldBy = (facts?.heldBy ?? []).map(c => ({ slug: c.slug, title: c.english ?? c.title }));
    const written = facts?.written && {
      title: facts.written.title,
      ...(facts.written.description ? { lead: facts.written.description } : {})
    };
    return (
      inLocale(DEFAULT_LOCALE, () =>
        paletteMarkdown(seed, origin(), v, written ?? null, heldBy)
      )?.trimEnd() ?? ""
    );
  };
  /* the second sentence where the CSS carries a Display-P3 line under its media query */
  const p3 = (note: string) => (cssWide(stops) ? `${note} ${t("Plus a Display P3 line.")}` : note);
  const cssNote = (kind: ColorKind) =>
    kind === "oklch"
      ? bands
        ? t("{count, plural, one {# hard band} other {# hard bands}} as oklch().", { count: n })
        : t(
            "{count, plural, one {# stop, blended in OKLCH} other {# stops, blended in OKLCH}} as oklch().",
            { count: n }
          )
      : kind === "hex"
        ? bands
          ? t("{count, plural, one {# sRGB hard band} other {# sRGB hard bands}} as hex.", {
              count: n
            })
          : t("{count, plural, one {# sRGB stop} other {# sRGB stops}} as hex.", { count: n })
        : bands
          ? t("{count, plural, one {# sRGB hard band} other {# sRGB hard bands}} as {fn}.", {
              count: n,
              fn: `${kind}()`
            })
          : t("{count, plural, one {# sRGB stop} other {# sRGB stops}} as {fn}.", {
              count: n,
              fn: `${kind}()`
            });
  /* CSS and Colors open in the spelling the reader chose in Settings */
  const initial = colorFormat();
  return [
    {
      id: "seed",
      label: msg("Seed"),
      text: () => seed,
      note: () =>
        t("{count, plural, one {# character} other {# characters}}. The whole palette.", {
          count: seed.length
        })
    },
    {
      id: "css",
      label: "CSS",
      spellings: CSS_SPELLINGS,
      initial,
      text: s => cssBlock(stops, v.style, v.angle, colorKind(s)),
      note: s => p3(cssNote(colorKind(s)))
    },
    {
      id: "colors",
      label: msg("Colors"),
      spellings: [
        ...COLOR_KINDS.map(([id, label]) => ({ id, label })),
        { id: "gpl", label: "GPL" }
      ],
      initial,
      text: s => {
        if (s !== "gpl") return colorsText(colorKind(s ?? "hex"), stops);
        const palette = swatch();
        return palette ? gplText([palette], palette.name) : "";
      },
      note: () =>
        bands
          ? t("{count, plural, one {# band} other {# bands}}, one per line.", { count: n })
          : t("{count, plural, one {# color} other {# colors}}, one per line.", { count: n })
    },
    {
      id: "shader",
      label: msg("Shader"),
      spellings: SHADER_KINDS.map(([id, label]) => ({ id, label })),
      text: s => shaderText((s ?? "shadertoy") as ShaderKind, P, v, n, seed, origin()),
      note: () => t("Keyframes, spline and OKLCH to sRGB conversion.")
    },
    {
      id: "json",
      label: "JSON",
      spellings: [
        { id: "keyframes", label: t("Keyframes") },
        { id: "tokens", label: "Tokens" }
      ],
      text: s => {
        if (s !== "tokens") return specJson(P, v);
        const palette = swatch();
        return palette ? tokensJson([palette]) : "";
      },
      note: s => (s === "tokens" ? t("The colors as design tokens.") : t("The keyframes as JSON."))
    },
    {
      id: "svg",
      label: "SVG",
      text: () => artworkSvg(stops, v, seed, origin(), DEFAULT_SIZE),
      note: () => t("The picture as an SVG file.")
    },
    {
      id: "md",
      label: "MD",
      text: markdown,
      note: () => t("The palette as Markdown: colors, names and CSS.")
    }
  ];
}
