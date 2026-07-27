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
import { logoAnimationCss } from "./logo-animation";
import { paletteOgImageUrl } from "./seo";
import {
  colorTextParts,
  querySlug,
  type QueryHeadingPart,
  type QueryResultContext,
} from "./semantic-search";
import {
  POPULAR_SEARCHES,
  type PopularSearchSuggestion,
} from "./popular-searches";
import {
  coeffsJsonSnippet,
  colorsSnippet,
  cssSnippet,
  exportItemData,
  faviconDataUri,
  heroInk,
  hexLuminance,
  paletteCoeffKey,
  renderPalette,
  shadertoySnippet,
  svgSnippet,
} from "./palette";

export type Sort = "popular" | "newest" | "oldest" | "saved";

export interface CardItem {
  /** The stored row id — likes are INSERTed under it so counts keep joining. */
  seed: string;
  /** Coefficient key — heart fill + toggle identity across seed aliases. */
  key: string;
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

// Canonical component recipes (BTN/CTRL/likeButton/exportToggle/...) live in
// buttons.ts, shared with the client export module. Class strings must stay
// literal for Tailwind source scanning — never concatenate dynamic fragments.
import {
  BTN,
  BTN_ACTIVE,
  BTN_ICON,
  CTRL,
  HEADER_BTN_ICON,
  exportToggle,
  likeButton,
  paletteCardActions,
  searchFeedbackButtons,
} from "./buttons";

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
//
// The auth slot SSRs as a neutral placeholder circle (a link, so no-JS still
// reaches /login): cached pages are identical for every visitor, and rendering
// "Sign in" there made signed-in users watch it flash into an avatar on boot.
// The client swaps the circle for the Sign in button (signed out) or the
// avatar (signed in). Per-user pages (/saved, /settings) KNOW the session
// server-side and pass `user` to render the avatar directly — no swap at all.
export interface HeaderUser {
  username?: string | null;
  email?: string | null;
  image?: string | null;
}

function avatarHtml(u: HeaderUser): string {
  const face = u.image
    ? `<img src="${esc(u.image)}" alt="" referrerpolicy="no-referrer" class="h-full w-full rounded-full object-cover">`
    : `<span class="flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">${esc((u.username || u.email || "?").charAt(0).toUpperCase())}</span>`;
  return `<button id="avatar-btn" type="button" aria-label="User menu" aria-haspopup="menu" aria-expanded="false" class="h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-solid border-input outline-none transition-colors duration-200 hover:border-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/70">${face}</button>`;
}

function header(logoColors?: readonly string[], user?: HeaderUser | null): string {
  const auth = user
    ? avatarHtml(user)
    : `<a href="/login" data-auth-signin data-auth-placeholder aria-label="Sign in" class="block h-8 w-8 cursor-pointer rounded-full border border-solid border-input bg-muted transition-colors duration-200 hover:border-muted-foreground/40"></a>`;
  return `<header class="sticky top-0 z-50 w-full bg-background">
<div class="mx-auto flex w-full items-center justify-between px-5 py-3 lg:px-14 lg:py-5">
<a data-list-link class="logo text-foreground" href="/">${LOGO(logoColors)}</a>
<div class="flex items-center gap-3 md:gap-6">
<button id="theme-toggle" type="button" aria-label="Toggle theme" aria-keyshortcuts="Control+K Meta+K" data-tip="Toggle theme (Ctrl/⌘ K)" data-tip-side="bottom" class="${HEADER_BTN_ICON} relative shrink-0">
<span class="absolute inline-flex rotate-0 scale-100 transition-all duration-300 ease-in-out dark:-rotate-90 dark:scale-0">${ICON.sun("w-[18px] h-[18px]")}</span>
<span class="inline-flex rotate-90 scale-0 transition-all duration-300 ease-in-out dark:rotate-0 dark:scale-100">${ICON.moon("w-[18px] h-[18px]")}</span>
</button>
<span id="auth-slot" class="flex items-center">${auth}</span>
</div>
</div>
<div class="px-5 lg:px-14"><div class="dashed-rule"></div></div>
</header>`;
}

// Shared subheader: IDENTICAL wrapper + options form on every route; only the
// left slot changes (sort nav on lists, back button on seed) so the controls
// never move when navigating between routes.
function subHeader(
  left: string,
  params: ListSearch,
  path: string,
  sticky = true,
  exportOpen = false,
  hiddenFields = "",
  mobileOptionsDocked = false,
): string {
  const styleOptions = [
    `<option value="" hidden${params.style === "auto" ? " selected" : ""}></option>`,
    ...PALETTE_STYLES.map(
      (s) =>
        `<option value="${s}"${params.style === s ? " selected" : ""}>${STYLE_LABELS[s]}</option>`,
    ),
  ].join("");

  return `<div class="subheader${mobileOptionsDocked ? " mobile-options-docked" : ""} ${sticky ? "sticky top-[69px] z-40 md:top-[73px] lg:top-[89px] " : ""}flex items-center px-5 lg:px-14">
<form id="opts" data-palette-options method="get" action="${esc(path)}" class="flex w-full min-w-0 items-center gap-1.5">
<span class="subheader-left flex min-w-0 shrink-0 items-center">${left}</span>
${hiddenFields}
<button type="button" id="opts-reset" data-tip="Reset options" data-tip-side="bottom" aria-label="Reset options" class="${BTN_ICON} shrink-0${exportOpen || !sticky || (params.style === "auto" && params.steps === "auto" && params.angle === "auto") ? " hidden" : ""}">${ICON.rotate()}</button>
<span class="ctrl-wrap angle-wrap relative inline-flex shrink-0">
<input type="text" name="angle" inputmode="numeric" autocomplete="off" data-step-keys data-wrap data-suffix="°" data-min="${MIN_ANGLE}" data-max="${MAX_ANGLE}" placeholder="angle" aria-label="Angle" class="${CTRL} w-[84px] pl-3 pr-7 text-left md:w-[96px]${params.angle === "auto" ? "" : " text-foreground!"}" value="${params.angle === "auto" ? "" : `${params.angle}°`}"${exportOpen ? " disabled" : ""}>
<button type="button" tabindex="-1" data-presets="0,45,90,135,180,225,270,315" data-preset-suffix="°" data-tip="Angle presets" data-tip-side="bottom" aria-label="Angle presets" class="preset-btn absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"${exportOpen ? " disabled" : ""}>${ICON.chevrons()}</button>
</span>
<span class="ctrl-wrap steps-wrap relative inline-flex shrink-0">
<input type="number" name="steps" inputmode="numeric" data-step-keys data-min="${MIN_STEPS}" data-max="${MAX_STEPS}" min="${MIN_STEPS}" max="${MAX_STEPS}" placeholder="steps" aria-label="Steps" class="${CTRL} w-[78px] pl-3 pr-7 text-left md:w-[88px] [&::-webkit-inner-spin-button]:appearance-none${params.steps === "auto" ? "" : " text-foreground!"}" value="${params.steps === "auto" ? "" : params.steps}"${exportOpen ? " disabled" : ""}>
<button type="button" tabindex="-1" data-presets="3,5,8,13,21,34" data-tip="Steps presets" data-tip-side="bottom" aria-label="Steps presets" class="preset-btn absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"${exportOpen ? " disabled" : ""}>${ICON.chevrons()}</button>
</span>
<span class="ctrl-wrap style-wrap relative inline-flex shrink-0">
<select name="style" aria-label="Gradient style" data-enhance-select data-allow-clear data-placeholder="style" class="${CTRL} w-[164px] cursor-pointer appearance-none pr-8 lg:w-[184px]${params.style === "auto" ? "" : " text-foreground!"}"${exportOpen ? " disabled" : ""}>${styleOptions}</select>
<span class="native-chevron pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">${ICON.chevrons()}</span>
</span>
<noscript><button class="${BTN}">Apply</button></noscript>
</form>
</div>`;
}

function mobilePaletteOptions(
  params: ListSearch,
  exportOpen = false,
): string {
  const styleOptions = [
    `<option value="" hidden${params.style === "auto" ? " selected" : ""}></option>`,
    ...PALETTE_STYLES.map(
      (style) =>
        `<option value="${style}"${params.style === style ? " selected" : ""}>${STYLE_LABELS[style]}</option>`,
    ),
  ].join("");
  const disabled = exportOpen ? " disabled" : "";

  return `<form id="opts-mobile" data-palette-options class="flex w-full min-w-0 items-center gap-2">
<span class="ctrl-wrap style-wrap relative inline-flex min-w-0 flex-[1.1]">
<select name="style" aria-label="Gradient style" data-enhance-select data-allow-clear data-placeholder="style" class="${CTRL} w-full min-w-0 cursor-pointer appearance-none pr-8${params.style === "auto" ? "" : " text-foreground!"}"${disabled}>${styleOptions}</select>
<span class="native-chevron pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">${ICON.chevrons()}</span>
</span>
<span class="ctrl-wrap angle-wrap relative inline-flex min-w-0 flex-1">
<input type="text" name="angle" inputmode="numeric" autocomplete="off" data-step-keys data-wrap data-suffix="°" data-min="${MIN_ANGLE}" data-max="${MAX_ANGLE}" placeholder="angle" aria-label="Angle" class="${CTRL} w-full min-w-0 pl-3 pr-7 text-left${params.angle === "auto" ? "" : " text-foreground!"}" value="${params.angle === "auto" ? "" : `${params.angle}°`}"${disabled}>
<button type="button" tabindex="-1" data-presets="0,45,90,135,180,225,270,315" data-preset-suffix="°" data-tip="Angle presets" data-tip-side="top" aria-label="Angle presets" class="preset-btn absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"${disabled}>${ICON.chevrons()}</button>
</span>
<span class="ctrl-wrap steps-wrap relative inline-flex min-w-0 flex-1">
<input type="number" name="steps" inputmode="numeric" data-step-keys data-min="${MIN_STEPS}" data-max="${MAX_STEPS}" min="${MIN_STEPS}" max="${MAX_STEPS}" placeholder="steps" aria-label="Steps" class="${CTRL} w-full min-w-0 pl-3 pr-7 text-left [&::-webkit-inner-spin-button]:appearance-none${params.steps === "auto" ? "" : " text-foreground!"}" value="${params.steps === "auto" ? "" : params.steps}"${disabled}>
<button type="button" tabindex="-1" data-presets="3,5,8,13,21,34" data-tip="Steps presets" data-tip-side="top" aria-label="Steps presets" class="preset-btn absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"${disabled}>${ICON.chevrons()}</button>
</span>
</form>`;
}

function sortNav(active: Sort, _params: ListSearch, exportOpen = false): string {
  return `<span class="ctrl-wrap browse-wrap relative inline-flex min-w-0 shrink">
<select id="nav-select" aria-label="Browse palettes" data-enhance-select class="${CTRL} w-[110px] cursor-pointer appearance-none pr-8 md:w-[130px]"${exportOpen ? " disabled" : ""}>${SORT_LINKS.map(
    ([sort, href, label]) =>
      `<option value="${href}"${sort === active ? " selected" : ""}>${label}</option>`,
  ).join("")}</select>
<span class="native-chevron pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">${ICON.chevrons()}</span>
</span>`;
}

export type SearchSort = "popular" | "newest" | "oldest";

export function searchSortNav(active: SearchSort, exportOpen = false): string {
  const options: [SearchSort, string][] = [
    ["popular", "Popular"],
    ["newest", "Newest"],
    ["oldest", "Oldest"],
  ];
  return `<span class="ctrl-wrap browse-wrap relative inline-flex min-w-0 shrink">
<select id="query-sort" aria-label="Sort search results" data-enhance-select class="${CTRL} w-[110px] cursor-pointer appearance-none pr-8 md:w-[130px]"${exportOpen ? " disabled" : ""}>${options
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === active ? " selected" : ""}>${label}</option>`,
    )
    .join("")}</select>
