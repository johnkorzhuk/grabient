import {
  MAX_ANGLE,
  MAX_STEPS,
  MIN_ANGLE,
  MIN_STEPS,
  PALETTE_STYLES,
  STYLE_LABELS,
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  type PaletteStyle,
} from "@repo/data-ops/valibot-schema/grabient";
import { esc, layout } from "./html";
import { searchString, type ListSearch, type PreviewSize } from "./search";
import { channelsGraphSvg } from "./graph";
import { ICON, LOGO } from "./icons";
import {
  coeffsJsonSnippet,
  colorsSnippet,
  cssSnippet,
  faviconDataUri,
  heroInk,
  hexLuminance,
  renderPalette,
  shadertoySnippet,
  svgSnippet,
} from "./palette";

export type Sort = "popular" | "newest" | "oldest" | "saved";

export interface CardItem {
  seed: string;
  href: string;
  background: string;
  likesCount: number;
  createdAtMs: number;
  // The palette's OWN defaults — the client resolves "auto" against these to
  // re-render card gradients in place (hover preview, instant param commits).
  style: PaletteStyle;
  steps: number;
  angle: number;
}

// Canonical component recipes ported from the current site (CLAUDE.md +
// AppHeader/pagination/card extraction). Class strings must stay literal for
// Tailwind source scanning — never concatenate dynamic fragments.
const BTN =
  "inline-flex select-none items-center justify-center gap-1.5 rounded-md font-bold text-sm h-8.5 pointer-coarse:h-11 px-3 border border-solid bg-background border-input hover:border-muted-foreground/30 hover:bg-background/60 active:border-muted-foreground/40 active:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70";
const BTN_ICON =
  "inline-flex select-none items-center justify-center rounded-md h-8.5 w-8.5 pointer-coarse:h-11 pointer-coarse:w-11 p-0 border border-solid bg-background border-input hover:border-muted-foreground/30 hover:bg-background/60 active:border-muted-foreground/40 active:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70";
// Header icon buttons (theme toggle, eye dropper) match the Sign in button's
// height (h-8) at EVERY breakpoint — no pointer-coarse upsizing, which would
// otherwise blow them up to 44px next to the 32px Sign in on touch devices.
const HEADER_BTN_ICON =
  "inline-flex select-none items-center justify-center rounded-md h-8 w-8 p-0 border border-solid bg-background border-input hover:border-muted-foreground/30 hover:bg-background/60 active:border-muted-foreground/40 active:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70";
const BTN_ACTIVE = "border-muted-foreground/30 text-foreground";
const CTRL =
  "h-8 lg:h-8.5 pointer-coarse:h-11 rounded-md border border-solid border-input bg-background px-2 md:px-3 text-[13px] sm:text-sm pointer-coarse:text-base font-system font-semibold text-muted-foreground hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground focus:border-muted-foreground/30 focus:text-foreground transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/70";

const SORT_LINKS: [Sort, string, string][] = [
  ["popular", "/", "Popular"],
  ["newest", "/newest", "Newest"],
  ["oldest", "/oldest", "Oldest"],
  // Shown to everyone like the current site's NavigationSelect; signed-out
  // users are bounced from /saved to /login server-side.
  ["saved", "/saved", "Saved"],
];

import { relativeAge } from "./relative-age";

// Current-site header: wordmark logo left; theme toggle + auth UI right.
// Palette options live in the nav row below (list pages) or the seed
// controls row — never in the header.
function header(logoColors?: readonly string[]): string {
  return `<header class="sticky top-0 z-50 w-full bg-background">
<div class="mx-auto flex w-full items-center justify-between px-5 py-3 lg:px-14 lg:py-5">
<a data-list-link class="logo text-foreground" href="/">${LOGO(logoColors)}</a>
<div class="flex items-center gap-3 md:gap-6">
<button id="theme-toggle" type="button" aria-label="Toggle theme" data-tip="Toggle theme" data-tip-side="bottom" class="${HEADER_BTN_ICON} relative shrink-0">
<span class="absolute inline-flex rotate-0 scale-100 transition-all duration-300 ease-in-out dark:-rotate-90 dark:scale-0">${ICON.sun("w-[18px] h-[18px]")}</span>
<span class="inline-flex rotate-90 scale-0 transition-all duration-300 ease-in-out dark:rotate-0 dark:scale-100">${ICON.moon("w-[18px] h-[18px]")}</span>
</button>
<span id="auth-slot" class="flex items-center"><a href="/login" data-auth-signin class="inline-flex h-8 cursor-pointer select-none items-center rounded-md border border-transparent bg-foreground/80 px-2.5 text-xs font-medium text-background transition-colors duration-200 outline-none hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring/70">Sign in</a></span>
</div>
</div>
<div class="px-5 lg:px-14"><div class="dashed-rule"></div></div>
</header>`;
}

