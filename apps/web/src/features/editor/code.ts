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
import { effectAddressParts } from "@grabient/engine/effect.ts";
import { paletteMarkdown } from "@grabient/engine/markdown.ts";
import { isShaderPage, SHADER_KINDS, type ShaderKind } from "@grabient/engine/shader-kinds.ts";
import { specJson } from "@grabient/engine/spec.ts";
import { artworkSvg } from "@grabient/engine/svg.ts";
import { gplText, swatchPalette, tokensJson } from "@grabient/engine/swatches.ts";
import {
  DEFAULT_SIZE,
  finishOf,
  isSwatchStyle,
  type Style,
  viewSearch
} from "@grabient/engine/view.ts";
import { DEFAULT_LOCALE, inLocale, msg, t } from "@grabient/i18n";
import type { CodeSource } from "@grabient/ui/PaletteCode.tsx";
import { createSignal } from "solid-js";
import { colorFormat } from "../../lib/color-format.ts";
import { namesNow, preciseNames } from "../../lib/color-names.ts";
import { drawn as drawnNow } from "../../lib/picture.ts";
import { GRAIN_SHOWN, grainDataUrl, grainPictureUrl } from "./copy-finish.ts";
import type { PaletteFacts } from "./facts.ts";
import type { Taken } from "./formats.ts";
import type { Rest } from "./rest.ts";

/* The palette as text, in the sheet's code pane: its seed, CSS, colors, shader, JSON, SVG and Markdown. While the
   picture plays an effect, the pane holds the effect's code in the gradient's place: the tags that play it behind a
   page, the stylesheet of its first frame, the colors it draws, its settings, its SVG and its Markdown, each the text
   its address serves and the editor's strip copies (engine/effect-code.ts), and its shader, pass by pass in each
   spelling, whose writers load as the spelling shows. Those tabs load with the effect's code as an effect first shows
   here (effect-sources.ts), never with a palette's start. Labels and notes are translated; spellings (oklch, hex,
   GLSL, the tags) are notation and stay as written.

   The Markdown is written here by the engine's function the Worker serves the file with, so the tab shows at once and
   an edit asks the server nothing. What only the database knows of a palette (its written words, the collections that
   hold it) comes with a page the server rendered for it. A palette opened from a card comes with neither: its served
   file is asked for once, when the tab shows and the palette has rested, and takes the tab's place. A palette made
   by an edit has no words written for it and is never asked about. */

interface View {
  style: Style;
  steps: number;
  angle: number;
  soft?: number;
  grain?: number;
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

/* the effect's tabs and words, with its code: asked for as an effect first shows here, the tabs drawn once they are in */
type EffectTabs = typeof import("./effect-sources.ts");
const [effectTabs, setEffectTabs] = createSignal<EffectTabs | null>(null);
let tabsAsked = false;
const effectTabsNow = () => {
  if (!tabsAsked) {
    tabsAsked = true;
    void import("./effect-sources.ts").then(setEffectTabs, () => {
      tabsAsked = false;
    });
  }
  return effectTabs();
};
/* the shader's texts and its WebGL and WebGPU pages (engine/shader.ts, shader-page.ts), asked for once the Shader tab
   shows: a page's start carries only the tab's spellings, and the Worker's build none of them (a server never writes a
   shader, and its ask waits for ever) */
interface ShaderCode {
  text: typeof import("@grabient/engine/shader.ts");
  page: typeof import("@grabient/engine/shader-page.ts");
}
const [shaderCode, setShaderCode] = createSignal<ShaderCode | null>(null);
let shaderAsked = false;
const shaderCodeNow = () => {
  if (!shaderAsked) {
    shaderAsked = true;
    void (
      import.meta.env.SSR
        ? (new Promise(() => {}) as never)
        : Promise.all([
            import("@grabient/engine/shader.ts"),
            import("@grabient/engine/shader-page.ts")
          ])
    ).then(
      ([text, page]) => setShaderCode({ text, page }),
      () => {
        shaderAsked = false;
      }
    );
  }
  return shaderCode();
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
    const address = `/${seed}.md${effect ? `?${effectAddressParts(effect, v.angle, finishOf(v)).join("&")}` : viewSearch(v)}`;
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
      effect && effectTabsNow()?.effectWords(origin(), seed, effect, v.angle, finishOf(v));
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
      ...(effectTabsNow()?.effectSources(P, seed, effect, taken, origin()) ?? []),
      markdownSource(() => t("The palette as Markdown: colors, names and the tags that play it."))
    ];
  /* the CSS draws a soft view's blurred stops at their places (engine/soft.ts), and the grain's tile over them, shown
     elided and copied whole */
  const painted = drawnNow(stops, v);
  const cssStops = painted.stops;
  const over = (grain?: string) => ({
    ...(painted.at ? { at: painted.at } : {}),
    ...(v.grain ? { grain: `url("${grain ?? GRAIN_SHOWN}")` } : {})
  });
  const cssText = (kind: ColorKind, grain?: string) =>
    cssBlock(cssStops, painted.style, v.angle, kind, over(grain));
  const svgText = (grain?: string) =>
    artworkSvg(cssStops, v, seed, origin(), taken?.pixels ?? DEFAULT_SIZE, {
      style: painted.style,
      at: painted.at,
      grain
    });
  /* the second sentence where the CSS carries a Display-P3 line under its media query */
  const p3 = (note: string) =>
    cssWide(cssStops) ? `${note} ${t("Plus a Display P3 line.")}` : note;
  const soft = !!painted.at;
  /* the shader draws a soft view's stops as the CSS does, and lays the grain over them */
  const shaderFinish = {
    ...(painted.at
      ? { drawn: { stops: painted.stops, style: painted.style, at: painted.at } }
      : {}),
    ...(v.grain ? { grain: v.grain } : {})
  };
  const cssNote = (kind: ColorKind) =>
    soft
      ? t(
          "{count, plural, one {# stop, blurred along the line} other {# stops, blurred along the line}}.",
          {
            count: cssStops.length
          }
        )
      : kind === "oklch"
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
      text: s => cssText(colorKind(s)),
      take: s =>
        v.grain
          ? grainDataUrl(v.grain).then(data => cssText(colorKind(s), data))
          : Promise.resolve(cssText(colorKind(s))),
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
      text: s => {
        const kind = (s ?? "shadertoy") as ShaderKind;
        const code = shaderCodeNow();
        if (!code) return "";
        return isShaderPage(kind)
          ? code.page.shaderPage(kind, P, v, n, seed, origin(), shaderFinish)
          : code.text.shaderText(kind, P, v, n, seed, origin(), shaderFinish);
      },
      note: () => {
        /* a soft view's shader draws its blurred stops, as its CSS does, not the curve */
        const what = soft
          ? t("The stops blurred along the line, at their places, blended in sRGB.")
          : t("Keyframes, spline and OKLCH to sRGB conversion.");
        return v.grain ? `${what} ${t("Then its grain, a speck a CSS pixel.")}` : what;
      }
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
      text: () => svgText(GRAIN_SHOWN),
      take: () =>
        v.grain
          ? grainPictureUrl(v.grain, taken?.pixels ?? DEFAULT_SIZE).then(svgText)
          : Promise.resolve(svgText()),
      note: () => t("The picture as an SVG file.")
    },
    markdownSource(() => t("The palette as Markdown: colors, names and CSS."))
  ];
}