<span class="native-chevron pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">${ICON.chevrons()}</span>
</span>`;
}

export function searchSubheaderLeft(
  active: SearchSort,
  backHref: string,
  exportOpen = false,
): string {
  return `<span class="search-nav-wrap flex min-w-0 shrink items-center gap-2">
<a href="${esc(backHref)}" data-list-link aria-label="Back to palettes" data-tip="Back to palettes" data-tip-side="bottom" class="${BTN_ICON} shrink-0">${ICON.arrowLeft("h-[18px] w-[18px]")}</a>
${searchSortNav(active, exportOpen)}
</span>`;
}

function card(
  item: CardItem,
  nowMs: number,
  params: ListSearch,
  searchQuery?: string,
): string {
  // The like records what the card SHOWS: user-set params override the
  // palette's own values (the current site's effectiveStyle/Steps/Angle).
  const effStyle = params.style === "auto" ? item.style : params.style;
  const effSteps = params.steps === "auto" ? item.steps : params.steps;
  const effAngle = params.angle === "auto" ? item.angle : params.angle;
  const likes = likeButton(item.seed, item.key, effStyle, effSteps, effAngle, item.likesCount);
  const exp = exportItemData(item.seed, effStyle, effSteps, effAngle);
  const view = renderPalette(item.seed, effStyle, effSteps, effAngle);
  const first = view?.hexColors[0] ?? "custom colors";
  const last = view?.hexColors.at(-1) ?? "custom colors";
  const description = `${first} to ${last} ${STYLE_LABELS[effStyle].toLowerCase()} with ${effSteps} colors`;
  return `<li class="relative w-full">
