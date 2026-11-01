import type { Palette } from "@grabient/engine";
import { hexBytes, srgbToLch, type Triple } from "@grabient/engine/color.ts";
import {
  COLOR_KINDS,
  type ColorKind,
  colorKind,
  colorsText,
  cssBlock,
  cssWide
} from "@grabient/engine/css.ts";
import { type Stop, sampleStops } from "@grabient/engine/curve.ts";
import { type Effect, effectAddressParts, effectEmbedHtml } from "@grabient/engine/effect.ts";
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
import { effectCard } from "../../lib/page-meta.ts";
import type { PaletteFacts } from "./facts.ts";
import { effectHtml, type Taken } from "./formats.ts";
import type { Rest } from "./rest.ts";

/* The palette as text, in the sheet's code pane: its seed, CSS, colors, shader, JSON, SVG and Markdown. While the
   picture plays an effect, the pane holds the effect's code in the gradient's place: the tags that play it behind a
   page, the stylesheet of its first frame, the colors it draws, its settings, its SVG and its Markdown, each the text
   its address serves and the editor's strip copies (engine/effect-code.ts), and no shader, since the effect's is no
   one program. Labels and notes are translated; spellings (oklch, hex, GLSL, the tags) are notation and stay as
   written.

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

/* the effects' code, which the player of an effect playing has loaded: the pane reads it once it is in */
type EffectCode = typeof import("@grabient/engine/effect-code.ts");
const [effectCode, setEffectCode] = createSignal<EffectCode | null>(null);
let effectAsked = false;
const effectCodeNow = () => {
  if (!effectAsked) {
    effectAsked = true;
    void import("@grabient/engine/effect-code.ts").then(setEffectCode, () => {
      effectAsked = false;
    });
  }
  return effectCode();
};
/* the glass's first frame as the tags show it inside the page: its data elided, which Copy writes in full */
const GLASS_STILL_SHOWN = 'url("data:image/webp;base64,…") 50% 50%/cover no-repeat';
const stopOf = (hex: string): Stop => {
  const rgb = hexBytes(hex).map(v => v / 255) as Triple;
  return { t: 0, hex, rgb, lch: srgbToLch(rgb) };
};

/** What the page knows of the palette beyond its colors. */
export interface Known {
  /** the server rendered the page for this palette: nothing it knows of it is missing */
  facts: PaletteFacts | null;
  /** the palette a page opened on, which no edit made */
  opened: boolean;
}

/** The palette's sources, for its view, or for the effect the picture plays where `taken` names one: the taken
    picture is the strip's, whose pixels the SVG is drawn at, as a copy of it is. */