// Shared subheader: IDENTICAL wrapper + options form on every route; only the
// left slot changes (sort nav on lists, back button on seed) so the controls
// never move when navigating between routes.
function subHeader(left: string, params: ListSearch, path: string, sticky = true): string {
  const styleOptions = [
    `<option value="" hidden${params.style === "auto" ? " selected" : ""}></option>`,
    ...PALETTE_STYLES.map(
      (s) =>
        `<option value="${s}"${params.style === s ? " selected" : ""}>${STYLE_LABELS[s]}</option>`,
    ),
  ].join("");

  return `<div class="subheader ${sticky ? "sticky top-[69px] z-40 md:top-[73px] lg:top-[89px] " : ""}flex items-center justify-between gap-2 px-5 lg:px-14">
${left}
<form id="opts" method="get" action="${esc(path)}" class="-m-1 flex shrink-0 items-center gap-1.5 overflow-x-auto p-1">
<button type="button" id="opts-reset" data-tip="Reset options" data-tip-side="bottom" aria-label="Reset options" class="${BTN_ICON} shrink-0${!sticky || (params.style === "auto" && params.steps === "auto" && params.angle === "auto") ? " hidden" : ""}">${ICON.rotate()}</button>
<span class="ctrl-wrap relative inline-flex shrink-0">
<input type="text" name="angle" inputmode="numeric" autocomplete="off" data-step-keys data-wrap data-suffix="°" data-min="${MIN_ANGLE}" data-max="${MAX_ANGLE}" placeholder="angle" aria-label="Angle" class="${CTRL} w-[84px] pl-3 pr-7 text-left md:w-[96px]${params.angle === "auto" ? "" : " text-foreground!"}" value="${params.angle === "auto" ? "" : `${params.angle}°`}">
<button type="button" tabindex="-1" data-presets="0,45,90,135,180,225,270,315" data-preset-suffix="°" data-tip="Angle presets" data-tip-side="bottom" aria-label="Angle presets" class="preset-btn absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground">${ICON.chevrons()}</button>
</span>
<span class="ctrl-wrap relative inline-flex shrink-0">
<input type="number" name="steps" inputmode="numeric" data-step-keys data-min="${MIN_STEPS}" data-max="${MAX_STEPS}" min="${MIN_STEPS}" max="${MAX_STEPS}" placeholder="steps" aria-label="Steps" class="${CTRL} w-[78px] pl-3 pr-7 text-left md:w-[88px] [&::-webkit-inner-spin-button]:appearance-none${params.steps === "auto" ? "" : " text-foreground!"}" value="${params.steps === "auto" ? "" : params.steps}">
<button type="button" tabindex="-1" data-presets="3,5,8,13,21,34" data-tip="Steps presets" data-tip-side="bottom" aria-label="Steps presets" class="preset-btn absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground">${ICON.chevrons()}</button>
</span>
<span class="ctrl-wrap relative inline-flex shrink-0">
<select name="style" aria-label="Gradient style" data-enhance-select data-allow-clear data-placeholder="style" class="${CTRL} w-[164px] cursor-pointer appearance-none pr-8 lg:w-[184px]${params.style === "auto" ? "" : " text-foreground!"}">${styleOptions}</select>
<span class="native-chevron pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">${ICON.chevrons()}</span>
</span>
<noscript><button class="${BTN}">Apply</button></noscript>
</form>
</div>`;
}

function sortNav(active: Sort, _params: ListSearch): string {
  return `<span class="ctrl-wrap relative inline-flex shrink-0">
<select id="nav-select" aria-label="Browse palettes" data-enhance-select class="${CTRL} w-[110px] cursor-pointer appearance-none pr-8 md:w-[130px]">${SORT_LINKS.map(
    ([sort, href, label]) =>
      `<option value="${href}"${sort === active ? " selected" : ""}>${label}</option>`,
  ).join("")}</select>
<span class="native-chevron pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">${ICON.chevrons()}</span>
</span>`;
}