<div class="group relative">
<div data-palette-card data-palette-seed="${esc(item.seed)}" data-palette-style="${effStyle}" data-palette-steps="${effSteps}" data-palette-angle="${effAngle}" class="palette-card relative">
<div class="glow invisible absolute -inset-3 z-0 rounded-xl opacity-0 blur-lg transition-[opacity,visibility] duration-300 group-hover:visible group-hover:opacity-40 group-active:visible group-active:opacity-40" style="background:${esc(item.background)}" aria-hidden="true"></div>
<div class="card relative z-10 block h-[300px] overflow-hidden rounded-xl" style="background:${esc(item.background)}" role="img" aria-label="Gradient palette: ${esc(description)}"></div>
${paletteCardActions(item.href, description)}
${exp ? exportToggle(exp.id, item.seed, effStyle, effSteps, effAngle, true) : ""}
${searchQuery ? searchFeedbackButtons(searchQuery, item.seed) : ""}
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

function pagination(
  params: ListSearch,
  totalPages: number,
  path: string,
  extraSearch: Record<string, string> = {},
): string {
  if (totalPages <= 1) return "";
  const { page } = params;
  const href = (nextPage: number) => {
    const search = new URLSearchParams(searchString(params, { page: nextPage }).slice(1));
    for (const [key, value] of Object.entries(extraSearch)) {
      if (value) search.set(key, value);
    }
    return `${path}${search.size ? `?${search}` : ""}`;
  };
  const parts = pageNumbers(page, totalPages).map((p) =>
    p === "..."
      ? `<span class="flex h-8.5 w-9 items-center justify-center text-muted-foreground">...</span>`
      : `<a href="${esc(href(p))}"${p === page ? ` aria-current="page"` : ""} class="${PAGE_BTN}${p === page ? ` ${BTN_ACTIVE}` : ""}">${p}</a>`,
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
  // Per-user pages pass the session user so the header SSRs the avatar
  // directly (cached pages omit it and get the placeholder circle).
  user?: HeaderUser | null;
  /** Render list controls disabled while the persisted export view boots. */
  exportOpen?: boolean;
  /** Search pages reuse the list renderer with route-specific chrome/meta. */
  heading?: string;
  headingParts?: QueryHeadingPart[];
  pageTitle?: string;
  pageDescription?: string;
  pageCanonical?: string;
  pageImage?: string;
  pageImageAlt?: string;
  pageRobots?: string;
  pageStructuredData?: Record<string, unknown> | Record<string, unknown>[];
  subheaderLeft?: string;
  hiddenFields?: string;
  paginationSearch?: Record<string, string>;
  searchQuery?: string;
  /** Query attached to per-result relevance controls (without filling search). */
  feedbackQuery?: string;
  queryContext?: QueryResultContext | null;
  /** Hour-stable suggestions supplied by the cached provider. */
  popularSearches?: readonly PopularSearchSuggestion[];
}

const SORT_TITLES: Record<Sort, [string, string]> = {
  popular: ["Grabient — Gradient Generator & Color Palettes", "Popular palettes"],
  newest: ["Grabient — Newest Gradient Palettes", "Newest palettes"],
  oldest: ["Grabient — Classic Gradient Palettes", "Oldest palettes"],
  saved: ["Grabient — Saved Gradient Palettes", "Saved palettes"],
};

const SORT_DESCRIPTIONS: Record<Sort, string> = {
  popular:
    "Create CSS gradients and explore popular color palettes. Adjust colors, steps, angles, and styles, then copy CSS or export SVG and PNG.",
  newest:
    "Browse the newest CSS gradient palettes, customize their colors and settings, then copy CSS or export SVG and PNG.",
  oldest:
    "Explore Grabient's original CSS gradient palettes, customize each gradient, and export it as CSS, SVG, or PNG.",
  saved: "Review and customize the gradient palettes saved to your Grabient account.",
};

function listCanonicalSearch(params: ListSearch): string {
  return params.page > 1 ? `?page=${params.page}` : "";
}

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
function logoAnimStyle(items: CardItem[], params: ListSearch): string {
  const palettes = items
    .map((i) =>
      renderPalette(
        i.seed,
        params.style === "auto" ? i.style : params.style,
        params.steps === "auto" ? i.steps : params.steps,
        params.angle === "auto" ? i.angle : params.angle,
      )?.hexColors,
    )
    .filter((h): h is string[] => Array.isArray(h) && h.length > 0);
  const css = logoAnimationCss(palettes, "logo-list");
  return css ? `<style id="logo-list-animation">${css}</style>` : "";
}

function popularQueryContent(suggestion: PopularSearchSuggestion): string {
  const inferred = colorTextParts(suggestion.query)
    .filter((part) => part.kind === "color")
    .map(({ hex }) => hex);
  const colors = suggestion.swatches?.length ? suggestion.swatches : inferred;
  if (!colors.length) return esc(suggestion.query);
  const swatches = colors
    .map(
      (hex) =>
        `<span title="${esc(hex)}" class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-input" style="background-color:${esc(hex)}"></span>`,
    )
    .join("");
  return `<span aria-hidden="true" class="inline-flex items-center gap-0.5">${swatches}</span><span>${esc(suggestion.query)}</span>`;
}

function searchExplorer(
  currentQuery = "",
  params?: ListSearch,
  suggestions: readonly PopularSearchSuggestion[] = POPULAR_SEARCHES.map((query) => ({
    query,
  })),
  placement: "desktop" | "mobile" = "desktop",
  mobileOptions = "",
): string {
  const mobile = placement === "mobile";
  const suffix = mobile ? "-mobile" : "";
  const sectionClass = mobile
    ? "mobile-search-dock fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-4 border-t border-dashed border-border bg-background px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 md:hidden"
    : "mb-12 hidden flex-col items-center gap-5 md:flex";
  const formClass = mobile ? "relative w-full" : "relative w-full max-w-lg";
  const suggestionsClass = mobile
    ? "flex w-full items-center gap-2 overflow-hidden"
    : "flex w-full max-w-3xl items-center gap-2 overflow-hidden";
  const search = new URLSearchParams();
  if (params && params.style !== "auto") search.set("style", params.style);
  if (params && params.steps !== "auto") search.set("steps", String(params.steps));
  if (params && params.angle !== "auto") search.set("angle", String(params.angle));
  const options = search.size ? `?${search}` : "";
  const popular = suggestions.map(
    (suggestion) =>
      `<a data-search-tag href="/palettes/${querySlug(suggestion.query)}${esc(options)}" class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-solid border-input bg-background px-3.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground md:text-xs">${popularQueryContent(suggestion)}</a>`,
  ).join("");
  return `<section data-search-placement="${placement}" aria-label="Find gradient palettes" class="${sectionClass}">
${mobileOptions}
<form id="palette-search${suffix}" data-palette-search action="/palettes" method="get" role="search" class="${formClass}">
<label for="palette-search-input${suffix}" class="sr-only">Search gradient palettes</label>
<span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground md:left-4">${ICON.search("h-[18px] w-[18px] md:h-5 md:w-5")}</span>
<input id="palette-search-input${suffix}" name="q" type="text" value="${esc(currentQuery)}" data-palette-search-input required autocomplete="off" enterkeyhint="search" placeholder="Search palettes..." class="${CTRL} h-10 w-full rounded-full pl-10 pr-9 text-sm text-foreground placeholder:text-muted-foreground placeholder:opacity-55 focus:placeholder:opacity-0 md:h-11 md:pl-11 md:pr-10 md:text-base">
<button type="button" data-search-clear aria-label="Clear search" class="${currentQuery ? "" : "hidden "}absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 md:right-4">${ICON.x("h-5 w-5")}</button>
</form>
<div class="${suggestionsClass}">
<span class="hidden shrink-0 text-sm font-medium text-muted-foreground md:inline">Popular</span>
<nav data-drag-scroll aria-label="Popular palette searches" class="flex min-w-0 flex-1 cursor-grab touch-pan-x select-none gap-1.5 overflow-x-auto active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">${popular}</nav>
</div>
</section>`;
}

function queryContext(context: QueryResultContext, params: ListSearch): string {
  if (context.kind === "seed") {
    const href = `/${encodeURIComponent(context.seed)}${searchString(params, { page: 1 })}`;
    return `<p class="mb-8 mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground">
Showing results for seed:
<a href="${esc(href)}" class="text-foreground/80 underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/50">${esc(context.seed.slice(0, 12))}...</a>
</p>`;
  }
  const colors = context.colors
    .map(
      ({ name, hex }) =>
        `<span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-3 rounded-sm border border-input" style="background-color:${esc(hex)}"></span><span class="capitalize text-foreground/80">${esc(name)}</span></span>`,
    )
    .join("");
  return `<p class="mb-8 mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground">Showing results for:${colors}</p>`;
}

function headingContent(d: ListPageData): string {
  if (!d.headingParts?.length)
    return esc(d.heading ?? SORT_TITLES[d.sort][1]);
  return d.headingParts
    .map((part) =>
      part.kind === "text"
        ? esc(part.value)
        : `<span class="whitespace-nowrap"><span aria-hidden="true" title="${esc(part.hex)}" class="mr-2 inline-block h-4 w-4 align-[0.1em] rounded-full border-2 border-background ring-1 ring-foreground/40 md:h-[18px] md:w-[18px]" style="background-color:${esc(part.hex)}"></span>${esc(part.value)}</span>`,
    )
    .join("");
}

export function listPage(d: ListPageData): string {
  const cards = d.items
    .map((i) => card(i, d.nowMs, d.params, d.feedbackQuery))
    .join("\n");
  const dataJson = JSON.stringify({
    palettes: d.items,
    total: d.total,
    totalPages: d.totalPages,
    nowMs: d.nowMs,
  }).replace(/</g, "\\u003c");
  const grid =
    d.items.length === 0 && d.emptyText
      ? `<p class="py-16 text-center text-muted-foreground">${esc(d.emptyText)}</p>`
      : `<ol class="mb-12 grid auto-rows-[300px] grid-cols-1 gap-x-10 gap-y-20 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6">
${cards}
</ol>
${pagination(d.params, d.totalPages, d.path, d.paginationSearch)}`;
  const island =
    d.island === false
      ? `<script type="application/json" id="__DATA__" data-static-preview>${dataJson}</script>`
      : `<div id="grid-island"></div>
<script type="application/json" id="__DATA__">${dataJson}</script>`;
  const body = `${logoAnimStyle(d.items, d.params)}${header(undefined, d.user)}
${subHeader(d.subheaderLeft ?? sortNav(d.sort, d.params, d.exportOpen), d.params, d.path, true, d.exportOpen, d.hiddenFields, true)}
<main class="flex-1 px-5 pb-5 pt-3 md:pt-5 lg:px-14">
${searchExplorer(d.searchQuery, d.params, d.popularSearches, "desktop")}
<div class="${d.queryContext ? "" : "mb-8 "}flex items-center justify-between gap-3">
<h1 id="list-h1" class="text-3xl font-bold text-foreground md:text-4xl">${headingContent(d)}</h1>
<div id="export-slot" class="flex shrink-0 items-center gap-2"></div>
</div>
${d.queryContext ? queryContext(d.queryContext, d.params) : ""}
<div id="grid-ssr">
${grid}
</div>
${island}
<div id="export-root" hidden></div>
</main>
<div data-mobile-search-dock-home class="relative h-[calc(11rem+env(safe-area-inset-bottom))] shrink-0 md:hidden">
${searchExplorer(d.searchQuery, d.params, d.popularSearches, "mobile", mobilePaletteOptions(d.params, d.exportOpen))}
</div>
${footer(d.stars)}`;
  return layout(
    {
      title: d.pageTitle ?? SORT_TITLES[d.sort][0],
      description: d.pageDescription ?? SORT_DESCRIPTIONS[d.sort],
      canonical:
        d.pageCanonical ?? `${d.origin}${d.path}${listCanonicalSearch(d.params)}`,
      image: d.pageImage,
      imageAlt: d.pageImageAlt,
      robots:
        d.pageRobots ?? (d.sort === "saved" ? "noindex,nofollow" : undefined),
      structuredData: d.pageStructuredData,
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
    return `<div class="flex h-12 flex-col gap-1 pointer-coarse:h-[60px]">
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
      {
        title: "Grabient",
        description: "",
        canonical: d.origin,
        robots: "noindex,nofollow",
      },
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
  const likeKey = paletteCoeffKey(d.seed) ?? d.seed;
  // The header buttons run the ink math over THEIR region (top-right strip).
  const btnInk = heroInk(view, 430, 860, 76, 430 * 0.55, 430);
  // Below lg the hero is "canvas mode": the gradient becomes a full-viewport
  // z:-1 backdrop of #seed-hero (header + controls + stage float over it),
  // driven by CSS in app.css. Desktop layout is untouched.
  const body = `<div id="seed-hero" class="seed-hero hero-ink-${ink.ink} hero-btn-${btnInk.ink}${d.size === "auto" ? "" : " has-size"}${d.graph ? " show-graph" : ""} relative isolate flex min-h-0 flex-1 flex-col">
${header(view.hexColors)}
${subHeader(backBtn, d.params, `/${d.seed}`, false)}
<main class="seed-stage flex min-h-0 flex-col gap-3 px-5 pb-4 lg:h-[calc(100dvh-174px)] lg:min-h-[520px] lg:px-14 lg:pt-4">
<h1 class="sr-only">Gradient palette editor — ${view.hexColors[0] ?? ""} to ${view.hexColors[view.hexColors.length - 1] ?? ""}</h1>
<div class="seed-cols flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-8 xl:gap-10">
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
<div id="preview-actions" class="absolute right-3 top-3 z-30 hidden flex-col items-end gap-2 group-hover:flex group-focus-within:flex"></div>
<div id="preview-actions-br" class="absolute bottom-3 right-3 z-30 hidden flex-col items-end gap-2 group-hover:flex group-focus-within:flex"></div>
</div>
<div id="swatches-strip" class="shrink-0 pt-0.5">${swatches(view.hexColors)}</div>
</div>
<aside class="flex min-h-0 shrink-0 flex-col gap-5 lg:w-[340px]">
<section id="graph-panel" class="min-h-[180px] flex-1 overflow-hidden rounded-lg border border-solid border-input p-3 lg:max-h-[340px]">${graph}</section>
<div id="mobile-dock" class="lg:hidden"></div>
<div id="editor-card" class="lg:contents">
<div id="tabs-row" class="-mt-2 flex items-start justify-between">
<div id="rgb-tabs" class="flex h-7 items-center pointer-coarse:h-9" aria-label="Channel order and invert"></div>
${likeButton(likeKey, likeKey, view.style, view.steps, view.angle, 0, " data-like-current data-like-info")}
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

  const titleColors = [
    ...new Set(
      renderPalette(d.seed, view.style, 4, view.angle)?.hexColors ?? view.hexColors,
    ),
  ];
  const title = `${titleColors.join(" → ")} Gradient Palette | Grabient`;
  const canonical = `${d.origin}/${d.seed}`;
  const image = paletteOgImageUrl(d.origin, view);

  return layout(
    {
      title,
      description:
        "Copy as CSS, SVG, or PNG, or customize the colors, angle, and steps in Grabient's gradient editor.",
      canonical,
      image,
      imageAlt: `${titleColors.join(" to ")} gradient palette`,
      keywords: `${view.hexColors.join(", ")}, CSS gradient, color palette, gradient generator`,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        name: title,
        url: canonical,
        image,
        keywords: view.hexColors.join(", "),
        isPartOf: {
          "@type": "WebSite",
          name: "Grabient",
          url: d.origin,
        },
      },
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

export function notFoundPage(d: {
  origin: string;
  path: string;
  stars: number;
}): string {
  const body = `${header()}
<main class="flex flex-1 items-center justify-center px-5 py-20 text-center lg:px-14">
<div class="max-w-xl">
<p class="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">404</p>
<h1 class="text-4xl font-bold text-foreground md:text-5xl">Palette not found</h1>
<p class="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">This page or palette does not exist. Browse the gallery to find a gradient you can customize and export.</p>
<a href="/" data-list-link class="${BTN} mt-8 inline-flex px-5">Browse gradients</a>
</div>
</main>
${footer(d.stars)}`;
  return layout(
    {
      title: "Page Not Found | Grabient",
      description: "The requested Grabient page or gradient palette could not be found.",
      canonical: `${d.origin}${d.path}`,
      robots: "noindex,nofollow",
    },
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
      robots: "noindex,follow",
    },
    body,
  );
}

// Contact page: same copy and field styling and Turnstile + Resend flow as the
// current site's /contact. app.client.js explicitly renders Turnstile so it
// also works after a client-side body swap.
const FIELD =
  "w-full h-10 px-3 text-sm bg-background border border-solid border-input rounded-md text-foreground placeholder:text-muted-foreground hover:border-muted-foreground/50 hover:bg-background/60 focus:border-muted-foreground/70 focus:bg-background/60 outline-none transition-colors duration-200";

export function contactContent(
  turnstileSiteKey = "0x4AAAAAABf2mUHr7C-mxWAl",
): string {
  return `<div class="container mx-auto flex min-h-[500px] max-w-2xl flex-col justify-center px-5 py-8 lg:px-14">
<div class="space-y-6">
<div id="contact-heading" class="space-y-3 pb-6 text-center">
<h1 class="text-3xl font-bold text-foreground">Contact Us</h1>
<p class="text-muted-foreground">We'd love to hear from you. Send us a message and we'll respond as soon as possible.</p>
</div>
<form id="contact-form" class="space-y-5" data-turnstile-site-key="${esc(turnstileSiteKey)}">
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
<div id="contact-status" role="alert" class="hidden text-sm font-medium text-red-500"></div>
<button type="submit" disabled class="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-solid border-input bg-background px-3 text-base font-medium text-muted-foreground transition-colors duration-200 outline-none hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50">Send Message</button>
<div id="contact-turnstile" class="flex min-h-[65px] justify-center"></div>
</form>
</div>
</div>`;
}

// ---------------------------------------------------------------------------
// Settings page, ported from the current site's /settings: Profile (username
// editing with live availability; the avatar is display-only — the original's
// upload flow presigns into R2, which this worker doesn't hold), Account
// (created date, email verification, sign out), Danger Zone (email-verified
// delete: request sends a token link, ?token=… returns here to confirm).
// Signed-out visitors get the original's blurred overlay + sign-up CTA over
// the Profile card instead of a redirect. Client behavior: app.client.js
// bootSettings(). Always NO_STORE — per-user bytes.
export interface SettingsUser {
  username?: string | null;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date | string | number;
}

const SETTINGS_CARD = "scroll-mt-24 rounded-lg border border-solid border-input bg-background";
const SETTINGS_CARD_TITLE = "font-semibold leading-none tracking-tight text-foreground";
const SETTINGS_CARD_DESC = "pt-1.5 font-system text-sm text-muted-foreground";
const PRIMARY_BTN =
  "inline-flex h-10 shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-md border border-transparent bg-foreground px-4 text-sm font-medium text-background transition-colors duration-200 outline-none hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER_BTN =
  "inline-flex h-10 shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-md border border-transparent bg-destructive px-4 text-sm font-medium text-destructive-foreground transition-colors duration-200 outline-none hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// UTC on purpose: deterministic across worker colos (and tests) — the
// original's toLocaleDateString varies with the viewer's timezone anyway.
function fmtDate(d: Date | string | number): string {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
}

export function settingsPage(d: {
  user: SettingsUser | null;
  token: string | null;
  origin: string;
  stars: number;
  gdpr: boolean;
}): string {
  const u = d.user;
  const initial = (u?.username || u?.email || "U").charAt(0).toUpperCase();
  const avatar = u?.image
    ? `<img src="${esc(u.image)}" alt="${esc(u.username || "User")}" referrerpolicy="no-referrer" class="h-full w-full rounded-full object-cover">`
    : `<span class="flex h-full w-full items-center justify-center rounded-full bg-primary text-2xl text-primary-foreground">${esc(initial)}</span>`;

  const navLink = (id: string, label: string) =>
    `<a href="#${id}" class="block w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground outline-none transition-colors duration-200 hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70">${label}</a>`;

  const overlay = `<div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg bg-background/80 backdrop-blur-sm">
<div class="space-y-2 px-4 text-center">
<h3 class="text-xl font-semibold text-foreground">Sign up to manage your profile</h3>
<p class="max-w-md font-system text-sm text-muted-foreground">Create an account to customize your username and manage your settings</p>
</div>
<div class="flex items-center gap-3">
<a href="/" class="inline-flex h-10 items-center justify-center rounded-md border border-solid border-input bg-background pl-4 pr-5 text-sm font-medium text-muted-foreground transition-colors duration-200 outline-none hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70">${ICON.arrowLeft("mr-2 h-4 w-4")}Home</a>
<a href="/login?redirect=%2Fsettings" class="${PRIMARY_BTN} px-6">Sign up</a>
</div>
</div>`;

  const profileCard = `<section id="profile" class="${SETTINGS_CARD} relative">
<div class="px-6 pb-2 pt-6">
<h2 class="${SETTINGS_CARD_TITLE}">Profile</h2>
<p class="${SETTINGS_CARD_DESC}">Update your profile information and avatar</p>
</div>
<div class="space-y-6 px-6 pb-6 pt-4">
<div class="flex items-center gap-6">
<span id="settings-avatar" class="relative flex h-20 w-20 shrink-0 overflow-hidden rounded-full">${avatar}</span>
<div>
<input type="file" id="avatar-upload" accept="image/jpeg,image/png,image/webp" class="hidden">
<button type="button" id="avatar-change" class="inline-flex h-8.5 cursor-pointer items-center justify-center rounded-md border border-solid border-input bg-background px-3 text-sm text-muted-foreground outline-none transition-colors duration-200 hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50">Change avatar</button>
<p class="mt-2 font-system text-xs text-muted-foreground">JPG, PNG or WebP. Max 5MB.</p>
<p class="font-mono text-xs text-muted-foreground">256x256</p>
</div>
</div>
<form id="settings-username-form" novalidate data-current="${esc(u?.username ?? "")}">
<div class="space-y-2">
<div class="flex min-h-5 w-full items-center justify-between">
<label for="settings-username" class="text-sm font-medium text-foreground">Username</label>
<span id="username-status" role="status" class="font-system text-sm font-medium text-muted-foreground"></span>
</div>
<input id="settings-username" name="username" type="text" placeholder="Choose a username" autocomplete="off" spellcheck="false" value="${esc(u?.username ?? "")}" class="${FIELD}">
</div>
<div class="mt-6 flex justify-end">
<button type="submit" id="settings-save" disabled class="${PRIMARY_BTN}">Save changes</button>
</div>
</form>
</div>
${u ? "" : overlay}
</section>`;

  const accountCard = !u
    ? ""
    : `<section id="account" class="${SETTINGS_CARD}">
<div class="flex items-start justify-between px-6 pb-2 pt-6">
<div>
<h2 class="${SETTINGS_CARD_TITLE}">Account</h2>
<p class="${SETTINGS_CARD_DESC}">Manage your account settings</p>
</div>
<button type="button" id="settings-signout" class="${DANGER_BTN}">${ICON.logout("mr-2 h-4 w-4")}Sign out</button>
</div>
<div class="space-y-6 px-6 pb-6 pt-4">
<div class="space-y-1">
<p class="text-sm font-medium text-foreground">Account Created</p>
<p class="font-system text-xs text-muted-foreground">${fmtDate(u.createdAt)}</p>
</div>
<div class="flex items-center justify-between rounded-lg border border-solid border-border p-4">
<div class="space-y-1">
<p class="text-sm font-medium text-foreground">Email Verification</p>
<p class="font-system text-xs text-muted-foreground">${esc(u.email)} is ${u.emailVerified ? "verified" : "not verified"}</p>
</div>
${
  u.emailVerified
    ? `<span class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">${ICON.check("h-5 w-5")}Verified</span>`
    : `<span class="font-system text-sm text-muted-foreground">Not verified</span>`
}
</div>
</div>
</section>`;

  // Shadcn Switch, SSR'd: state lives in data-state/aria-checked; the client
  // hydrates from the localStorage consent store (see app.client.js) and only
  // flips those attributes — Tailwind's data- variants do the rest. SSR is
  // always "unchecked" because the stored choice is client-only.
  const consentSwitch = (id: string, label: string) =>
    `<button type="button" role="switch" id="${id}" data-consent="${id.replace("consent-", "")}" data-state="unchecked" aria-checked="false" aria-labelledby="${id}-label" class="inline-flex h-[1.15rem] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-input/80">` +
    `<span data-state="unchecked" class="pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=checked]:bg-background data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-foreground"></span></button>`;

  const consentRow = (id: string, label: string, desc: string) =>
    `<div class="flex items-center justify-between rounded-lg border border-solid border-border p-4">
<div class="space-y-1">
<p id="${id}-label" class="text-sm font-medium text-foreground">${label}</p>
<p class="font-system text-xs text-muted-foreground">${desc}</p>
</div>
${consentSwitch(id, label)}
</div>`;

  // Rendered signed-out too (consent is a client-side store, not account
  // data) — mirrors the original's ConsentSection. data-gdpr carries the
  // request's geo so first-visit defaults can be opt-in vs legitimate-interest.
  const privacyCard = `<section id="privacy" class="${SETTINGS_CARD}" data-gdpr="${d.gdpr ? "1" : "0"}">
<div class="px-6 pb-2 pt-6">
<h2 class="${SETTINGS_CARD_TITLE}">Privacy &amp; Consent</h2>
<p class="${SETTINGS_CARD_DESC}">Manage your data privacy and cookie preferences</p>
</div>
<div class="space-y-4 px-6 pb-6 pt-4">
${consentRow("consent-analytics", "Analytics", "Help us improve by allowing anonymous usage analytics")}
${consentRow("consent-sessionReplay", "Session Replay", "Anonymized session recordings to help us fix issues")}
${consentRow("consent-advertising", "Marketing", "Allow personalized ads and marketing content")}
</div>
</section>`;

  const dangerCard = !u
    ? ""
    : `<section id="danger-zone" class="${SETTINGS_CARD} border-destructive">
<div class="px-6 pb-2 pt-6">
<h2 class="${SETTINGS_CARD_TITLE} text-destructive">Danger Zone</h2>
<p class="${SETTINGS_CARD_DESC}">Irreversible actions for your account</p>
</div>
<div class="px-6 pb-6 pt-4">
<div class="flex items-center justify-between gap-4 rounded-lg border border-solid border-destructive/50 p-4">
<div class="space-y-1">
<p id="delete-title" class="text-sm font-medium text-foreground">${d.token ? "Confirm delete" : "Delete account"}</p>
<p id="delete-desc" class="font-system text-xs text-muted-foreground">${d.token ? "Click the button to confirm account deletion" : "Permanently delete your account and all data"}</p>
</div>
<button type="button" id="delete-account-btn"${d.token ? ` data-token="${esc(d.token)}"` : ""} class="${DANGER_BTN}">${d.token ? "Confirm delete" : "Delete account"}</button>
</div>
</div>
</section>`;

  const body = `${header(undefined, u)}
<main class="container mx-auto flex-1 px-4 py-6 lg:py-12">
<div class="mx-auto flex max-w-5xl gap-8">
<nav class="hidden w-48 shrink-0 lg:block" aria-label="Settings sections">
<div class="sticky top-24 space-y-1">
${navLink("profile", "Profile")}
${u ? navLink("account", "Account") : ""}
${navLink("privacy", "Privacy")}
${u ? navLink("danger-zone", "Danger Zone") : ""}
</div>
</nav>
<div class="max-w-3xl flex-1 space-y-6 lg:space-y-8">
<div class="flex items-start gap-6">
${ICON.gear("mt-1.5 h-12 w-12 shrink-0 text-foreground")}
<div>
<h1 class="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
<p class="font-system text-muted-foreground">Manage your account settings and preferences</p>
</div>
</div>
${profileCard}
${accountCard}
${privacyCard}
${dangerCard}
</div>
</div>
</main>
${footer(d.stars)}`;
  return layout(
    {
      title: "Settings — Grabient",
      description: "Manage your Grabient account settings and preferences.",
      canonical: `${d.origin}/settings`,
      robots: "noindex,nofollow",
    },
    body,
  );
}
