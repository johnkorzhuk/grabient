// Shared button/control recipes + card-control markup, used by BOTH the SSR
// pages (pages.ts) and the client export module (islands/export.ts) so the
// export view's cards are byte-identical to the SSR grid's. Class strings
// must stay literal for Tailwind source scanning — never concatenate dynamic
// fragments. The Solid grid island (grid.tsx) can't consume HTML strings, so
// it mirrors these in JSX — keep all three in sync.
import { esc } from "./esc";
import { ICON } from "./icons";
import type { PaletteStyle } from "@repo/data-ops/valibot-schema/grabient";

// Canonical component recipes ported from the current site (CLAUDE.md +
// AppHeader/pagination/card extraction).
export const BTN =
  "inline-flex select-none items-center justify-center gap-1.5 rounded-md font-bold text-sm h-8.5 pointer-coarse:h-11 px-3 border border-solid bg-background border-input hover:border-muted-foreground/30 hover:bg-background/60 active:border-muted-foreground/40 active:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70";
export const BTN_ICON =
  "inline-flex select-none items-center justify-center rounded-md h-8.5 w-8.5 pointer-coarse:h-11 pointer-coarse:w-11 p-0 border border-solid bg-background border-input hover:border-muted-foreground/30 hover:bg-background/60 active:border-muted-foreground/40 active:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70";
// Header icon buttons (theme toggle, eye dropper) match the Sign in button's
// height (h-8) at EVERY breakpoint — no pointer-coarse upsizing, which would
// otherwise blow them up to 44px next to the 32px Sign in on touch devices.
export const HEADER_BTN_ICON =
  "inline-flex select-none items-center justify-center rounded-md h-8 w-8 p-0 border border-solid bg-background border-input hover:border-muted-foreground/30 hover:bg-background/60 active:border-muted-foreground/40 active:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70";
export const BTN_ACTIVE = "border-muted-foreground/30 text-foreground";
// Match BTN_ICON at every breakpoint: the subheader fields and its square
// controls share a 34px base height, then all expand to 44px on coarse input.
export const CTRL =
  "h-8.5 pointer-coarse:h-11 rounded-md border border-solid border-input bg-background px-2 md:px-3 text-[13px] sm:text-sm pointer-coarse:text-base font-system font-semibold text-muted-foreground hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground focus:border-muted-foreground/30 focus:text-foreground transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input disabled:hover:bg-background disabled:hover:text-muted-foreground";

// Compact variants for the export bar/panel: same interaction recipe, h-8.
export const BTN_SM =
  "inline-flex select-none items-center justify-center gap-1.5 rounded-md font-bold text-sm h-8 px-3 border border-solid bg-background border-input hover:border-muted-foreground/30 hover:bg-background/60 active:border-muted-foreground/40 active:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70";
export const BTN_ICON_SM =
  "inline-flex select-none items-center justify-center rounded-md h-8 w-8 shrink-0 p-0 border border-solid bg-background border-input hover:border-muted-foreground/30 hover:bg-background/60 active:border-muted-foreground/40 active:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/70";
// The Sign in button's recipe (bg-foreground/80) at h-8 with a gap for icons.
export const PRIMARY_SM =
  "inline-flex h-8 cursor-pointer select-none items-center justify-center gap-1.5 rounded-md border border-transparent bg-foreground/80 px-3 text-sm font-medium text-background transition-colors duration-200 outline-none hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring/70";

// Interactive save/like button, ported from the current site's SaveButton:
// count at base size font-medium with pr-4 before a 22px heart; count hidden
// via opacity when 0 (flips to "1" on optimistic like). Liked fill is applied
// by a client-generated stylesheet keyed on data-like-seed, so it survives
// island re-renders.
//
// data-like-seed is the palette's COEFFICIENT KEY (one palette = many stored
// seed aliases; the key is what /api/likes returns and hearts match on).
// data-like-row is the stored row id the toggle should INSERT under, so like
// counts keep joining the palettes row they're displayed from. `extra`
// carries per-context attrs (data-like-current on the seed page marks "read
// the storage seed from the URL at click time" to follow live edits).
export function likeButton(
  seed: string,
  key: string,
  style: PaletteStyle,
  steps: number,
  angle: number,
  likesCount: number,
  extra = "",
): string {
  return `<button type="button" data-like-seed="${esc(key)}" data-like-row="${esc(seed)}" data-like-style="${style}" data-like-steps="${steps}" data-like-angle="${angle}" data-count="${likesCount}"${extra} aria-label="Save palette" data-tip="Save palette" data-tip-side="bottom" class="likes group/like flex cursor-pointer items-center rounded-md text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
<span class="like-count select-none pr-4 font-medium transition-[color,opacity] duration-200${likesCount > 0 ? "" : " opacity-0"}">${likesCount > 0 ? likesCount : 1}</span>
${ICON.heart("heart-i w-[22px] h-[22px] transition-all duration-200")}
</button>`;
}