// Interactive save/like button, ported from the current site's SaveButton:
// count at base size font-medium with pr-4 before a 22px heart; count hidden
// via opacity when 0 (flips to "1" on optimistic like). Liked fill is applied
// by a client-generated stylesheet keyed on data-like-seed, so it survives
// island re-renders. `extra` carries per-context attrs (data-like-current on
// the seed page marks "read seed from the URL at click time").
export function likeButton(
  seed: string,
  style: PaletteStyle,
  steps: number,
  angle: number,
  likesCount: number,
  extra = "",
): string {
  return `<button type="button" data-like-seed="${esc(seed)}" data-like-style="${style}" data-like-steps="${steps}" data-like-angle="${angle}" data-count="${likesCount}"${extra} aria-label="Save palette" class="likes group/like flex cursor-pointer items-center rounded-md text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
<span class="like-count select-none pr-4 font-medium transition-[color,opacity] duration-200${likesCount > 0 ? "" : " opacity-0"}">${likesCount > 0 ? likesCount : 1}</span>
${ICON.heart("heart-i w-[22px] h-[22px] transition-all duration-200")}
</button>`;
}

function card(item: CardItem, nowMs: number, params: ListSearch): string {
  // The like records what the card SHOWS: user-set params override the
  // palette's own values (the current site's effectiveStyle/Steps/Angle).
  const likes = likeButton(
    item.seed,
    params.style === "auto" ? item.style : params.style,
    params.steps === "auto" ? item.steps : params.steps,
    params.angle === "auto" ? item.angle : params.angle,
    item.likesCount,
  );
  return `<li class="relative w-full">
<div class="group relative">
<div class="relative">
<div class="glow invisible absolute -inset-3 z-0 rounded-xl opacity-0 blur-lg transition-[opacity,visibility] duration-300 group-hover:visible group-hover:opacity-40 group-active:visible group-active:opacity-40" style="background:${esc(item.background)}" aria-hidden="true"></div>
<a class="card relative z-10 block h-[300px] overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/70" href="${esc(item.href)}" style="background:${esc(item.background)}" aria-label="Gradient palette ${esc(item.seed)}"></a>
</div>
<div class="flex min-h-[28px] items-center justify-between pt-4">
<span class="text-sm font-medium text-muted-foreground">${relativeAge(item.createdAtMs, nowMs)}</span>
${likes}
</div>
</div>
</li>`;
}

import { pageNumbers } from "./page-numbers";

const PAGE_BTN =
  "inline-flex items-center justify-center rounded-md w-9 h-8.5 px-3 font-bold text-sm border border-solid bg-background border-input hover:border-muted-foreground/30 hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70";

function pagination(params: ListSearch, totalPages: number, path: string): string {
  if (totalPages <= 1) return "";
  const { page } = params;
  const parts = pageNumbers(page, totalPages).map((p) =>
    p === "..."
      ? `<span class="flex h-8.5 w-9 items-center justify-center text-muted-foreground">...</span>`
      : `<a href="${esc(path)}${searchString(params, { page: p })}"${p === page ? ` aria-current="page"` : ""} class="${PAGE_BTN}${p === page ? ` ${BTN_ACTIVE}` : ""}">${p}</a>`,
  );
  return `<nav class="pages mx-auto mt-16 flex w-full items-center justify-center gap-1 py-3" aria-label="Pagination">${parts.join("")}</nav>`;
}

export interface ListPageData {
  sort: Sort;
  path: string;
  params: ListSearch;
  items: CardItem[];
  total: number;
  totalPages: number;
  origin: string;
  nowMs: number;
  stars: number;
  // /saved: per-user page — no grid island (its /api/palettes pagination
  // would fetch the wrong list), SSR pagination only, and an empty state.
  island?: boolean;
  emptyText?: string;
}

const SORT_TITLES: Record<Sort, [string, string]> = {
  popular: ["Grabient — Popular gradient palettes", "Popular gradients"],
  newest: ["Grabient — Newest gradient palettes", "Newest gradients"],
  oldest: ["Grabient — Oldest gradient palettes", "Oldest gradients"],
  saved: ["Grabient — Saved gradient palettes", "Saved gradients"],
};

