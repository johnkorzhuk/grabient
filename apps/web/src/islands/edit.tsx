// Live gradient editor island — mounted on BOTH /:seed and /:seed/edit.
// High-velocity state: signals drive the preview/graph/swatches/code instantly;
// URL writes are throttled (300ms) and the URL stays the source of truth
// (initial state parses from it; popstate re-syncs via island remount).
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import * as v from "valibot";
import { deserializeCoeffs, serializeCoeffs } from "@repo/data-ops/serialization";
import {
  applyGlobals,
  cosineGradient,
  rgbToHex,
  tareModifier,
  updateCoeffWithInverseGlobal,
  type CosineCoeffs,
  type GlobalModifiers,
} from "@repo/data-ops/gradient-gen/cosine";
import { generateCssGradient } from "@repo/data-ops/gradient-gen/css";
import { generateSvgGradient } from "@repo/data-ops/gradient-gen/svg";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  type PaletteStyle,
} from "@repo/data-ops/valibot-schema/grabient";
import { bestInk } from "@repo/data-ops/color-utils";
import { channelsGraphSvg } from "../graph";
import { logoStops } from "../icons";
import {
  describePaletteName,
  titleSuffix,
  TITLE_HEADLINE,
} from "../palette-name";
import { relatedSearches, relatedSearchSlug } from "../palette-prose";
import { analyzeCoefficients } from "@repo/data-ops/gradient-gen/palette-tags";
import {
  coeffsJsonSnippet,
  colorsSnippet,
  exportItemData,
  heroInk,
  paletteSharePath,
  shadertoySnippet,
} from "../palette";
import {
  MAX_DIM,
  MIN_DIM,
  parseListSearch,
  parseSize,
  searchString,
  sizeParam,
  type PreviewSize,
} from "../search";
import {
  MAX_EXPORT_ITEMS,
  readExportList,
  toggleExportItem,
} from "./export-store";
import { trackEvent } from "../analytics";

interface Modifier {
  key: "exposure" | "contrast" | "frequency" | "phase";
  idx: 0 | 1 | 2 | 3;
  min: number;
  max: number;
  def: number;
}

const MODIFIERS: Modifier[] = [
  { key: "exposure", idx: 0, min: -1, max: 1, def: 0 },
  { key: "contrast", idx: 1, min: 0, max: 2, def: 1 },
  { key: "frequency", idx: 2, min: 0, max: 2, def: 1 },
  { key: "phase", idx: 3, min: -1, max: 1, def: 0 },
];

const CHANNELS = [
  { ch: 0, label: "Red", color: "var(--chart-red)" },
  { ch: 1, label: "Green", color: "var(--chart-green)" },
  { ch: 2, label: "Blue", color: "var(--chart-blue)" },
] as const;

const STEP = 0.001; // arrows: 3rd decimal
const LARGE_STEP = 0.01; // shift/page: 2nd decimal
const URL_THROTTLE_MS = 300;

const modSchema = (m: Modifier) =>
  v.pipe(v.number(), v.finite(), v.minValue(m.min), v.maxValue(m.max));

const MOD_PARAM = v.fallback(v.picklist(["", "exposure", "contrast", "frequency", "phase"]), "");

// Compact port of the original device-presets catalog (most-used entries).
const SIZE_PRESETS: { label: string; dims: [number, number] }[] = [
  { label: "1080p", dims: [1920, 1080] },
  { label: "1440p", dims: [2560, 1440] },
  { label: "4K", dims: [3840, 2160] },
  { label: "Square", dims: [1080, 1080] },
  { label: "Story", dims: [1080, 1920] },
  { label: "iPhone 16 Pro", dims: [1206, 2622] },
  { label: "iPad Pro 13″", dims: [2064, 2752] },
  { label: "MacBook Air 13″", dims: [2560, 1664] },
];

// Same interaction recipe as the subheader's BTN_ICON/CTRL: border + bg +
// text all shift together on hover, with the matching active states.
const ACTION_BTN =
  "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-solid border-input bg-background text-muted-foreground transition-colors duration-200 outline-none hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground active:border-muted-foreground/40 active:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/70";
const ACTION_BTN_ON = " border-muted-foreground/30 bg-background/60 text-foreground";
// Mobile-dock buttons float over the gradient: glass surface at rest that
// goes solid on hover (the canvas-mode subheader-control behavior), larger
// touch target. Active toggles brighten like BTN_ACTIVE.
const DOCK_BTN =
  "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-solid border-input bg-background/70 text-muted-foreground backdrop-blur-md transition-colors duration-200 outline-none hover:border-muted-foreground/30 hover:bg-background hover:text-foreground active:border-muted-foreground/40 active:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/70";
const DOCK_BTN_ON = " border-muted-foreground/40 bg-background/85 text-foreground";

// Must stay identical to RELATED_CHIP in pages.ts — the same chips, two
// renderers: the server writes the crawler's row, this rebuilds it per tick.
const RELATED_CHIP =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-solid border-input bg-background px-3.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground md:text-xs";

export interface EditorProps {
  seed: string;
  style: PaletteStyle;
  steps: number;
  angle: number;
}