export function codeSources(
  P: Palette,
  v: View,
  seed: string,
  known: () => Known,
  rest: Rest,
  taken?: Taken
): CodeSource[] {
  const stops = sampleStops(P, v.steps);
  const n = stops.length;
  const bands = isSwatchStyle(v.style);
  /* the precise color names once read: asking for the text of a file that carries them starts the read */
  const names = () => {
    void preciseNames();
    return namesNow();
  };
  const swatch = () => swatchPalette(seed, v, origin(), { names: names() });
  const effect = taken?.effect ?? null;
  /* an effect's address names no gradient, so its file is written in the default view at its angle, whatever
     gradient the editor keeps for when the effect stops */
  const drawn = effect ? { angle: v.angle } : v;
  const markdown = () => {
    const address = `/${seed}.md${effect ? `?${effectAddressParts(effect, v.angle).join("&")}` : viewSearch(v)}`;
    const had = files().get(address);
    if (had !== undefined) return had;
    const { facts, opened } = known();
    if (!facts && opened && typeof window !== "undefined") {
      rest.is(seed, address);
      served(address, rest, seed);
    }
    /* the file is English, as the one served at its address is: a translated collection keeps its English title */
    const heldBy = (facts?.heldBy ?? []).map(c => ({ slug: c.slug, title: c.english ?? c.title }));
    /* the words name the file only while it is drawn as the palette was saved, as the served file's do */
    const written = facts?.written && {
      title: facts.written.title,
      ...(facts.written.description ? { lead: facts.written.description } : {}),
      view: facts.written.view
    };
    /* an effect's words come with its code */
    const words =
      effect &&
      effectCodeNow()?.effectMarkdown(
        origin(),
        seed,
        effect,
        `${origin()}${effectCard(seed, effect, v.angle)}`
      );
    if (effect && !words) return "";
    return (
      inLocale(DEFAULT_LOCALE, () =>
        paletteMarkdown(seed, origin(), drawn, written ?? null, heldBy, names(), words)
      )?.trimEnd() ?? ""
    );
  };
  const seedSource: CodeSource = {
    id: "seed",
    label: msg("Seed"),
    text: () => seed,
    note: () =>
      t("{count, plural, one {# character} other {# characters}}. The whole palette.", {
        count: seed.length
      })
  };
  const markdownSource = (note: () => string): CodeSource => ({
    id: "md",
    label: "MD",
    text: markdown,
    note
  });
  if (taken && effect)
    return [
      seedSource,
      ...effectSources(P, seed, effect, taken),
      markdownSource(() => t("The palette as Markdown: colors, names and the tags that play it."))
    ];
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
    seedSource,
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
      text: () => artworkSvg(stops, v, seed, origin(), taken?.pixels ?? DEFAULT_SIZE),
      note: () => t("The picture as an SVG file.")
    },
    markdownSource(() => t("The palette as Markdown: colors, names and CSS."))
  ];
}

/* The effect's own code between the seed and the Markdown: the tags, the stylesheet, its colors, its settings and its
   SVG. The tags' first spelling holds the first frame inside the page as Copy HTML does, which for the glass is a WebP
   the browser makes on the press: shown elided, copied whole. */
function effectSources(P: Palette, seed: string, effect: Effect, taken: Taken): CodeSource[] {
  const angle = taken.angle;
  const glass = effect.kind === "glass";
  const tags = (spelling?: string) => {
    if (spelling === "link") return effectEmbedHtml(origin(), seed, effect, angle);
    const still = glass ? GLASS_STILL_SHOWN : effectCodeNow()?.effectStill(P, effect, angle);
    return still ? effectEmbedHtml(origin(), seed, effect, angle, still) : "";
  };
  const colors = () => effectCodeNow()?.effectColors(P, effect, angle).map(stopOf) ?? [];
  return [
    {
      id: "html",
      label: "HTML",
      spellings: [
        { id: "style", label: "<style>" },
        { id: "link", label: "<link>" }
      ],
      text: tags,
      take: spelling =>
        glass && spelling !== "link" ? effectHtml(taken, effect) : Promise.resolve(tags(spelling)),
      note: spelling => {
        const note = t("The two tags that play it behind a page, for the page's head.");
        return glass && spelling !== "link"
          ? `${note} ${t("Copy includes the whole first frame.")}`
          : note;
      }
    },
    {
      id: "css",
      label: "CSS",
      text: () => effectCodeNow()?.effectStylesheet(P, seed, effect, angle, origin()) ?? "",
      note: () => t("The stylesheet that paints its first frame behind the page.")
    },
    {
      id: "colors",
      label: msg("Colors"),
      spellings: COLOR_KINDS.map(([id, label]) => ({ id, label })),
      initial: colorFormat(),
      text: s => colorsText(colorKind(s ?? "hex"), colors()),
      note: () =>
        t("{count, plural, one {# color} other {# colors}}, one per line.", {
          count: colors().length
        })
    },
    {
      id: "json",
      label: "JSON",
      text: () => effectCodeNow()?.effectSpecJson(P, effect, angle) ?? "",
      note: () => t("The keyframes and the effect's settings as JSON.")
    },
    {
      id: "svg",
      label: "SVG",
      text: () => effectCodeNow()?.effectSvg(P, seed, effect, angle, taken.pixels, origin()) ?? "",
      note: () =>
        effect.speed === 0
          ? t("The picture as an SVG file.")
          : t("The picture as an SVG file, moving by CSS alone.")
    }
  ];
}