// Site footer ported from the current site (layout/Footer.tsx + GitHubStars):
// About (external) | Contact | Privacy | Terms | llms.txt | GitHub ★count on
// the left, ©year on the right, dashed rule above. Star count is fetched
// worker-side (4h cache) and SSR'd; 0 hides the star chip like the original.
function formatStars(stars: number): string {
  if (stars >= 1000) return `${(stars / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(stars);
}

const FOOT_LINK =
  "text-muted-foreground hover:text-foreground transition-colors duration-200 text-base sm:text-lg";
const FOOT_SEP = `<div class="h-4 w-px bg-muted-foreground/30"></div>`;

export function footer(stars: number): string {
  const year = new Date().getFullYear();
  const starChip =
    stars > 0
      ? `<span class="flex items-center gap-1 text-base sm:text-lg">${ICON.star()}${formatStars(stars)}</span>`
      : "";
  return `<footer class="relative mt-auto pb-8 pt-0 lg:pb-13">
<div class="px-5 lg:px-14"><div class="dashed-rule"></div></div>
<div class="flex flex-col items-center justify-between gap-4 px-5 pb-2 pt-5 sm:flex-row sm:gap-0 lg:px-14 lg:pt-13">
<div class="flex flex-wrap items-center justify-center gap-3 sm:justify-start sm:gap-6">
<a href="https://iquilezles.org/articles/palettes/" target="_blank" rel="noopener noreferrer" class="${FOOT_LINK}">About</a>
${FOOT_SEP}
<a href="/contact" class="${FOOT_LINK}">Contact</a>
${FOOT_SEP}
<a href="/privacy" class="${FOOT_LINK}">Privacy</a>
${FOOT_SEP}
<a href="/terms" class="${FOOT_LINK}">Terms</a>
${FOOT_SEP}
<a href="/llms.txt" class="${FOOT_LINK}">llms.txt</a>
${FOOT_SEP}
<a href="https://github.com/johnkorzhuk/grabient" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 text-muted-foreground transition-colors duration-200 hover:text-foreground" aria-label="GitHub repository${stars > 0 ? ` - ${stars} stars` : ""}">${ICON.github()}<span class="mr-1 text-base sm:text-lg">GitHub</span>${starChip}</a>
</div>
<div class="text-xs text-muted-foreground sm:text-sm"><span>©${year} Grabient</span></div>
</div>
</footer>`;
}

// List pages: the logo's gradient bar becomes an ambient showcase of the
// palettes on the page — it dwells on one palette, cross-fades to the next,
// and loops. Implemented as SSR'd CSS keyframes on the SVG gradient stops
// (stop-color is an animatable presentation attribute, and CSS animations
// beat presentation attributes in the cascade), so it runs with zero JS and
// is skipped entirely under prefers-reduced-motion. The $seed page instead
// paints the bar with its own palette (header(view.hexColors)).
const LOGO_ANIM_COUNT = 8; // palettes per loop (3s each)

function logoAnimStyle(items: CardItem[]): string {
  const palettes = items
    .slice(0, LOGO_ANIM_COUNT)
    .map((i) => renderPalette(i.seed, i.style, i.steps, i.angle)?.hexColors)
    .filter((h): h is string[] => Array.isArray(h) && h.length > 0)
    // The bar has 3 stops — sample each palette at start / middle / end.
    .map((h) => [h[0], h[Math.floor((h.length - 1) / 2)], h[h.length - 1]]);
  if (palettes.length < 2) return "";

  const n = palettes.length;
  const seg = 100 / n;
  const dwell = seg * 0.6; // hold each palette, then morph over the remainder
  let css = "";
  for (let s = 0; s < 3; s++) {
    const frames: string[] = [];
    for (let i = 0; i < n; i++) {
      const color = palettes[i][s];
      frames.push(
        `${(i * seg).toFixed(2)}%{stop-color:${color}}`,
        `${(i * seg + dwell).toFixed(2)}%{stop-color:${color}}`,
      );
    }
    frames.push(`100%{stop-color:${palettes[0][s]}}`);
    css += `@keyframes logo-s${s}{${frames.join("")}}`;
  }
  css += `@media (prefers-reduced-motion: no-preference){`;
  for (let s = 0; s < 3; s++)
    css += `.logo #logoG stop:nth-of-type(${s + 1}){animation:logo-s${s} ${n * 3}s ease-in-out infinite}`;
  css += `}`;
  return `<style>${css}</style>`;
}

export function listPage(d: ListPageData): string {
  const cards = d.items.map((i) => card(i, d.nowMs, d.params)).join("\n");
  const dataJson = JSON.stringify({
    palettes: d.items,
    total: d.total,
    totalPages: d.totalPages,
    nowMs: d.nowMs,
  }).replace(/</g, "\\u003c");
  const grid =
    d.items.length === 0 && d.emptyText
      ? `<p class="py-16 text-center text-muted-foreground">${esc(d.emptyText)}</p>`
      : `<ol class="grid auto-rows-[300px] grid-cols-1 gap-x-10 gap-y-20 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6">
${cards}
</ol>
${pagination(d.params, d.totalPages, d.path)}`;
  const island =
    d.island === false
      ? ""
      : `<div id="grid-island"></div>
<script type="application/json" id="__DATA__">${dataJson}</script>`;
  const body = `${logoAnimStyle(d.items)}${header()}
${subHeader(sortNav(d.sort, d.params), d.params, d.path)}
<main class="flex-1 px-5 pb-5 pt-5 lg:px-14">
<h1 class="mb-8 text-3xl font-bold text-foreground md:text-4xl">${SORT_TITLES[d.sort][1]}</h1>
<div id="grid-ssr">
${grid}
</div>
${island}
</main>
${footer(d.stars)}`;
  return layout(
    {
      title: SORT_TITLES[d.sort][0],
      description:
        "Browse and grab beautiful cosine gradient palettes. Copy CSS gradients, tweak steps, angles and styles.",
      canonical: `${d.origin}${d.path}${searchString(d.params)}`,
    },
    body,
  );
}

export interface SeedPageData {
  seed: string;
  params: ListSearch;
  size: PreviewSize;
  /** ?graph=1 — the RGB curves overlay is open (canvas mode). */
  graph: boolean;
  origin: string;
  stars: number;
}

function resolveSeedView(d: SeedPageData) {
  const { params } = d;
  return renderPalette(
    d.seed,
    params.style === "auto" ? DEFAULT_STYLE : params.style,
    params.steps === "auto" ? DEFAULT_STEPS : params.steps,
    params.angle === "auto" ? DEFAULT_ANGLE : params.angle,
  );
}

// Equal-width single-row grid — never scrolls; container queries rotate the
// hex labels vertical when chips get narrow (high step counts / small screens).
function swatches(hexColors: string[]): string {
  return `<ul class="swatches grid w-full gap-1.5" style="grid-template-columns:repeat(${hexColors.length},minmax(0,1fr))" aria-label="Palette colors">${hexColors
    .map((hex) => {
      const dark = hexLuminance(hex) > 0.55;
      return `<li class="swatch-item min-w-0"><button type="button" data-copy="${hex}" aria-label="Copy ${hex}" class="${dark ? "on-light" : "on-dark"} flex h-14 w-full cursor-pointer items-center justify-center overflow-hidden rounded-md font-mono text-xs font-semibold shadow-sm outline-none transition-transform duration-150 hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring/70 pointer-coarse:h-16 lg:h-20" style="background:${hex}"><span class="swatch-label">${hex}</span></button></li>`;
    })
    .join("")}</ul>`;
}

const MODIFIER_META: [string, number, number][] = [
  ["exposure", -1, 1],
  ["contrast", 0, 2],
  ["frequency", 0, 2],
  ["phase", -1, 1],
];

// SSR'd modifier rows with correct values/positions — the island replaces
// them with identical-height rows, so mounting causes zero layout shift.
function modifierRowsStatic(globals: readonly number[]): string {
  return `<div class="flex flex-col gap-3">${MODIFIER_META.map(([key, min, max], i) => {
    const v = globals[i] ?? 0;
    const p = (((v - min) / (max - min)) * 100).toFixed(2);
    return `<div class="flex h-11 flex-col pointer-coarse:h-[56px]">
<div class="flex h-6 items-baseline justify-between">
<span class="text-sm font-bold capitalize text-muted-foreground">${key}</span>
<span class="px-1 font-mono text-sm text-muted-foreground">${v.toFixed(3)}</span>
</div>
<div class="mslider text-muted-foreground" style="--p:${p}%;--mid:50%"><div class="mslider-track"></div><div class="mslider-fill"></div><div class="mslider-tick"></div><div class="mslider-thumb"></div></div>
</div>`;
  }).join("")}</div>`;
}

/** Single export-code card: tab bar + one visible panel + a copy button for the active tab. */
function codeTabs(tabs: { id: string; label: string; code: string }[]): string {
  const tabBtns = tabs
    .map(
      (t, i) =>
        `<button type="button" role="tab" id="${t.id}-tab" aria-controls="${t.id}-panel" data-code-tab="${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" class="cursor-pointer select-none whitespace-nowrap rounded-md px-2.5 py-1 font-system text-xs font-semibold text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm">${t.label}</button>`,
    )
    .join("");
  const panels = tabs
    .map(
      (t, i) =>
        `<pre id="${t.id}-panel" role="tabpanel" aria-labelledby="${t.id}-tab" tabindex="0" data-code-panel="${t.id}" class="${i === 0 ? "" : "hidden "}max-h-[420px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/70"><code id="${t.id}">${esc(t.code)}</code></pre>`,
    )
    .join("");
  return `<section id="export-code" class="code min-w-0 overflow-hidden rounded-lg border border-solid border-input">
<div class="flex items-center justify-between gap-3 border-b border-solid border-input bg-muted/50 px-2 py-2 sm:px-3">
<div role="tablist" aria-label="Export format" class="flex min-w-0 items-center gap-1 overflow-x-auto">${tabBtns}</div>
<button type="button" data-copy="${esc(tabs[0]?.code ?? "")}" class="inline-flex h-7 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md border border-solid border-input bg-background px-2.5 text-xs font-semibold text-muted-foreground transition-colors duration-200 outline-none hover:border-muted-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70">${ICON.copy()}<span class="copy-label">Copy</span></button>
</div>
${panels}
</section>`;
}

export function seedPage(d: SeedPageData): string {
  const view = resolveSeedView(d);
  if (!view)
    return layout(
      { title: "Grabient", description: "", canonical: d.origin },
      `${header()}<main class="flex-1 px-5 lg:px-14 py-10"><p>Invalid palette.</p></main>`,
    );

  const graph = channelsGraphSvg(view.appliedCoeffs, view.steps, view.hexColors);
  const search = searchString(d.params, { page: 1 });
  const css = cssSnippet(view, search);
  const svg = svgSnippet(view, search, d.size);

  // Viewport composition (current site): controls row on top, gradient +
  // swatch strip in the left column, graph over sliders in the sidebar; CSS
  // and SVG code below the fold. Small screens stack and scroll naturally.
  const backBtn = `<a data-list-link href="/" class="${BTN_ICON} shrink-0" data-tip="Back to palettes" data-tip-side="bottom" aria-label="Back to palettes">${ICON.arrowLeft()}</a>`;
  const ink = heroInk(view);
  // The header buttons run the ink math over THEIR region (top-right strip).
  const btnInk = heroInk(view, 430, 860, 76, 430 * 0.55, 430);
  // Below lg the hero is "canvas mode": the gradient becomes a full-viewport
  // z:-1 backdrop of #seed-hero (header + controls + stage float over it),
  // driven by CSS in app.css. Desktop layout is untouched.
  const body = `<div id="seed-hero" class="seed-hero hero-ink-${ink.ink} hero-btn-${btnInk.ink}${d.size === "auto" ? "" : " has-size"}${d.graph ? " show-graph" : ""} relative isolate flex min-h-0 flex-1 flex-col">
${header(view.hexColors)}
${subHeader(backBtn, d.params, `/${d.seed}`, false)}
<main class="seed-stage flex min-h-0 flex-col gap-3 px-5 pb-4 lg:h-[calc(100dvh-174px)] lg:min-h-[520px] lg:px-14">
<h1 class="sr-only">Gradient palette editor — ${view.hexColors[0] ?? ""} to ${view.hexColors[view.hexColors.length - 1] ?? ""}</h1>
<div class="seed-cols flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
<div id="preview-box" class="group relative flex min-h-[36dvh] flex-1 lg:min-h-0">
<div id="preview-fit" class="relative m-auto" style="${
    d.size === "auto"
      ? "width:100%;height:100%"
      : `aspect-ratio:${d.size[0]}/${d.size[1]};height:100%;width:auto;max-width:100%;max-height:100%`
  }">
<div class="glow invisible absolute -inset-3 z-0 rounded-lg opacity-0 blur-lg transition-[opacity,visibility] duration-300 group-hover:visible group-hover:opacity-40 group-active:visible group-active:opacity-40 max-lg:hidden" style="background:${esc(view.background)}" aria-hidden="true"></div>
<section id="edit-preview" class="preview relative z-10 h-full w-full overflow-hidden rounded-lg border border-solid border-input" style="background:${esc(view.background)}" aria-label="Gradient preview"></section>
</div>
<div id="preview-actions" class="absolute right-3 top-3 z-30 hidden flex-col items-end gap-2 group-hover:flex group-focus-within:flex pointer-coarse:flex"></div>
<div id="preview-actions-br" class="absolute bottom-3 right-3 z-30 hidden flex-col items-end gap-2 group-hover:flex group-focus-within:flex pointer-coarse:flex"></div>
</div>
<div id="swatches-strip" class="shrink-0 pt-0.5">${swatches(view.hexColors)}</div>
</div>
<aside class="flex min-h-0 shrink-0 flex-col gap-5 lg:w-[340px]">
<section id="graph-panel" class="min-h-[180px] flex-1 overflow-hidden rounded-lg border border-solid border-input p-3 lg:max-h-[340px]">${graph}</section>
<div id="mobile-dock" class="lg:hidden"></div>
<div id="editor-card" class="lg:contents">
<div id="tabs-row" class="-mt-2 flex items-start justify-between">
<div id="rgb-tabs" class="flex h-7 items-center pointer-coarse:h-9" aria-label="Channel order and invert"></div>
${likeButton(d.seed, view.style, view.steps, view.angle, 0, " data-like-current data-like-info")}
</div>
<div id="editor-island" class="shrink-0 lg:mt-auto" data-seed="${esc(d.seed)}" data-style="${view.style}" data-steps="${view.steps}" data-angle="${view.angle}">${modifierRowsStatic(view.globals)}</div>
</div>
<noscript><p class="text-sm text-muted-foreground">Live editing requires JavaScript.</p></noscript>
</aside>
</div>
</main>
</div>
<section class="px-5 pb-14 pt-10 lg:px-14" aria-label="Export code">
${codeTabs([
  { id: "css-code", label: "CSS", code: css },
  { id: "svg-code", label: "SVG", code: svg },
  { id: "colors-code", label: "Colors", code: colorsSnippet(view.hexColors) },
  { id: "shader-code", label: "ShaderToy", code: shadertoySnippet(view, d.seed, search) },
  { id: "coeffs-code", label: "JSON", code: coeffsJsonSnippet(view.appliedCoeffs) },
])}
</section>
${footer(d.stars)}`;

  return layout(
    {
      title: `Grabient — ${view.hexColors[0] ?? ""} → ${view.hexColors[view.hexColors.length - 1] ?? ""} gradient`,
      description: `Cosine gradient palette with ${view.steps} stops: ${view.hexColors.join(", ")}. Copy as CSS or SVG.`,
      canonical: `${d.origin}/${d.seed}${searchString(d.params)}`,
      favicon: faviconDataUri(view),
      themeColor: ink.avgHex,
    },
    body,
  );
}

// Static pages linked from the footer (header, no subheader — the original's
// AppLayout showNavigation={false}). Content HTML comes from src/legal.ts.
export function legalPage(d: {
  title: string;
  description: string;
  path: string;
  origin: string;
  content: string;
  stars: number;
}): string {
  const body = `${header()}
<main class="flex-1 pb-5 pt-12">
${d.content}
</main>
${footer(d.stars)}`;
  return layout(
    { title: d.title, description: d.description, canonical: `${d.origin}${d.path}` },
    body,
  );
}

// Sign-in page ported from the current site's /login: Google OAuth button,
// dashed divider whose label doubles as the status line ("Or continue with
// email" -> "Check your email" / error), magic-link email form, terms note.
// Client behavior (app.client.js) drives better-auth's REST endpoints
// directly — no SDK in the bundle.
const LOGIN_BTN =
  "inline-flex h-10 w-full cursor-pointer select-none items-center justify-center rounded-md border border-solid border-input bg-background px-3 font-system text-base font-medium text-muted-foreground transition-colors duration-200 outline-none hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input disabled:hover:bg-background disabled:hover:text-muted-foreground";

export function loginPage(d: { redirect: string | null; origin: string; stars: number }): string {
  const body = `${header()}
<main class="flex flex-1 items-center justify-center p-4">
<div class="w-full max-w-md pb-16">
<h1 class="mb-6 text-center text-2xl font-bold text-foreground">Welcome to Grabient</h1>
<div class="space-y-4">
<button type="button" id="login-google" class="${LOGIN_BTN}"><img src="/Google.svg" alt="" class="mr-2 h-5 w-5">Sign in with Google</button>
<form id="login-form" novalidate data-redirect="${esc(d.redirect ?? "")}">
<div class="space-y-4">
<div class="space-y-2">
<div class="relative mb-3">
<div class="absolute inset-0 flex items-center"><div class="h-px w-full" style="background-image:linear-gradient(to right, var(--ring) 0%, var(--ring) 2px, transparent 2px, transparent 12px);background-size:6px 1px"></div></div>
<div class="relative flex justify-center text-xs uppercase"><span id="login-divider" class="bg-background px-2 font-system font-bold text-muted-foreground">Or continue with email</span></div>
</div>
<input id="login-email" name="email" type="email" placeholder="name@example.com" autocomplete="email" aria-label="Email" class="${FIELD}">
</div>
<button type="submit" id="login-send" disabled class="${LOGIN_BTN}">Send magic link</button>
</div>
</form>
<p class="text-center font-system text-xs text-muted-foreground">By continuing, you agree to our <a href="/terms" class="underline transition-colors duration-200 hover:text-foreground">Terms of Service</a> and <a href="/privacy" class="underline transition-colors duration-200 hover:text-foreground">Privacy Policy</a>.</p>
</div>
</div>
</main>
${footer(d.stars)}`;
  return layout(
    {
      title: "Sign in — Grabient",
      description: "Sign in to Grabient to save your favorite gradient palettes.",
      canonical: `${d.origin}/login`,
    },
    body,
  );
}

// Contact page: same copy and field styling as the current site's /contact.
// The original submits through Turnstile + Resend, which need secrets this
// worker doesn't hold — the form composes a mailto to the same inbox instead
// (app.client.js #contact-form handler).
const FIELD =
  "w-full h-10 px-3 text-sm bg-background border border-solid border-input rounded-md text-foreground placeholder:text-muted-foreground hover:border-muted-foreground/50 hover:bg-background/60 focus:border-muted-foreground/70 focus:bg-background/60 outline-none transition-colors duration-200";

export function contactContent(): string {
  return `<div class="container mx-auto flex min-h-[500px] max-w-2xl flex-col justify-center px-5 py-8 lg:px-14">
<div class="space-y-6">
<div class="space-y-3 pb-6 text-center">
<h1 class="text-3xl font-bold text-foreground">Contact Us</h1>
<p class="text-muted-foreground">We'd love to hear from you. Send us a message and we'll respond as soon as possible.</p>
</div>
<form id="contact-form" class="space-y-5">
<div class="space-y-2">
<label for="contact-email" class="text-sm font-medium text-foreground">Email</label>
<input id="contact-email" name="email" type="email" autocomplete="email" class="${FIELD}" placeholder="your.email@example.com">
</div>
<div class="space-y-2">
<label for="contact-subject" class="text-sm font-medium text-foreground">Subject</label>
<span class="ctrl-wrap relative block">
<select id="contact-subject" name="subject" class="${FIELD} cursor-pointer appearance-none pr-10">
<option value="" selected>Select a subject</option>
<option value="Feedback">Feedback</option>
<option value="Bug Report">Bug Report</option>
<option value="Feature Request">Feature Request</option>
</select>
<span class="native-chevron pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">${ICON.chevrons()}</span>
</span>
</div>
<div class="space-y-2">
<label for="contact-message" class="text-sm font-medium text-foreground">Message*</label>
<textarea id="contact-message" name="message" rows="6" required minlength="10" class="${FIELD} h-auto resize-none py-2" placeholder="Your message (required, min. 10 characters)"></textarea>
</div>
<button type="submit" class="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-solid border-input bg-background px-3 text-base font-medium text-muted-foreground transition-colors duration-200 outline-none hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70">Send Message</button>
</form>
</div>
</div>`;
}