function MidpointSlider(props: {
  min: number;
  max: number;
  value: number;
  color?: string;
  label: string;
  onValue: (n: number) => void;
  onCommit?: () => void;
}) {
  const pct = () => `${(((props.value - props.min) / (props.max - props.min)) * 100).toFixed(2)}%`;
  const mid = () => `${(((0 - props.min) / (props.max - props.min)) * 100).toFixed(2)}%`;
  const midValue = () => (props.min < 0 ? 0 : (props.min + props.max) / 2);
  const midPct = () =>
    `${(((midValue() - props.min) / (props.max - props.min)) * 100).toFixed(2)}%`;
  void mid;
  const keydown = (e: KeyboardEvent) => {
    const cur = props.value;
    let next: number | null = null;
    if (e.key === "Home") next = props.min;
    else if (e.key === "End") next = props.max;
    else if (e.key === "PageUp") next = cur + LARGE_STEP;
    else if (e.key === "PageDown") next = cur - LARGE_STEP;
    else if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowRight")) next = cur + LARGE_STEP;
    else if (e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowLeft")) next = cur - LARGE_STEP;
    if (next !== null) {
      e.preventDefault();
      props.onValue(Math.max(props.min, Math.min(props.max, next)));
    }
  };
  return (
    <div
      class="mslider"
      style={{ "--p": pct(), "--mid": midPct(), color: props.color }}
      data-at-mid={Math.abs(props.value - midValue()) < 0.0005 ? "" : undefined}
    >
      <div class="mslider-track" />
      <div class="mslider-fill" />
      <div class="mslider-tick" />
      <div class="mslider-thumb" />
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={STEP}
        value={props.value}
        aria-label={props.label}
        aria-valuetext={props.value.toFixed(3)}
        onInput={(e) => props.onValue(Number(e.currentTarget.value))}
        onChange={() => props.onCommit?.()}
        onKeyDown={keydown}
      />
    </div>
  );
}

export function EditorIsland(props: EditorProps) {
  const parsed = deserializeCoeffs(props.seed);
  const [coeffs, setCoeffs] = createSignal<CosineCoeffs>(parsed.coeffs);
  const [globals, setGlobals] = createSignal<GlobalModifiers>([...parsed.globals]);
  const initialMod = v.parse(MOD_PARAM, new URLSearchParams(location.search).get("mod") ?? "");
  const [selected, setSelected] = createSignal<string>(initialMod || "");
  const [seed, setSeed] = createSignal(props.seed);

  // Style/steps/angle: committed state (mirrors the URL) plus a transient
  // preview overlay driven by the subheader inputs' hover/typing — the same
  // model the list grid uses, so the big gradient previews live too.
  type ViewState = { style: PaletteStyle; steps: number; angle: number };
  const [committed, setCommitted] = createSignal<ViewState>({
    style: props.style,
    steps: props.steps,
    angle: props.angle,
  });
  const [overlay, setOverlay] = createSignal<ViewState | null>(null);
  const view = createMemo(() => overlay() ?? committed());

  // Seed-page "auto" resolves to the global defaults (matches SSR).
  const resolveFields = (fields: Record<string, string>) => {
    const sp = new URLSearchParams();
    for (const k in fields) if (fields[k]) sp.set(k, fields[k]!);
    const parsed = parseListSearch(sp);
    return {
      state: {
        style: parsed.style === "auto" ? DEFAULT_STYLE : parsed.style,
        steps: parsed.steps === "auto" ? DEFAULT_STEPS : parsed.steps,
        angle: parsed.angle === "auto" ? DEFAULT_ANGLE : parsed.angle,
      } as ViewState,
      parsed,
    };
  };

  // Preview dimensions (?size=WxH): the gradient box adopts the target
  // aspect ratio, letterboxed inside the preview area (port of the
  // original's size/DevicePresets feature). URL-owned like `mod`.
  const [previewSize, setPreviewSizeSig] = createSignal<PreviewSize>(
    parseSize(new URLSearchParams(location.search).get("size")),
  );
  const [previewSizeHover, setPreviewSizeHover] = createSignal<PreviewSize | null>(null);
  const renderedPreviewSize = (): PreviewSize => previewSizeHover() ?? previewSize();
  const [containerDims, setContainerDims] = createSignal<[number, number]>([800, 400]);

  const applyFit = () => {
    const box = document.getElementById("preview-box");
    const fit = document.getElementById("preview-fit");
    if (!box || !fit) return;
    const s = renderedPreviewSize();
    // Canvas mode goes full-bleed only when no explicit size is set — with
    // one, .has-size reverts the overrides and the fitted box renders framed.
    document.getElementById("seed-hero")?.classList.toggle("has-size", s !== "auto");
    if (s === "auto") {
      fit.style.cssText = "width:100%;height:100%";
      return;
    }
    const r = box.getBoundingClientRect();
    const target = s[0] / s[1];
    const cont = r.height > 0 ? r.width / r.height : 1;
    fit.style.cssText =
      `aspect-ratio:${s[0]}/${s[1]};max-width:100%;max-height:100%;` +
      (target > cont ? "width:100%;height:auto" : "height:100%;width:auto");
  };

  const commitSize = (s: PreviewSize) => {
    setPreviewSizeHover(null);
    setPreviewSizeSig(s);
    const q = new URLSearchParams(location.search);
    const p = sizeParam(s);
    if (p) q.set("size", p);
    else q.delete("size");
    history.replaceState(history.state, "", location.pathname + (q.toString() ? `?${q}` : ""));
    applyFit();
    updateStaticSurfaces(seed());
  };

  const applied = createMemo(() => applyGlobals(coeffs(), globals()));
  const hexColors = createMemo(() =>
    cosineGradient(view().steps, applied()).map(([r, g, b]) => rgbToHex(r, g, b)),
  );
  const background = createMemo(
    () =>
      generateCssGradient(hexColors(), view().style, view().angle, {
        seed: seed(),
        searchString: "",
      }).styles.background,
  );
  const graphSvg = createMemo(() => channelsGraphSvg(applied(), view().steps, hexColors()));
  const [exportIds, setExportIds] = createSignal<Set<string>>(new Set());
  const exportItem = createMemo(() =>
    exportItemData(seed(), view().style, view().steps, view().angle),
  );
  const exportSelected = createMemo(() => {
    const item = exportItem();
    return !!item && exportIds().has(item.id);
  });
  const syncExportIds = () =>
    setExportIds(new Set(readExportList().map((item) => item.id)));
  const gradientEvent = () => ({
    seed: seed(),
    style: view().style,
    steps: view().steps,
    angle: view().angle,
  });
  const toggleSeedExport = () => {
    const item = exportItem();
    if (!item) return;
    const result = toggleExportItem(item);
    setExportIds(new Set(result.items.map((entry) => entry.id)));
    trackEvent(result.selected ? "add_to_export" : "remove_from_export", {
      ...gradientEvent(),
      newExportCount: result.items.length,
    });
    const live = document.getElementById("live");
    if (live) {
      live.textContent = "";
      live.textContent = !result.selected
        ? "Removed from export selection"
        : result.dropped
          ? `Added — oldest selection dropped (${MAX_EXPORT_ITEMS} max)`
          : "Added to export selection";
    }
  };

  // Throttled URL writes; instant everything else. Seed changes create
  // HISTORY ENTRIES so Back/Forward acts as undo/redo: writes more than
  // 600ms apart are separate gestures (pushState); rapid ticks within a
  // drag or key-repeat merge into the current entry (replaceState).
  // Mod-selection-only changes never create entries. Duplicate protection:
  // a no-op write is skipped, and a gesture that lands exactly on the
  // PREVIOUS entry (double invert, swap-and-swap-back) moves the pointer
  // back instead of pushing a copy — the stack never fills with repeats.
  let urlTimer: ReturnType<typeof setTimeout> | undefined;
  let lastWriteAt = 0;
  let prevEntryUrl: string | null = null;
  const writeUrl = () => {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      const next = serializeCoeffs(coeffs(), globals());
      setSeed(next);
      const q = new URLSearchParams(location.search);
      if (selected()) q.set("mod", selected());
      else q.delete("mod");
      const qs = q.toString() ? `?${q}` : "";
      const url = `/${next}${qs}`;
      const cur = location.pathname + location.search;
      if (url === cur) return;
      const seedChanged = location.pathname !== `/${next}`;
      const fresh = Date.now() - lastWriteAt > 600;
      lastWriteAt = Date.now();
      if (seedChanged && fresh && url === prevEntryUrl) {
        // Returned to the previous state: this IS an undo — walk back
        // (handled in place by handlePop) and keep the redo entry forward.
        prevEntryUrl = null;
        history.back();
        return;
      }
      if (seedChanged && fresh) {
        prevEntryUrl = cur;
        history.pushState(history.state, "", url);
      } else {
        history.replaceState(history.state, "", url);
      }
    }, URL_THROTTLE_MS);
  };
  onCleanup(() => clearTimeout(urlTimer));

  const updateStaticSurfaces = (currentSeed: string) => {
    const preview = document.getElementById("edit-preview");
    if (preview) preview.style.background = background();
    const glow = document.querySelector(".glow");
    if (glow) (glow as HTMLElement).style.background = background();
    const credit = { seed: currentSeed, searchString: location.search };
    const s = previewSize();
    const panels: Record<string, string> = {
      "css-code": generateCssGradient(hexColors(), view().style, view().angle, credit).cssString,
      "svg-code": generateSvgGradient(hexColors(), view().style, view().angle, credit, null, {
        width: s === "auto" ? 800 : s[0],
        height: s === "auto" ? 400 : s[1],
      }),
      "colors-code": colorsSnippet(hexColors()),
      "shader-code": shadertoySnippet(
        { appliedCoeffs: applied(), ...view() },
        currentSeed,
        location.search,
      ),
      "coeffs-code": coeffsJsonSnippet(applied()),
    };
    for (const [id, txt] of Object.entries(panels)) {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    }
    // The shared copy button always mirrors the active tab's content.
    const exportSec = document.getElementById("export-code");
    const activeCode = exportSec?.querySelector("[data-code-panel]:not(.hidden) code");
    if (activeCode)
      exportSec
        ?.querySelector("[data-copy]")
        ?.setAttribute("data-copy", activeCode.textContent ?? "");
    // Dynamic favicon tracks the effective style/steps/angle, like SSR.
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) {
      const fav = generateSvgGradient(
        hexColors(),
        view().style,
        view().angle,
        { seed: currentSeed, searchString: "" },
        null,
        { width: 64, height: 64, borderRadius: 25 },
      );
      icon.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(fav)}`);
    }
    // Canvas-mode ink: re-run the OG-style top-strip luminance against the
    // hero's real dimensions; flip the header ink and tint the browser
    // chrome (theme-color) to the gradient's top-strip average.
    const hero = document.getElementById("seed-hero");
    if (hero) {
      const sub = hero.querySelector<HTMLElement>(".subheader");
      const regionH = sub ? sub.offsetTop + sub.offsetHeight : 132;
      // Sample against the gradient's own box — it ends above the sliders
      // sheet, so the hero's height would skew centered styles.
      const gr = document.getElementById("edit-preview")?.getBoundingClientRect();
      const { ink, avgHex } = heroInk(
        { hexColors: hexColors(), style: view().style, angle: view().angle },
        (gr?.width || hero.clientWidth) || 430,
        (gr?.height || hero.clientHeight) || 860,
        regionH,
      );
      hero.classList.toggle("hero-ink-dark", ink === "dark");
      hero.classList.toggle("hero-ink-light", ink === "light");
      // Header buttons: same math over their own region (top-right strip).
      const gw = (gr?.width || hero.clientWidth) || 430;
      const gh = (gr?.height || hero.clientHeight) || 860;
      const headerH = hero.querySelector("header")?.getBoundingClientRect().height || 76;
      const btnInk = heroInk(
        { hexColors: hexColors(), style: view().style, angle: view().angle },
        gw,
        gh,
        Math.min(headerH, gh),
        gw * 0.55,
        gw,
      );
      hero.classList.toggle("hero-btn-dark", btnInk.ink === "dark");
      hero.classList.toggle("hero-btn-light", btnInk.ink === "light");
      let themeMeta = document.querySelector('meta[name="theme-color"]');
      if (!themeMeta) {
        themeMeta = document.createElement("meta");
        themeMeta.setAttribute("name", "theme-color");
        document.head.append(themeMeta);
      }
      themeMeta.setAttribute("content", avgHex);
    }
    // The graph and swatch strip stay SSR'd markup — the island only refreshes
    // their content in place (never unmounts them).
    const graphPanel = document.getElementById("graph-panel");
    if (graphPanel) graphPanel.innerHTML = graphSvg();
    // The logo's gradient bar renders the current palette, live.
    const logoG = document.getElementById("logoG");
    if (logoG) logoG.innerHTML = logoStops(hexColors());
    const strip = document.getElementById("swatches-strip");
    if (strip) {
      strip.innerHTML = swatchesHtml(hexColors());
      window.__fitSwatches?.();
    }
    describeSurfaces();
  };

  /**
   * The palette's text surfaces — sr-only h2, related-search chips,
   * `document.title`.
   *
   * This used to be a fetch of /{seed}.json fired from the throttled URL write,
   * which kept the 843-name color corpus off the client but made the name the
   * one surface that lagged the sliders: the gradient, graph and swatches moved
   * on every tick and the heading arrived later, describing a palette you had
   * already dragged past. Naming is a pure function of the coefficients and the
   * rendered colors, so it belongs here with the rest of them. Measured cost of
   * shipping the corpus and the modifier analysis to the browser is in
   * seo-research/palette-modifiers.md.
   *
   * Identical code to the server render (palette-name.ts / palette-prose.ts),
   * so the text a crawler gets and the text a visitor edits into cannot drift.
   */
  const describeSurfaces = () => {
    const current = view();
    const colors = hexColors();
    const described = describePaletteName(applied(), colors);
    // The h2 is sr-only (it kept that place when the visible paragraph landed
    // on 2026-08-17 and kept it when the paragraph came off on 2026-08-18,
    // D22.A) and it carries the short name: it is the section's
    // aria-labelledby target and the crawler's name for the palette.
    const heading = document.getElementById("palette-about");
    if (heading) heading.textContent = described.name;
    const h1 = document.getElementById("palette-h1");
    if (h1) h1.textContent = `${described.name} gradient palette editor`;
    // No paragraph write here any more: D22.A took the description off the
    // page, so the only prose left for a slider tick to keep current is the
    // name and the chips. The description is still generated per REQUEST on
    // the server (meta, JSON-LD, /{seed}.json, embed text) — it is a crawler
    // and embedding surface now, and a crawler sees the server render, not the
    // island's tick. Dropping paletteProse from this file also drops its
    // sentence tables and the base-tag analysis from the client bundle, which
    // is most of what the description cost the browser: the edit chunk went
    // 116.21 KB raw / 39.13 KB gzip to 91.28 KB / 31.11 KB, measured with
    // `pnpm build` either side of this edit. Final consolidation re-measure
    // after the chip QA rounds and the D23.1 journey chips: 96.32 KB raw /
    // 33.15 KB gzip — 5.04 KB gzip back for the sharper selection, still
    // 5.98 KB below the build that rendered the paragraph.
    // relatedSearches still imports
    // palette-prose, so the corpus and the feature analysis stay; what left the
    // bundle is the paragraph machinery Rollup could now prove unreachable.
    // Related chips: rebuilt from the same relatedSearches() the server
    // rendered, so crawler HTML and live DOM cannot disagree. DOM APIs, not
    // innerHTML — the labels are corpus/registry words, but the row is inside
    // the document and the house rule is to never format-string into it.
    const related = document.getElementById("related-searches");
    if (related) {
      related.textContent = "";
      // The STORED journey rides in beside the descriptor tags, because two of
      // the registry's terms read it and the server render has it (D25.2). One
      // coefficient analysis per tick, and without it the island's row would
      // drop a chip the crawler's HTML carries.
      const journey = analyzeCoefficients(applied()).journey;
      const rowTags = [...described.tags, ...(journey === "warming" || journey === "cooling" ? [journey] : [])];
      for (const label of relatedSearches(described.features, described, rowTags)) {
        const chip = document.createElement("a");
        chip.href = `/palettes/${relatedSearchSlug(label)}`;
        chip.className = RELATED_CHIP;
        chip.textContent = label;
        related.append(chip);
      }
    }
    // The title has its own, tighter budget — same rule as the server. Reusing
    // the analysis keeps a slider drag to one dense sample per tick, not two.
    const titleName = describePaletteName(applied(), colors, {
      ...TITLE_HEADLINE,
      features: described.features,
    }).name;
    // D14: suffix keyed to style-param PRESENCE in the URL this island
    // maintains — parseListSearch reads "auto" exactly when the param is
    // absent/invalid, the same rule the server applies to the request URL.
    // commit()/handlePop() write the URL before calling into here, and slider
    // ticks never touch the style param, so location.search is always current.
    const styleInUrl =
      parseListSearch(new URLSearchParams(location.search)).style !== "auto";
    document.title = `${titleName}${titleSuffix(current.style, styleInUrl, current.steps)}`;
  };

  /** Must stay identical to swatches() in pages.ts — same strip, two renderers. */
  const swatchesHtml = (colors: string[]) =>
    `<ul class="swatches grid w-full overflow-hidden rounded-lg" style="grid-template-columns:repeat(${colors.length},minmax(0,1fr))" aria-label="Palette colors">${colors
      .map(
        (hex) =>
          `<li class="swatch-item min-w-0"><button type="button" data-copy="${hex}" aria-label="Copy ${hex}" class="${bestInk(hex) === "black" ? "on-light" : "on-dark"} flex h-14 w-full cursor-pointer items-center justify-center overflow-hidden font-mono font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 pointer-coarse:h-16 lg:h-20" style="background:${hex}"><span class="swatch-label">${hex}</span></button></li>`,
      )
      .join("")}</ul>`;

  const notifyPaletteChange = (currentSeed: string) => {
    const current = view();
    document.dispatchEvent(
      new CustomEvent("palette:change", {
        detail: {
          seed: currentSeed,
          style: current.style,
          steps: current.steps,
          angle: current.angle,
        },
      }),
    );
  };

  const live = () => {
    const currentSeed = serializeCoeffs(coeffs(), globals());
    setSeed(currentSeed);
    updateStaticSurfaces(currentSeed);
    notifyPaletteChange(currentSeed);
    writeUrl();
  };

  const setModifier = (m: Modifier, raw: number): boolean => {
    const result = v.safeParse(modSchema(m), raw);
    if (!result.success) return false;
    const next = [...globals()] as GlobalModifiers;
    next[m.idx] = Math.round(result.output * 1000) / 1000;
    setGlobals(next);
    live();
    return true;
  };

  // Tare (original handleTareModifier): bake the global's effect into the
  // coefficient row and reset the global to its default — the rendered
  // colors DO NOT change, values just redistribute. Because the output is
  // identical, the URL write must never create a history entry (the
  // original navigates with replace) — stamping lastWriteAt makes writeUrl
  // take its replaceState branch.
  const tare = (m: Modifier) => {
    const { coeffs: c, globals: g } = tareModifier(coeffs(), globals(), m.idx, m.def);
    setCoeffs(c);
    setGlobals([...g] as GlobalModifiers);
    lastWriteAt = Date.now();
    live();
  };

  const setChannel = (m: Modifier, ch: number, raw: number) => {
    const clamped = Math.max(m.min, Math.min(m.max, raw));
    setCoeffs(updateCoeffWithInverseGlobal(coeffs(), m.idx, ch, clamped, globals()));
    live();
  };

  const numberKeydown = (m: Modifier, e: KeyboardEvent) => {
    const el = e.currentTarget as HTMLInputElement;
    const cur = globals()[m.idx]!;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const delta = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? LARGE_STEP : STEP);
      setModifier(m, Math.max(m.min, Math.min(m.max, cur + delta)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!setModifier(m, Number(el.value))) el.value = cur.toFixed(3);
      el.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      el.value = cur.toFixed(3);
      el.blur();
    }
  };

  const channelKeydown = (m: Modifier, ch: number, e: KeyboardEvent) => {
    const el = e.currentTarget as HTMLInputElement;
    const cur = Math.max(m.min, Math.min(m.max, applied()[m.idx]?.[ch] ?? 0));
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const delta = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? LARGE_STEP : STEP);
      setChannel(m, ch, cur + delta);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const n = Number(el.value);
      if (Number.isFinite(n)) setChannel(m, ch, n);
      else el.value = cur.toFixed(3);
      el.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      el.value = cur.toFixed(3);
      el.blur();
    }
  };

  // Overlay actions (top-right of the gradient): copy CSS/SVG + dimensions.
  const [copied, setCopied] = createSignal("");
  let copiedT: ReturnType<typeof setTimeout> | undefined;
  const copyCode = (kind: "css" | "svg") => {
    const text = document.getElementById(`${kind}-code`)?.textContent ?? "";
    void navigator.clipboard?.writeText(text).then(() => {
      trackEvent(`copy_${kind}`, gradientEvent());
      flashCopied(kind);
    });
  };
  // PNG/SVG export (port of the original generatePNG + copyPNGToClipboard):
  // angularGradient uses a direct canvas conic (exact, vs the SVG's wedge-fan
  // approximation); every other style draws the SVG to canvas.
  const exportDims = (): [number, number] => {
    const s = previewSize();
    if (s !== "auto") return s.map(Math.round) as [number, number];
    // "auto" = whatever the gradient is actually showing — on mobile canvas
    // mode that's the full-bleed element, not the (collapsed) preview box.
    const r = document.getElementById("edit-preview")?.getBoundingClientRect();
    if (r && r.width > 0) return [Math.round(r.width), Math.round(r.height)];
    return containerDims().map(Math.round) as [number, number];
  };
  const exportSvgString = () => {
    const [width, height] = exportDims();
    return generateSvgGradient(
      hexColors(),
      view().style,
      view().angle,
      { seed: seed(), searchString: "" },
      null,
      { width, height },
    );
  };
  const pngBlob = (): Promise<Blob> => {
    const [width, height] = exportDims();
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no 2d context"));
      const finish = () =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
      if (view().style === "angularGradient") {
        const g = ctx.createConicGradient(
          ((view().angle - 90) * Math.PI) / 180,
          width / 2,
          height / 2,
        );
        const cols = hexColors();
        cols.forEach((c, i) => g.addColorStop(cols.length > 1 ? i / (cols.length - 1) : 0, c));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
        finish();
        return;
      }
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        finish();
      };
      img.onerror = () => reject(new Error("svg rasterize failed"));
      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(exportSvgString())))}`;
    });
  };
  const flashCopied = (kind: string) => {
    setCopied(kind);
    clearTimeout(copiedT);
    copiedT = setTimeout(() => setCopied(""), 1200);
    // Announce for screen readers (polite live region in the layout).
    const live = document.getElementById("live");
    if (live) {
      live.textContent = "";
      live.textContent = `Copied ${kind.toUpperCase()} to clipboard`;
    }
  };
  const copyPng = () => {
    void pngBlob()
      .then((blob) => navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]))
      .then(() => {
        const [width, height] = exportDims();
        trackEvent("copy_png", {
          ...gradientEvent(),
          width,
          height,
          colorCount: hexColors().length,
        });
        flashCopied("png");
      })
      .catch(() => {});
  };
  const copyUrl = () => {
    const current = view();
    void navigator.clipboard
      .writeText(
        new URL(
          paletteSharePath(seed(), current.style, current.steps, current.angle),
          location.origin,
        ).toString(),
      )
      .then(() => {
        trackEvent("copy_link", gradientEvent());
        flashCopied("url");
      })
      .catch(() => {});
  };
  const downloadBlob = (blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const downloadSvg = () => {
    const [width, height] = exportDims();
    downloadBlob(
      new Blob([exportSvgString()], { type: "image/svg+xml" }),
      `grabient-${seed().slice(0, 16)}.svg`,
    );
    trackEvent("download_svg", { ...gradientEvent(), width, height });
  };
  const downloadPng = () => {
    void pngBlob()
      .then((b) => {
        const [width, height] = exportDims();
        downloadBlob(b, `grabient-${seed().slice(0, 16)}.png`);
        trackEvent("download_png", { ...gradientEvent(), width, height });
      })
      .catch(() => {});
  };

  // Panels render in body portals with fixed positioning — inside the
  // preview they'd be clipped by the gradient's overflow-hidden rounding.
  const positionFixedPanel = (btn?: HTMLElement, panel?: HTMLElement) => {
    if (!btn || !panel) return;
    const r = btn.getBoundingClientRect();
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    let top = r.bottom + 8;
    if (top + ph > innerHeight - 8 && r.top - ph - 8 > 0) top = r.top - ph - 8;
    panel.style.top = Math.max(8, top) + "px";
    panel.style.left = Math.max(8, Math.min(r.right - pw, innerWidth - pw - 8)) + "px";
  };
  const [dimsOpen, setDimsOpen] = createSignal(false);
  let dimsWrap: HTMLDivElement | undefined;
  let dimsBtn: HTMLButtonElement | undefined;
  let panelEl: HTMLDivElement | undefined;
  const positionPanel = () => positionFixedPanel(dimsBtn, panelEl);
  const [dlOpen, setDlOpen] = createSignal(false);
  let dlWrap: HTMLDivElement | undefined;
  let dlBtn: HTMLButtonElement | undefined;
  let dlPanel: HTMLDivElement | undefined;
  // Bottom-right trigger: the menu opens UPWARD, right-aligned, kept inside
  // the gradient container's bounds so it reads as part of the preview.
  const positionDl = () => {
    if (!dlBtn || !dlPanel) return;
    const r = dlBtn.getBoundingClientRect();
    const bounds = document.getElementById("edit-preview")?.getBoundingClientRect();
    const pw = dlPanel.offsetWidth;
    const ph = dlPanel.offsetHeight;
    let top = r.top - ph - 8;
    if (bounds && top < bounds.top + 8) top = r.bottom + 8;
    let left = r.right - pw;
    if (bounds) left = Math.max(bounds.left + 8, left);
    dlPanel.style.top = Math.max(8, top) + "px";
    dlPanel.style.left = Math.max(8, left) + "px";
  };
  // Mobile dock (canvas mode): duplicate triggers for the dims/download
  // panels — the panels are singletons anchored to whichever button opened
  // them last (dimsBtn/dlBtn are plain refs, reassigned on click).
  let mDimsWrap: HTMLDivElement | undefined;
  let mDlWrap: HTMLDivElement | undefined;
  // The graph overlay (with the swatch strip fused to its bottom) is URL
  // state (?graph=1, island-owned like mod/size) — SSR renders it open on
  // hard loads and popstate restores it; one dock toggle drives both.
  const [graphOn, setGraphOn] = createSignal(
    new URLSearchParams(location.search).get("graph") === "1",
  );
  const applyGraph = (on: boolean) => {
    setGraphOn(on);
    document.getElementById("seed-hero")?.classList.toggle("show-graph", on);
    if (on) window.__fitSwatches?.();
  };
  // Canvas mode is a media query, and the graph's close button has to know
  // about it: below lg with the graph open it moves out of the dock and into
  // the subheader slot the back button vacates.
  const canvasQuery = matchMedia("(width < 64rem)");
  const [canvas, setCanvas] = createSignal(canvasQuery.matches);
  const onCanvasChange = (e: MediaQueryListEvent) => setCanvas(e.matches);
  canvasQuery.addEventListener("change", onCanvasChange);
  onCleanup(() => canvasQuery.removeEventListener("change", onCanvasChange));
  const toggleGraph = () => {
    const next = !graphOn();
    applyGraph(next);
    const q = new URLSearchParams(location.search);
    if (next) q.set("graph", "1");
    else q.delete("graph");
    history.replaceState(history.state, "", location.pathname + (q.size ? `?${q}` : ""));
  };
  // Dock toggle icon = the ACTUAL RGB curves, miniature (original grabient's
  // graph icon approach): sample the live palette per channel.
  const iconPts = (ch: number) => {
    const cg = cosineGradient(12, applied());
    return cg
      .map((c, i) => {
        const x = 2 + (i / (cg.length - 1)) * 20;
        const y = 20 - Math.min(1, Math.max(0, c[ch] ?? 0)) * 16;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  // While a dims/download popup is open, the dock hides every button except
  // the open trigger (CSS keys off .menu-open + aria-expanded).
  createEffect(() => {
    document
      .getElementById("seed-hero")
      ?.classList.toggle("menu-open", dimsOpen() || dlOpen());
  });
  createEffect(() => {
    if (!dimsOpen() && previewSizeHover() !== null) {
      setPreviewSizeHover(null);
      queueMicrotask(applyFit);
    }
  });

  const previewDimensions = (size: PreviewSize | null) => {
    setPreviewSizeHover(size);
    applyFit();
  };

  const clampDim = (raw: string): number | null => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    return Math.max(MIN_DIM, Math.min(MAX_DIM, n));
  };
  const shownDims = (): [number, number] =>
    previewSize() === "auto"
      ? containerDims()
      : (previewSize() as [number, number]);

  // Export-panel input keyboard model (original size-controls): arrows step
  // ±1 (Shift ×10) committing live, Enter commits, Escape reverts.
  const dimKeydown = (axis: 0 | 1, e: KeyboardEvent) => {
    const el = e.currentTarget as HTMLInputElement;
    const other = shownDims()[axis === 0 ? 1 : 0]!;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const cur = Number.parseInt(el.value, 10);
      const base = Number.isFinite(cur) ? cur : shownDims()[axis]!;
      const delta = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1);
      const v = Math.max(MIN_DIM, Math.min(MAX_DIM, base + delta));
      el.value = String(v);
      commitSize(axis === 0 ? [v, other] : [other, v]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const v = clampDim(el.value);
      if (v !== null) commitSize(axis === 0 ? [v, other] : [other, v]);
      else el.value = String(shownDims()[axis]);
      el.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      el.value = String(shownDims()[axis]);
      el.blur();
    }
  };

  // Canvas mode: the full-bleed gradient must END at the sliders sheet's top
  // edge (see --sheet-h in app.css) so radial/angular centers sit in the
  // visible area. Measured live — the sheet's height is content-driven.
  const measureSheet = () => {
    const hero = document.getElementById("seed-hero");
    const card = document.getElementById("editor-card");
    if (!hero || !card) return;
    // Match the CSS breakpoint EXACTLY — rem-based, so a hardcoded px check
    // breaks under user font scaling (64rem > 1024px at >100% font size).
    if (!matchMedia("(width < 64rem)").matches) {
      hero.style.removeProperty("--sheet-h");
      return;
    }
    const inset =
      hero.getBoundingClientRect().bottom - card.getBoundingClientRect().top;
    hero.style.setProperty("--sheet-h", `${Math.max(0, Math.round(inset))}px`);
  };

  onMount(() => {
    syncExportIds();
    const syncStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "export-list") syncExportIds();
    };
    addEventListener("storage", syncStorage);
    onCleanup(() => removeEventListener("storage", syncStorage));
    measureSheet();
    updateStaticSurfaces(seed());
    applyFit();
    const box = document.getElementById("preview-box");
    if (box) {
      const ro = new ResizeObserver(() => {
        const r = box.getBoundingClientRect();
        if (r.width > 0) setContainerDims([Math.round(r.width), Math.round(r.height)]);
        if (previewSize() !== "auto") applyFit();
        measureSheet();
      });
      ro.observe(box);
      onCleanup(() => ro.disconnect());
    }
    const card = document.getElementById("editor-card");
    if (card) {
      const cardRo = new ResizeObserver(measureSheet);
      cardRo.observe(card);
      onCleanup(() => cardRo.disconnect());
    }
    const closeDims = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        dimsOpen() &&
        !(dimsWrap?.contains(t) || mDimsWrap?.contains(t) || panelEl?.contains(t))
      )
        setDimsOpen(false);
      if (dlOpen() && !(dlWrap?.contains(t) || mDlWrap?.contains(t) || dlPanel?.contains(t)))
        setDlOpen(false);
    };
    document.addEventListener("pointerdown", closeDims);
    onCleanup(() => document.removeEventListener("pointerdown", closeDims));
    const closeGraphOnEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || !graphOn()) return;
      e.preventDefault();
      toggleGraph();
    };
    document.addEventListener("keydown", closeGraphOnEscape);
    onCleanup(() => document.removeEventListener("keydown", closeGraphOnEscape));
    const repositionDims = () => {
      if (dimsOpen()) positionPanel();
      if (dlOpen()) positionDl();
    };
    addEventListener("scroll", repositionDims, true);
    addEventListener("resize", repositionDims);
    onCleanup(() => {
      removeEventListener("scroll", repositionDims, true);
      removeEventListener("resize", repositionDims);
      // Don't leave the gradient tint on list pages after a client-side nav.
      document.querySelector('meta[name="theme-color"]')?.remove();
    });

    // Subheader style/steps/angle changes apply IN PLACE on seed pages (no
    // navigation): commit updates state + URL; preview only overlays the view.
    const commit = (fields: Record<string, string>) => {
      const { state, parsed } = resolveFields(fields);
      setCommitted(state);
      setOverlay(null);
      const q = new URLSearchParams(searchString(parsed).replace(/^\?/, ""));
      if (selected()) q.set("mod", selected());
      const sp = sizeParam(previewSize());
      if (sp) q.set("size", sp);
      if (graphOn()) q.set("graph", "1");
      const qs = q.toString() ? `?${q}` : "";
      history.replaceState(history.state, "", `/${seed()}${qs}`);
      updateStaticSurfaces(seed());
      notifyPaletteChange(seed());
    };
    const previewFields = (fields: Record<string, string> | null) => {
      setOverlay(fields ? resolveFields(fields).state : null);
      updateStaticSurfaces(seed());
    };
    // Back/Forward within the seed route restores the palette IN PLACE
    // (undo/redo) — no navigation, no refetch. Returns false for any URL it
    // can't own (list routes, foreign seeds) so the nav layer navigates.
    const handlePop = (): boolean => {
      const m = location.pathname.match(/^\/([^/]+)$/);
      if (!m) return false;
      const nextSeed = decodeURIComponent(m[1]!);
      let p: ReturnType<typeof deserializeCoeffs>;
      try {
        p = deserializeCoeffs(nextSeed);
      } catch {
        return false;
      }
      setCoeffs(p.coeffs);
      setGlobals([...p.globals] as GlobalModifiers);
      setSeed(nextSeed);
      const sp = new URLSearchParams(location.search);
      const ps = parseListSearch(sp);
      setCommitted({
        style: ps.style === "auto" ? DEFAULT_STYLE : ps.style,
        steps: ps.steps === "auto" ? DEFAULT_STEPS : ps.steps,
        angle: ps.angle === "auto" ? DEFAULT_ANGLE : ps.angle,
      });
      setOverlay(null);
      setSelected(v.parse(MOD_PARAM, sp.get("mod") ?? "") || "");
      setPreviewSizeSig(parseSize(sp.get("size")));
      applyGraph(sp.get("graph") === "1");
      applyFit();
      // The next edit must become a NEW entry, never overwrite the restored
      // one; the entry beneath this position is unknown after a jump.
      lastWriteAt = 0;
      prevEntryUrl = null;
      updateStaticSurfaces(nextSeed);
      notifyPaletteChange(nextSeed);
      // Subheader fields mirror the restored URL's params.
      const form = document.getElementById("opts");
      if (form) {
        const angle = form.querySelector<HTMLInputElement>('input[name="angle"]');
        if (angle) {
          angle.value = ps.angle === "auto" ? "" : `${ps.angle}°`;
          angle.classList.toggle("text-foreground!", ps.angle !== "auto");
        }
        const steps = form.querySelector<HTMLInputElement>('input[name="steps"]');
        if (steps) {
          steps.value = ps.steps === "auto" ? "" : String(ps.steps);
          steps.classList.toggle("text-foreground!", ps.steps !== "auto");
        }
        const style = form.querySelector<HTMLSelectElement>('select[name="style"]');
        if (style) {
          style.value = ps.style === "auto" ? "" : ps.style;
          (style as HTMLSelectElement & { __syncLabel?: () => void }).__syncLabel?.();
        }
        (window as { __syncOptsReset?: () => void }).__syncOptsReset?.();
      }
      return true;
    };
    window.__paramsHandler = commit;
    window.__previewHandler = previewFields;
    window.__popstateHandler = handlePop;
    onCleanup(() => {
      if (window.__paramsHandler === commit) delete window.__paramsHandler;
      if (window.__previewHandler === previewFields) delete window.__previewHandler;
      if (window.__popstateHandler === handlePop) delete window.__popstateHandler;
    });
  });

  // Height invariant (matches SSR'd static rows exactly): ALWAYS four rows of
  // identical height. Unselected = the four globals; selected = the chosen
  // global on top + its R/G/B channel rows — same row structure, so selecting
  // a modifier never changes the panel height.
  const ROW = "flex h-12 flex-col gap-1 pointer-coarse:h-[60px]";
  const LABEL_ROW = "flex h-6 items-baseline justify-between";
  const trackModifier = (modifier: Modifier, channel?: string) =>
    trackEvent("change_modifier", {
      ...gradientEvent(),
      modifier: modifier.key,
      ...(channel ? { channel } : {}),
    });

  const globalRow = (m: Modifier) => (
    <div class={`${ROW} group/row`}>
      <div class={LABEL_ROW}>
        <span class="flex min-w-0 items-center gap-2">
        <button
          type="button"
          class={`inline-flex cursor-pointer select-none items-center gap-1.5 text-sm font-bold capitalize transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 ${selected() === m.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          aria-expanded={selected() === m.key}
          data-tip={selected() === m.key ? "Back to all modifiers" : undefined}
          onClick={() => {
            setSelected(selected() === m.key ? "" : m.key);
            writeUrl();
          }}
        >
          <Show when={selected() === m.key}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
          </Show>
          {m.key}
        </button>
        <Show when={globals()[m.idx] !== m.def}>
          <button
            type="button"
            data-tip="Tare — fold into channels"
            aria-label={`Tare ${m.key}: fold its effect into the channels`}
            class="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground opacity-0 transition-[color,opacity] duration-200 outline-none hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/70 group-hover/row:opacity-100 pointer-coarse:opacity-100"
            onClick={() => {
              tare(m);
              trackEvent("tare_modifier", {
                ...gradientEvent(),
                modifier: m.key,
              });
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M22 2 2 22" />
            </svg>
          </button>
        </Show>
        </span>
        <input
          type="number"
          inputmode="decimal"
          class="h-6 w-[72px] border-0 bg-transparent px-1 text-right font-mono text-sm text-muted-foreground transition-colors duration-200 outline-none hover:text-foreground focus:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 [&::-webkit-inner-spin-button]:appearance-none"
          step={STEP}
          min={m.min}
          max={m.max}
          value={globals()[m.idx]!.toFixed(3)}
          aria-label={`${m.key} value`}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={[numberKeydown, m] as never}
          onChange={(e) => {
            if (!setModifier(m, Number(e.currentTarget.value)))
              e.currentTarget.value = globals()[m.idx]!.toFixed(3);
            else trackModifier(m);
          }}
        />
      </div>
      <MidpointSlider
        min={m.min}
        max={m.max}
        value={globals()[m.idx]!}
        label={m.key}
        onValue={(n) => setModifier(m, n)}
        onCommit={() => trackModifier(m)}
      />
    </div>
  );

  const channelRow = (m: Modifier, c: (typeof CHANNELS)[number]) => (
    <div class={ROW}>
      <div class={LABEL_ROW}>
        <span class="select-none font-mono text-sm font-bold" style={{ color: c.color }}>
          {c.label}
        </span>
        <input
          type="number"
          inputmode="decimal"
          class="h-6 w-[72px] border-0 bg-transparent px-1 text-right font-mono text-sm text-muted-foreground transition-colors duration-200 outline-none hover:text-foreground focus:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 [&::-webkit-inner-spin-button]:appearance-none"
          step={STEP}
          min={m.min}
          max={m.max}
          value={(applied()[m.idx]?.[c.ch] ?? 0).toFixed(3)}
          aria-label={`${m.key} ${c.label} channel value`}
          onFocus={(ev) => ev.currentTarget.select()}
          onKeyDown={(ev) => channelKeydown(m, c.ch, ev)}
          onChange={(ev) => {
            const n = Number(ev.currentTarget.value);
            if (Number.isFinite(n)) {
              setChannel(m, c.ch, n);
              trackModifier(m, c.label.toLowerCase());
            }
            else ev.currentTarget.value = (applied()[m.idx]?.[c.ch] ?? 0).toFixed(3);
          }}
        />
      </div>
      <MidpointSlider
        min={m.min}
        max={m.max}
        value={Math.max(m.min, Math.min(m.max, applied()[m.idx]?.[c.ch] ?? 0))}
        color={c.color}
        label={`${m.key} ${c.label} channel`}
        onValue={(n) => setChannel(m, c.ch, n)}
        onCommit={() => trackModifier(m, c.label.toLowerCase())}
      />
    </div>
  );

  const selectedMod = () => MODIFIERS.find((m) => m.key === selected());

  // ---- RGB channel-order tabs (port of the original rgb-tabs.tsx): pills
  // sorted by channel dominance (sum over 10 gradient samples, descending);
  // dragging one onto another SWAPS those channels across all four
  // coefficient rows. Horizontal-only, clamped to the row.
  const tabsMount = document.getElementById("rgb-tabs");
  const actionsMount = document.getElementById("preview-actions");
  const brMount = document.getElementById("preview-actions-br");
  const dockMount = document.getElementById("mobile-dock");
  const graphDockMount = document.getElementById("graph-dock");
  /** Where the graph toggle lives: the subheader once it is a close button. */
  const graphBtnMount = createMemo(() =>
    graphOn() && canvas() && graphDockMount ? graphDockMount : dockMount,
  );
  const tabOrder = createMemo(() => {
    const cols = cosineGradient(10, applied());
    const totals = [0, 0, 0].map((_, ch) => cols.reduce((s, c) => s + (c[ch] ?? 0), 0));
    return [...CHANNELS].sort((a, b) => totals[b.ch]! - totals[a.ch]!);
  });

  const swapChannels = (i: number, j: number) => {
    setCoeffs(
      coeffs().map((row) => {
        const r = [...row];
        const t = r[i]!;
        r[i] = r[j]!;
        r[j] = t;
        return r;
      }) as CosineCoeffs,
    );
    live();
    trackEvent("swap_rgb_channels", {
      ...gradientEvent(),
      firstChannel: CHANNELS[i]?.label,
      secondChannel: CHANNELS[j]?.label,
    });
  };

  // Invert the palette colors (photo-negative): applied a' = 1 - a, b' = -b.
  // In raw space (exposure adds to a, contrast multiplies b) that's
  // a' = 1 - a - 2*exposure and b' = -b — exact under any globals, and
  // applying it twice round-trips back to the original.
  const invertColors = () => {
    const exp = globals()[0] ?? 0;
    setCoeffs(
      coeffs().map((row, i) => {
        if (i > 1) return row;
        const inv = row.slice(0, 3).map((v) => (i === 0 ? 1 - v - 2 * exp : -v));
        return [...inv, row[3] ?? 1];
      }) as CosineCoeffs,
    );
    live();
    trackEvent("invert_palette", gradientEvent());
  };

  const [drag, setDrag] = createSignal<{ ch: number; dx: number; target: number | null } | null>(
    null,
  );
  let tabsRow: HTMLDivElement | undefined;

  const tabPointerDown = (ch: number, e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    if (!tabsRow) return;
    const base = el.getBoundingClientRect();
    const cont = tabsRow.getBoundingClientRect();
    const startX = e.clientX;
    const others = [...tabsRow.children]
      .filter((c) => c !== el)
      .map((c) => ({
        ch: Number((c as HTMLElement).dataset.ch),
        rect: c.getBoundingClientRect(),
      }));
    let started = false;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      let dx = ev.clientX - startX;
      if (!started && Math.abs(dx) < 3) return;
      started = true;
      dx = Math.max(cont.left - base.left, Math.min(cont.right - base.right, dx));
      const center = base.left + dx + base.width / 2;
      const hit = others.find((o) => center >= o.rect.left && center <= o.rect.right);
      setDrag({ ch, dx, target: hit ? hit.ch : null });
      ev.preventDefault();
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      const d = drag();
      setDrag(null);
      if (d && d.target !== null) swapChannels(d.ch, d.target);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const tabKeydown = (ch: number, e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const order = tabOrder();
    const idx = order.findIndex((t) => t.ch === ch);
    const j = e.key === "ArrowLeft" ? idx - 1 : idx + 1;
    if (j < 0 || j >= order.length) return;
    swapChannels(ch, order[j]!.ch);
    queueMicrotask(() => tabsRow?.querySelector<HTMLElement>(`[data-ch="${ch}"]`)?.focus());
  };

  // A component (not a shared JSX const): a lone JSX element is ONE real DOM
  // node, and reusing it across the three tabs moves it — only the last tab
  // would keep its grip.
  const Grip = () => (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
    </svg>
  );

  return (
    <>
      <Show when={tabsMount}>
        {(mount) => (
          <Portal mount={mount()}>
            <div class="flex items-center gap-1" ref={(el) => (tabsRow = el)}>
              <For each={tabOrder()}>
                {(t) => (
                  <button
                    type="button"
                    data-ch={t.ch}
                    data-tip={`${t.label} channel — drag to reorder`}
                    aria-label={`Drag ${t.label} channel to reorder`}
                    class="relative flex h-5 w-9 cursor-grab touch-none items-center rounded-md pl-1.5 text-white/80 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    style={{
                      background: t.color,
                      transform:
                        drag()?.ch === t.ch ? `translateX(${drag()!.dx}px)` : undefined,
                      "z-index": drag()?.ch === t.ch ? "10" : undefined,
                      cursor: drag()?.ch === t.ch ? "grabbing" : undefined,
                      "box-shadow":
                        drag()?.target === t.ch ? "0 0 0 2px var(--color-ring)" : undefined,
                    }}
                    onPointerDown={(e) => tabPointerDown(t.ch, e)}
                    onKeyDown={(e) => tabKeydown(t.ch, e)}
                  >
                    <span class="absolute inset-0 -m-2" aria-hidden="true" />
                    <Grip />
                  </button>
                )}
              </For>
            </div>
            <button
              type="button"
              data-tip="Invert colors"
              aria-label="Invert gradient colors"
              class="ml-2 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-solid border-input bg-background px-2 text-xs font-bold text-muted-foreground transition-colors duration-200 outline-none hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 pointer-coarse:h-9 pointer-coarse:px-3"
              onClick={invertColors}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 18a6 6 0 0 0 0-12z" fill="currentColor" stroke="none" />
              </svg>
              invert
            </button>
          </Portal>
        )}
      </Show>
      <Show when={graphBtnMount()} keyed>
        {(mount) => (
          <Portal mount={mount}>
            <button
              type="button"
              data-graph-toggle
              data-tip={graphOn() ? "Close graph (Esc)" : "Open graph"}
              aria-label={graphOn() ? "Close graph" : "Open graph"}
              aria-keyshortcuts="Escape"
              aria-pressed={graphOn()}
              class={`${DOCK_BTN}${graphOn() ? DOCK_BTN_ON : ""}`}
              onClick={toggleGraph}
            >
              <Show
                when={!graphOn()}
                fallback={
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                }
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points={iconPts(0)} stroke="var(--chart-red)" />
                  <polyline points={iconPts(1)} stroke="var(--chart-green)" />
                  <polyline points={iconPts(2)} stroke="var(--chart-blue)" />
                </svg>
              </Show>
            </button>
          </Portal>
        )}
      </Show>
      {/* The rest of the dock — copy, export, dimensions, download — stays put.
          Only the graph toggle relocates; moving the whole portal dragged every
          one of these into the subheader with it. */}
      <Show when={dockMount}>
        {(mount) => (
          <Portal mount={mount()}>
          <div class="ml-auto flex flex-col items-end gap-2">
          <div class="order-2 flex items-center gap-2" data-mobile-format-actions>
          <button
              type="button"
              data-tip="Copy CSS"
              aria-label="Copy CSS"
              class={DOCK_BTN}
              onClick={() => copyCode("css")}
          >
              <Show
                when={copied() !== "css"}
                fallback={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                }
              >
                <span class="text-[10px] font-bold">CSS</span>
              </Show>
            </button>
            <button
              type="button"
              data-tip="Copy SVG"
              aria-label="Copy SVG"
              class={DOCK_BTN}
              onClick={() => copyCode("svg")}
            >
              <Show
                when={copied() !== "svg"}
                fallback={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                }
              >
                <span class="text-[10px] font-bold">SVG</span>
              </Show>
            </button>
            <button
              type="button"
              data-tip="Copy PNG"
              aria-label="Copy PNG to clipboard"
              class={DOCK_BTN}
              onClick={copyPng}
            >
              <Show
                when={copied() !== "png"}
                fallback={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                }
              >
                <span class="text-[10px] font-bold">PNG</span>
              </Show>
          </button>
            <button
              type="button"
              data-tip="Copy URL"
              aria-label="Copy URL"
              class={DOCK_BTN}
              onClick={copyUrl}
            >
              <Show
                when={copied() !== "url"}
                fallback={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                }
              >
                <span class="text-[10px] font-bold">URL</span>
              </Show>
            </button>
          </div>
          <div class="order-1 flex items-center gap-2" data-mobile-primary-actions>
          <button
              type="button"
              data-seed-export-toggle
              data-tip={exportSelected() ? "Remove from export selection" : "Add to export selection"}
              aria-label={exportSelected() ? "Remove from export selection" : "Add to export selection"}
              aria-pressed={exportSelected()}
              class={`${DOCK_BTN}${exportSelected() ? DOCK_BTN_ON : ""}`}
              onClick={toggleSeedExport}
            >
              <Show
                when={!exportSelected()}
                fallback={
                  <svg class="xp-minus h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M5 12h14" />
                  </svg>
                }
              >
                <svg class="xp-plus h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
              </Show>
            </button>
            <div class="relative" ref={(el) => (mDimsWrap = el)}>
              <button
                type="button"
                data-tip="Preview dimensions"
                aria-label="Preview dimensions"
                aria-haspopup="dialog"
                aria-expanded={dimsOpen()}
                class={`${DOCK_BTN}${previewSize() !== "auto" || dimsOpen() ? DOCK_BTN_ON : ""}`}
                onClick={(e) => {
                  dimsBtn = e.currentTarget;
                  setDimsOpen(!dimsOpen());
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect width="20" height="14" x="2" y="3" rx="2" />
                  <line x1="8" x2="16" y1="21" y2="21" />
                  <line x1="12" x2="12" y1="17" y2="21" />
                </svg>
              </button>
            </div>
            <div class="relative" ref={(el) => (mDlWrap = el)}>
              <button
                type="button"
                data-tip="Download"
                aria-label="Download gradient"
                aria-haspopup="menu"
                aria-expanded={dlOpen()}
                class={`${DOCK_BTN}${dlOpen() ? DOCK_BTN_ON : ""}`}
                onClick={(e) => {
                  dlBtn = e.currentTarget;
                  setDlOpen(!dlOpen());
                }}
                onKeyDown={(e) => {
                  // Menu-button pattern: ArrowDown opens and lands in the menu.
                  if (e.key === "ArrowDown" && !dlOpen()) {
                    e.preventDefault();
                    dlBtn = e.currentTarget;
                    setDlOpen(true);
                  }
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
              </button>
            </div>
            </div>
            </div>
          </Portal>
        )}
      </Show>
      <Show when={brMount}>
        {(mount) => (
          <Portal mount={mount()}>
            <button
              type="button"
              data-tip="Copy CSS"
              aria-label="Copy CSS"
              class={ACTION_BTN}
              onClick={() => copyCode("css")}
            >
              <Show
                when={copied() !== "css"}
                fallback={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                }
              >
                <span class="text-[10px] font-bold">CSS</span>
              </Show>
            </button>
            <button
              type="button"
              data-tip="Copy SVG"
              aria-label="Copy SVG"
              class={ACTION_BTN}
              onClick={() => copyCode("svg")}
            >
              <Show
                when={copied() !== "svg"}
                fallback={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                }
              >
                <span class="text-[10px] font-bold">SVG</span>
              </Show>
            </button>
            <button
              type="button"
              data-tip="Copy PNG"
              aria-label="Copy PNG to clipboard"
              class={ACTION_BTN}
              onClick={copyPng}
            >
              <Show
                when={copied() !== "png"}
                fallback={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                }
              >
                <span class="text-[10px] font-bold">PNG</span>
              </Show>
            </button>
            <button
              type="button"
              data-tip="Copy URL"
              aria-label="Copy URL"
              class={ACTION_BTN}
              onClick={copyUrl}
            >
              <Show
                when={copied() !== "url"}
                fallback={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                }
              >
                <span class="text-[10px] font-bold">URL</span>
              </Show>
            </button>
          </Portal>
        )}
      </Show>
      <Show when={actionsMount}>
        {(mount) => (
          <Portal mount={mount()}>
            <button
              type="button"
              data-seed-export-toggle
              data-tip={exportSelected() ? "Remove from export selection" : "Add to export selection"}
              aria-label={exportSelected() ? "Remove from export selection" : "Add to export selection"}
              aria-pressed={exportSelected()}
              class={`${ACTION_BTN}${exportSelected() ? ACTION_BTN_ON : ""}`}
              onClick={toggleSeedExport}
            >
              <Show
                when={!exportSelected()}
                fallback={
                  <svg class="xp-minus h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M5 12h14" />
                  </svg>
                }
              >
                <svg class="xp-plus h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
              </Show>
            </button>
            <div class="relative" ref={(el) => (dimsWrap = el)}>
              <button
                type="button"
                data-tip="Preview dimensions"
                aria-label="Preview dimensions"
                aria-haspopup="dialog"
                aria-expanded={dimsOpen()}
                ref={(el) => (dimsBtn = el)}
                class={`${ACTION_BTN}${previewSize() !== "auto" || dimsOpen() ? ACTION_BTN_ON : ""}`}
                onClick={(e) => {
                  dimsBtn = e.currentTarget;
                  setDimsOpen(!dimsOpen());
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect width="20" height="14" x="2" y="3" rx="2" />
                  <line x1="8" x2="16" y1="21" y2="21" />
                  <line x1="12" x2="12" y1="17" y2="21" />
                </svg>
              </button>
              <Show when={dimsOpen()}>
                <Portal mount={document.body}>
                <div
                  role="dialog"
                  aria-label="Preview dimensions"
                  class="fixed z-[70] max-h-[60vh] w-56 overflow-y-auto rounded-[10px] border border-solid border-input bg-background/90 p-1.5 shadow-lg backdrop-blur-md"
                  ref={(el) => {
                    panelEl = el;
                    queueMicrotask(() => {
                      positionPanel();
                      // The panel is portaled to document.body, so Tab from
                      // the trigger tours the whole page before reaching it —
                      // move focus inside on open (matches __menu's showMenu).
                      el.querySelector<HTMLElement>("input")?.focus();
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setDimsOpen(false);
                      dimsBtn?.focus();
                    } else if (e.key === "Tab") {
                      // Keep Tab/Shift+Tab cycling inside the dialog while
                      // it's open; leaving it would strand focus on a
                      // portaled element at the end of <body>.
                      const els = panelEl?.querySelectorAll<HTMLElement>("input, button");
                      if (!els || els.length === 0) return;
                      const first = els[0]!;
                      const last = els[els.length - 1]!;
                      if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                      } else if (!e.shiftKey && document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                      }
                    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      // Listbox-style arrows between presets; the dim inputs
                      // keep their own arrow stepping (dimKeydown).
                      const opts = [
                        ...(panelEl?.querySelectorAll<HTMLElement>("[role='option']") ?? []),
                      ];
                      const idx = opts.indexOf(document.activeElement as HTMLElement);
                      if (idx === -1) return;
                      e.preventDefault();
                      const next =
                        e.key === "ArrowDown"
                          ? Math.min(idx + 1, opts.length - 1)
                          : Math.max(idx - 1, 0);
                      opts[next]?.focus();
                    }
                  }}
                >
                  <div class="flex items-center gap-1.5 px-1.5 pb-2 pt-5">
                    <label class="group/dim relative min-w-0 flex-1">
                      <span class="pointer-events-none absolute -top-3.5 left-2 text-[10px] font-bold text-muted-foreground transition-colors duration-150 group-focus-within/dim:text-foreground group-hover/dim:text-foreground">
                        width
                      </span>
                      <input
                        type="text"
                        inputmode="numeric"
                        aria-label="Preview width"
                        value={shownDims()[0]}
                        class="h-7 w-full min-w-0 rounded-md border border-solid border-input bg-background px-2 font-mono text-xs font-semibold text-muted-foreground transition-colors duration-200 outline-none hover:border-muted-foreground/30 hover:text-foreground focus:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => dimKeydown(0, e)}
                        onChange={(e) => {
                          const w = clampDim(e.currentTarget.value);
                          if (w !== null) commitSize([w, shownDims()[1]]);
                          else e.currentTarget.value = String(shownDims()[0]);
                        }}
                      />
                    </label>
                    <span class="shrink-0 text-xs text-muted-foreground">×</span>
                    <label class="group/dim relative min-w-0 flex-1">
                      <span class="pointer-events-none absolute -top-3.5 left-2 text-[10px] font-bold text-muted-foreground transition-colors duration-150 group-focus-within/dim:text-foreground group-hover/dim:text-foreground">
                        height
                      </span>
                      <input
                        type="text"
                        inputmode="numeric"
                        aria-label="Preview height"
                        value={shownDims()[1]}
                        class="h-7 w-full min-w-0 rounded-md border border-solid border-input bg-background px-2 font-mono text-xs font-semibold text-muted-foreground transition-colors duration-200 outline-none hover:border-muted-foreground/30 hover:text-foreground focus:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => dimKeydown(1, e)}
                        onChange={(e) => {
                          const h = clampDim(e.currentTarget.value);
                          if (h !== null) commitSize([shownDims()[0], h]);
                          else e.currentTarget.value = String(shownDims()[1]);
                        }}
                      />
                    </label>
                  </div>
                  <div role="listbox" aria-label="Size presets">
                  <button
                    type="button"
                    class="menu-item"
                    role="option"
                    aria-selected={previewSize() === "auto"}
                    data-preview-dims="auto"
                    onMouseEnter={() => previewDimensions("auto")}
                    onMouseLeave={() => previewDimensions(null)}
                    onFocus={() => previewDimensions("auto")}
                    onBlur={() => previewDimensions(null)}
                    onClick={() => {
                      commitSize("auto");
                      setDimsOpen(false);
                      dimsBtn?.focus();
                    }}
                  >
                    <span class="flex-1 text-left">auto</span>
                  </button>
                  <For each={SIZE_PRESETS}>
                    {(p) => {
                      const isSel = () => {
                        const s = previewSize();
                        return s !== "auto" && s[0] === p.dims[0] && s[1] === p.dims[1];
                      };
                      return (
                        <button
                          type="button"
                          class="menu-item"
                          role="option"
                          aria-selected={isSel()}
                          data-preview-dims={`${p.dims[0]}x${p.dims[1]}`}
                          onMouseEnter={() => previewDimensions(p.dims)}
                          onMouseLeave={() => previewDimensions(null)}
                          onFocus={() => previewDimensions(p.dims)}
                          onBlur={() => previewDimensions(null)}
                          onClick={() => {
                            commitSize(isSel() ? "auto" : p.dims);
                            setDimsOpen(false);
                            dimsBtn?.focus();
                          }}
                        >
                          <span class="flex-1 text-left">{p.label}</span>
                          <span class="font-mono text-[10px] text-muted-foreground">
                            {p.dims[0]}×{p.dims[1]}
                          </span>
                        </button>
                      );
                    }}
                  </For>
                  </div>
                </div>
                </Portal>
              </Show>
            </div>
            <div class="relative" ref={(el) => (dlWrap = el)}>
              <button
                type="button"
                data-tip="Download"
                aria-label="Download gradient"
                aria-haspopup="menu"
                aria-expanded={dlOpen()}
                ref={(el) => (dlBtn = el)}
                class={`${ACTION_BTN}${dlOpen() ? ACTION_BTN_ON : ""}`}
                onClick={(e) => {
                  dlBtn = e.currentTarget;
                  setDlOpen(!dlOpen());
                }}
                onKeyDown={(e) => {
                  // Menu-button pattern: ArrowDown opens and lands in the menu.
                  if (e.key === "ArrowDown" && !dlOpen()) {
                    e.preventDefault();
                    dlBtn = e.currentTarget;
                    setDlOpen(true);
                  }
                }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
              </button>
              <Show when={dlOpen()}>
                <Portal mount={document.body}>
                  <div
                    role="menu"
                    aria-label="Download gradient"
                    class="fixed z-[70] w-40 rounded-[10px] border border-solid border-input bg-background/90 p-1.5 shadow-lg backdrop-blur-md"
                    ref={(el) => {
                      dlPanel = el;
                      queueMicrotask(() => {
                        positionDl();
                        // Portaled to document.body — move focus into the
                        // menu on open, like __menu's showMenu does.
                        el.querySelector<HTMLElement>("[role='menuitem']")?.focus();
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setDlOpen(false);
                        dlBtn?.focus();
                      } else if (e.key === "Tab") {
                        setDlOpen(false);
                      } else if (
                        e.key === "ArrowDown" ||
                        e.key === "ArrowUp" ||
                        e.key === "Home" ||
                        e.key === "End"
                      ) {
                        e.preventDefault();
                        const items = [
                          ...(dlPanel?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []),
                        ];
                        if (items.length === 0) return;
                        const idx = items.indexOf(document.activeElement as HTMLElement);
                        let next = 0;
                        if (e.key === "ArrowDown")
                          next = idx === -1 ? 0 : Math.min(idx + 1, items.length - 1);
                        else if (e.key === "ArrowUp")
                          next = idx === -1 ? items.length - 1 : Math.max(idx - 1, 0);
                        else if (e.key === "End") next = items.length - 1;
                        items[next]?.focus();
                      }
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      class="menu-item"
                      onClick={() => {
                        downloadPng();
                        setDlOpen(false);
                        dlBtn?.focus();
                      }}
                    >
                      Download PNG
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      class="menu-item"
                      onClick={() => {
                        downloadSvg();
                        setDlOpen(false);
                        dlBtn?.focus();
                      }}
                    >
                      Download SVG
                    </button>
                  </div>
                </Portal>
              </Show>
            </div>
          </Portal>
        )}
      </Show>
      <div class="flex flex-col gap-3" role="group" aria-label="Global modifiers">
        <Show
          when={selectedMod()}
          fallback={<For each={MODIFIERS}>{globalRow}</For>}
        >
          {(m) => (
            <>
              {globalRow(m())}
              <For each={CHANNELS as unknown as (typeof CHANNELS)[number][]}>
                {(c) => channelRow(m(), c)}
              </For>
            </>
          )}
        </Show>
      </div>
    </>
  );
}