export function searchFeedbackButtons(query: string, seed: string): string {
  const shortQuery = query.length > 16 ? `${query.slice(0, 16)}...` : query;
  return `<div data-palette-card-action data-search-feedback-group data-query="${esc(query)}" data-seed="${esc(seed)}" class="palette-card-control palette-card-feedback" role="group" aria-label="Does this palette fit ${esc(shortQuery)}?">
<button type="button" data-search-feedback="good" aria-label="Good fit for &quot;${esc(shortQuery)}&quot;" aria-pressed="false" data-tip="Good match" data-tip-side="top">${ICON.thumbUp()}</button>
<span aria-hidden="true"></span>
<button type="button" data-search-feedback="bad" aria-label="Bad fit for &quot;${esc(shortQuery)}&quot;" aria-pressed="false" data-tip="Poor match" data-tip-side="top">${ICON.thumbDown()}</button>
</div>`;
}

// Multi-select export toggle (original's ExportButton): plus when idle, minus
// when the palette is in the export selection. Sits in div.relative next to
// the anchor (NOT inside it — invalid HTML, and the click must not navigate).
// Hover/focus-revealed on fine pointers; list cards opt into the explicit
// tap-toggled overlay used on touch. The selected state (and plus/minus swap)
// comes from the client's
// generated #export-style sheet keyed on data-export-id, so it survives body
// swaps and island re-renders — the same trick as the liked hearts.
// data-export-id/style/steps/angle describe the card's EFFECTIVE view (user
// params override row defaults), matching what the like button records.
export function exportToggle(
  id: string,
  seed: string,
  style: PaletteStyle,
  steps: number,
  angle: number,
  paletteCard = false,
): string {
  const classes = paletteCard
    ? "palette-card-control palette-card-export export-toggle"
    : "export-toggle absolute right-3 top-3 z-20 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-solid border-input bg-background/80 p-0 text-muted-foreground opacity-0 backdrop-blur-sm transition-all duration-200 hover:border-muted-foreground/30 hover:bg-background/60 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/70 group-hover:opacity-100 pointer-coarse:opacity-100";
  return `<button type="button" data-palette-card-action data-export-toggle data-export-id="${id}" data-export-seed="${esc(seed)}" data-export-style="${style}" data-export-steps="${steps}" data-export-angle="${angle}" aria-pressed="false" aria-label="Add to export selection" data-tip="Add to export selection" data-tip-side="bottom" class="${classes}">${ICON.plus("xp-plus h-4 w-4")}${ICON.minus("xp-minus h-4 w-4")}</button>`;
}

/** The list-card overlay: one clear route affordance plus format-specific copy. */
export function paletteCardActions(
  href: string,
  description = "gradient palette",
): string {
  return `<a href="${esc(href)}" data-palette-card-action class="palette-card-control palette-card-edit" aria-label="Edit ${esc(description)}" data-tip="Edit gradient" data-tip-side="bottom">${ICON.pen()}<span class="sr-only">Edit ${esc(description)}</span></a>
<button type="button" data-palette-card-action data-palette-download data-menu-align="end" class="palette-card-control palette-card-download" aria-label="Download gradient" data-tip="Download gradient" data-tip-side="left" aria-haspopup="listbox" aria-expanded="false">${ICON.download()}</button>
<div data-palette-card-action class="palette-card-control palette-card-copy-group" role="group" aria-label="Copy gradient">
<button type="button" data-palette-card-action data-palette-copy="css" aria-label="Copy CSS" data-tip="Copy CSS" data-tip-side="top" class="palette-card-format">CSS</button>
<button type="button" data-palette-card-action data-palette-copy="svg" aria-label="Copy SVG" data-tip="Copy SVG" data-tip-side="top" class="palette-card-format">SVG</button>
<button type="button" data-palette-card-action data-palette-copy="png" aria-label="Copy PNG" data-tip="Copy PNG" data-tip-side="top" class="palette-card-format">PNG</button>
<button type="button" data-palette-card-action data-palette-copy="url" aria-label="Copy URL" data-tip="Copy URL" data-tip-side="top" class="palette-card-format">URL</button>
</div>`;
}
