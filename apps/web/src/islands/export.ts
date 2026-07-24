// ---------------------------------------------------------------------------
// Multi-palette export — port of grabient.com's export view (select cards,
// compose a grid, copy/download as PNG/SVG/JSON). Client-only: dynamically
// imported from islands/entry.tsx on list pages (bootExport on every app:swap).
//
// Storage compatibility with the live site is deliberate: `export-list` keeps
// the original's v1 shape EXACTLY ({version, items:[{id, coeffs, globals,
// style, steps, angle, seed, hexColors}]}, id = fnv1a over the same JSON field
// order — see palette.ts), so selections survive the custom-domain cutover in
// either direction. `export-options` is v2 here (width/height nullable —
// null = "auto", measured from the on-screen cards) with a v1 migration read.
//
// URL state mirrors the original's ?export=true: opening pushes a history
// entry, Close/Esc unwinds it, Back/Forward re-opens and closes in place
// (window.__popstateHandler consumes pure flag flips; real navigations fall
// through to the nav layer and bootExport re-syncs from the URL after the
// swap). A reload on ?export=true re-opens the view when the list is non-
// empty; a stale flag with an empty list is stripped.
// ---------------------------------------------------------------------------
import { generateCssGradient } from "@repo/data-ops/gradient-gen/css";
import { generateSvgGradient } from "@repo/data-ops/gradient-gen/svg";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  type PaletteStyle,
} from "@repo/data-ops/valibot-schema/grabient";
import { esc } from "../esc";
import { ICON } from "../icons";
import {
  BTN_ICON_SM,
  CTRL,
  PRIMARY_SM,
  exportToggle,
  likeButton,
  paletteCardActions,
} from "../buttons";
import { exportItemData, paletteCoeffKey, type ExportItemData } from "../palette";
import { MAX_DIM, MIN_DIM } from "../search";
import { clearLogoAnimation, syncLogoAnimation } from "./logo-animation.client";
import {
  MAX_EXPORT_ITEMS,
  readExportList,
  toggleExportItem,
  writeExportList,
} from "./export-store";

// The portal menu system lives in app.client.js (shared with the select
// enhancement); it exposes itself on window like the other cross-module hooks.
interface MenuItem {
  value: string;
  label: string;
  selected?: boolean;
  header?: boolean;
}

declare global {
  interface Window {
    __menu?: {
      menuTrigger: (
        trigger: HTMLElement,
        buildItems: () => MenuItem[],
        onPick: (value: string) => void,
        anchor?: HTMLElement,
        onHover?: ((value: string | null) => void) | undefined,
      ) => void;
      closeMenu: (refocus?: boolean) => void;
    };
    __popstateHandler?: () => boolean;
    __renderNavSelectForExport?: (open: boolean) => void;
  }
}

type ExportItem = ExportItemData;

const OPTS_KEY = "export-options";
const OPTS_VERSION = 2; // v2: width/height nullable (null = auto/measured)
const GAP_MIN = 0;
const GAP_MAX = 1000;
const RADIUS_MIN = 0;
const RADIUS_MAX = 100;
const COLS_MIN = 1;
const COLS_MAX = 10;
const DIM_MIN = 1;
const DIM_MAX = 6000;

interface ExportOptions {
  width: number | null;
  height: number | null;
  gap: number;
  borderRadius: number;
  columns: number;
}

const DEFAULT_OPTS: ExportOptions = {
  width: null,
  height: null,
  gap: 40,
  borderRadius: 0,
  columns: 5,
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
const clampInt = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;

const dimOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= DIM_MIN && v <= DIM_MAX
    ? Math.round(v)
    : null;

function loadOptions(): ExportOptions {
  try {
    const raw = localStorage.getItem(OPTS_KEY);
    if (!raw) return { ...DEFAULT_OPTS };
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (p && p.version === OPTS_VERSION) {
      return {
        width: dimOrNull(p.width),
        height: dimOrNull(p.height),
        gap: clampInt(p.gap, GAP_MIN, GAP_MAX, DEFAULT_OPTS.gap),
        borderRadius: clampInt(p.borderRadius, RADIUS_MIN, RADIUS_MAX, DEFAULT_OPTS.borderRadius),
        columns: clampInt(p.columns, COLS_MIN, COLS_MAX, DEFAULT_OPTS.columns),
      };
    }
    if (p && p.version === 1) {
      // Migrate the original site's options: explicit container dimensions
      // carry over, everything else clamps into the same bounds.
      const dims = p.containerDimensions as { width?: unknown; height?: unknown } | undefined;
      return {
        width: dimOrNull(dims?.width),
        height: dimOrNull(dims?.height),
        gap: clampInt(p.gap, GAP_MIN, GAP_MAX, DEFAULT_OPTS.gap),
        borderRadius: clampInt(p.borderRadius, RADIUS_MIN, RADIUS_MAX, DEFAULT_OPTS.borderRadius),
        columns: clampInt(p.columns, COLS_MIN, COLS_MAX, DEFAULT_OPTS.columns),
      };
    }
    localStorage.removeItem(OPTS_KEY);
    return { ...DEFAULT_OPTS };
  } catch {
    return { ...DEFAULT_OPTS };
  }
}

function saveOptions(): void {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify({ version: OPTS_VERSION, ...options }));
  } catch {}
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
let items: ExportItem[] = [];
let options: ExportOptions = { ...DEFAULT_OPTS };
let wired = false;
let isOpen = false;
let closing = false; // double-click guard while a close is unwinding via history.back()
let shownURL = ""; // the open view's base URL (export flag stripped)
// "Auto" W×H: the first export card's measured size (original's
// useElementSize → containerDimensions). Fallback matches the original's
// default 800×400 until a card has actually been measured.
let measured = { w: 800, h: 400 };
// The SSR h1 text for this page, captured per boot — the open view swaps the
// h1 text in place ("N items selected") instead of rendering its own header,
// so the row (and the grid below it) never moves on toggle.
let baseTitle = "";
// The open dims popover (body-anchored, like the $seed route's Portal).
let dimsPanel: HTMLElement | null = null;
// Preset hover/focus previews only affect the composed preview. They never
// persist until the option is picked.
let previewDims: [number, number] | null = null;

const announce = (msg: string): void => {
  document.dispatchEvent(new CustomEvent("app:announce", { detail: msg }));
};

const setHidden = (id: string, hidden: boolean): void => {
  const el = document.getElementById(id);
  if (el) el.hidden = hidden;
};

// ---------------------------------------------------------------------------
// Selected state: a generated stylesheet keyed on data-export-id (survives
// body swaps + island re-renders — the liked-hearts trick), plus aria/tooltip
// sync patched onto the DOM (MutationObserver covers island-added cards).
// ---------------------------------------------------------------------------
function renderSelected(): void {
  let el = document.getElementById("export-style");
  if (!el) {
    el = document.createElement("style");
    el.id = "export-style";
    document.head.append(el);
  }
  const ids = [...new Set(items.map((i) => i.id))];
  el.textContent = ids.length
    ? ids.map((id) => `[data-export-id=${JSON.stringify(id)}]`).join(",") +
      "{color:var(--color-foreground);border-color:color-mix(in srgb, var(--color-muted-foreground) 30%, transparent)}" +
      ids
        .map((id) => `#export-cards [data-export-id=${JSON.stringify(id)}]`)
        .join(",") +
      "{opacity:1}" +
      ids.map((id) => `[data-export-id=${JSON.stringify(id)}] .xp-plus`).join(",") +
      "{display:none}" +
      ids.map((id) => `[data-export-id=${JSON.stringify(id)}] .xp-minus`).join(",") +
      "{display:block}"
    : "";
  syncToggles();
}

function syncToggles(): void {
  const ids = new Set(items.map((i) => i.id));
  document.querySelectorAll("[data-export-toggle]").forEach((b) => {
    const on = ids.has(b.getAttribute("data-export-id") ?? "");
    b.setAttribute("aria-pressed", String(on));
    const label = on ? "Remove from export selection" : "Add to export selection";
    if (b.getAttribute("aria-label") !== label) b.setAttribute("aria-label", label);
    if (b.getAttribute("data-tip") !== label) b.setAttribute("data-tip", label);
  });
}

// ---------------------------------------------------------------------------
// H1 row (y-stable, mirroring the original site): ONE persistent row holds
// the h1 — its text swaps between the page title and the open view's
// "N items selected" — plus #export-slot on the right, which holds Export
// (closed, non-empty selection) or Close (open) at the SAME position. The
// h1's line-height exceeds the buttons', so the row never resizes and the
// palette list below never shifts on the y axis when export is toggled.
// ---------------------------------------------------------------------------
function syncH1(): void {
  const h1 = document.getElementById("list-h1");
  if (h1)
    h1.textContent = isOpen
      ? `${items.length} item${items.length === 1 ? "" : "s"} selected`
      : baseTitle;
}

function renderSlot(): void {
  const slot = document.getElementById("export-slot");
  if (!slot) return;
  if (isOpen) {
    slot.innerHTML = `<button type="button" id="export-close" class="${PRIMARY_SM}">Close${ICON.x("h-4 w-4")}</button>`;
  } else if (items.length > 0) {
    slot.innerHTML = `<button type="button" id="export-open" class="${PRIMARY_SM}">${ICON.exportArrow("h-4 w-4")}Export</button>`;
  } else {
    slot.replaceChildren();
  }
}

// ---------------------------------------------------------------------------
// Export view markup
// ---------------------------------------------------------------------------
function itemHref(item: ExportItem): string {
  const p = new URLSearchParams();
  if (item.style !== DEFAULT_STYLE) p.set("style", item.style);
  if (item.steps !== DEFAULT_STEPS) p.set("steps", String(item.steps));
  if (item.angle !== DEFAULT_ANGLE) p.set("angle", String(item.angle));
  const s = p.toString();
  return `/${encodeURIComponent(item.seed)}${s ? `?${s}` : ""}`;
}

// Same card skeleton as the SSR list grid (pages.ts card()) minus the age
// label; controls come from buttons.ts so markup is byte-identical.
function cardHtml(item: ExportItem): string {
  const { styles } = generateCssGradient(item.hexColors, item.style, item.angle, {
    seed: item.seed,
    searchString: "",
  });
  const bg = esc(styles.background);
  const key = paletteCoeffKey(item.seed) ?? item.seed;
  return `<li class="relative w-full">
<div class="group relative">
<div data-palette-card data-palette-seed="${esc(item.seed)}" data-palette-style="${item.style}" data-palette-steps="${item.steps}" data-palette-angle="${item.angle}" class="palette-card relative">
<div class="glow invisible absolute -inset-3 z-0 rounded-xl opacity-0 blur-lg transition-[opacity,visibility] duration-300 group-hover:visible group-hover:opacity-40 group-active:visible group-active:opacity-40" style="background:${bg}" aria-hidden="true"></div>
<div class="card relative z-10 block h-[300px] overflow-hidden rounded-xl" style="background:${bg}" role="img" aria-label="Gradient palette ${esc(item.seed)}"></div>
${paletteCardActions(itemHref(item))}
${exportToggle(item.id, item.seed, item.style, item.steps, item.angle)}
</div>
<div class="flex min-h-[28px] items-center justify-end pt-4">
${likeButton(item.seed, key, item.style, item.steps, item.angle, 0)}
</div>
</div>
</li>`;
}

// Panel inputs: the subheader's CTRL recipe (design system) at a compact,
// right-aligned width.
const PANEL_INPUT = `${CTRL} w-[76px] px-2 text-right [&::-webkit-inner-spin-button]:appearance-none`;
const PANEL_LABEL = "text-sm font-medium text-muted-foreground";
const CLEAR_BTN =
  "inline-flex h-8 cursor-pointer select-none items-center justify-center rounded-md px-2 text-sm font-medium text-destructive transition-colors duration-200 outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring/70";

// The $seed route's icons (edit.tsx), inlined byte-for-byte — 15×15, stroke
// 2 — so these controls are the same component, not an approximation of it.
const MONITOR_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`;
const COPY_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const DOWNLOAD_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`;
// The $seed copy feedback: the trigger's icon swaps to a check for 1.2s.
const CHECK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

function optInput(
  id: string,
  field: string,
  label: string,
  min: number,
  max: number,
  placeholder: string,
): string {
  return `<input type="number" id="export-${id}" data-export-opt="${field}" data-step-keys data-min="${min}" data-max="${max}" min="${min}" max="${max}" inputmode="numeric" autocomplete="off" placeholder="${placeholder}" aria-label="${label}" class="${PANEL_INPUT}">`;
}

function panelHtml(): string {
  const row = (id: string, label: string, input: string) =>
    `<div class="mt-4 flex items-center justify-between gap-3"><label for="export-${id}" class="${PANEL_LABEL}">${label}</label>${input}</div>`;
  const dimsSet = options.width != null && options.height != null;
  return `<aside class="order-first w-full shrink-0 md:order-none md:w-[300px] lg:w-[330px]">
<div class="md:sticky md:top-[150px]">
<div class="flex items-center justify-between gap-3">
<h2 class="text-lg font-semibold text-foreground">Export options</h2>
<button type="button" id="export-clear" class="${CLEAR_BTN}">Clear selected</button>
</div>
<div class="mt-5 flex items-center justify-between gap-3">
<span class="${PANEL_LABEL}">Size</span>
<button type="button" id="export-dims" aria-label="Export dimensions" data-tip="Export dimensions" data-tip-side="bottom" aria-haspopup="dialog" aria-expanded="false" class="${BTN_ICON_SM}${dimsSet ? " border-muted-foreground/30 text-foreground" : ""}">${MONITOR_SVG}</button>
</div>
${row("gap", "Gap", optInput("gap", "gap", "Gap", GAP_MIN, GAP_MAX, "40"))}
${row("radius", "Border %", optInput("radius", "radius", "Border radius percent", RADIUS_MIN, RADIUS_MAX, "0"))}
${row("cols", "Columns", optInput("cols", "cols", "Columns", COLS_MIN, COLS_MAX, "5"))}
<div class="group relative mt-6">
<div id="export-preview" class="h-[300px] overflow-hidden rounded-lg border border-solid border-input p-2 lg:h-[340px]" aria-label="Export preview"></div>
<div class="absolute right-3 top-3 z-30 flex gap-2">
<button type="button" id="export-copy" aria-label="Copy" data-tip="Copy" data-tip-side="bottom" data-menu-align="end" aria-haspopup="listbox" aria-expanded="false" class="${BTN_ICON_SM} aria-expanded:border-muted-foreground/30 aria-expanded:text-foreground">${COPY_SVG}</button>
<button type="button" id="export-download" aria-label="Download" data-tip="Download" data-tip-side="bottom" data-menu-align="end" aria-haspopup="listbox" aria-expanded="false" class="${BTN_ICON_SM} aria-expanded:border-muted-foreground/30 aria-expanded:text-foreground">${DOWNLOAD_SVG}</button>
</div>
</div>
</div>
</aside>`;
}

// ---------------------------------------------------------------------------
// Size: the $seed route's dims component (edit.tsx), ported to vanilla DOM.
// Monitor icon button → body-anchored popover (fixed, positioned from the
// trigger) holding W×H inputs with floating labels + "auto" and the same 8
// SIZE_PRESETS; picking the active preset resets to auto. Same keyboard
// model: arrows step ±1 (Shift ×10) committing live, Enter commits, Escape
// reverts — and stops propagation so the view's close-on-Escape doesn't fire.
// ---------------------------------------------------------------------------
const SIZE_PRESETS: [string, number, number][] = [
  ["1080p", 1920, 1080],
  ["1440p", 2560, 1440],
  ["4K", 3840, 2160],
  ["Square", 1080, 1080],
  ["Story", 1080, 1920],
  ["iPhone 16 Pro", 1206, 2622],
  ["iPad Pro 13″", 2064, 2752],
  ["MacBook Air 13″", 2560, 1664],
];

const shownDims = (): [number, number] => [
  options.width ?? measured.w,
  options.height ?? measured.h,
];

const clampDim = (raw: string): number | null => {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(MIN_DIM, Math.min(MAX_DIM, n));
};

function commitSize(s: "auto" | [number, number]): void {
  previewDims = null;
  if (s === "auto") {
    options.width = null;
    options.height = null;
  } else {
    options.width = s[0];
    options.height = s[1];
  }
  saveOptions();
  syncDimsTrigger();
  renderPreview();
}

// Value-set state: the same brightened border/text the $seed trigger uses.
function syncDimsTrigger(): void {
  const btn = document.getElementById("export-dims");
  if (!btn) return;
  const set = options.width != null && options.height != null;
  btn.classList.toggle("border-muted-foreground/30", set);
  btn.classList.toggle("text-foreground", set);
}

// edit.tsx's positionFixedPanel: below the trigger, flipped above when it
// would clip, right-aligned, clamped inside the viewport.
function positionDimsPanel(): void {
  const btn = document.getElementById("export-dims");
  const p = dimsPanel;
  if (!btn || !p) return;
  const r = btn.getBoundingClientRect();
  const pw = p.offsetWidth;
  const ph = p.offsetHeight;
  let top = r.bottom + 8;
  if (top + ph > innerHeight - 8 && r.top - ph - 8 > 0) top = r.top - ph - 8;
  p.style.top = Math.max(8, top) + "px";
  p.style.left = Math.max(8, Math.min(r.right - pw, innerWidth - pw - 8)) + "px";
}

// edit.tsx's dimKeydown (original size-controls keyboard model).
function dimKeydown(axis: 0 | 1, e: KeyboardEvent): void {
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
}

function closeDims(refocus = false): void {
  const wasPreviewing = previewDims !== null;
  previewDims = null;
  if (wasPreviewing) renderPreview();
  if (!dimsPanel) return;
  dimsPanel.remove();
  dimsPanel = null;
  removeEventListener("scroll", positionDimsPanel, true);
  removeEventListener("resize", positionDimsPanel);
  const btn = document.getElementById("export-dims");
  btn?.setAttribute("aria-expanded", "false");
  if (refocus) btn?.focus();
}

const DIM_INPUT =
  "h-7 w-full min-w-0 rounded-md border border-solid border-input bg-background px-2 font-mono text-xs font-semibold text-muted-foreground transition-colors duration-200 outline-none hover:border-muted-foreground/30 hover:text-foreground focus:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70";
const DIM_FLOAT_LABEL =
  "pointer-events-none absolute -top-3.5 left-2 text-[10px] font-bold text-muted-foreground transition-colors duration-150 group-focus-within/dim:text-foreground group-hover/dim:text-foreground";

function openDims(): void {
  const btn = document.getElementById("export-dims");
  if (!btn || dimsPanel) return;
  window.__menu?.closeMenu();
  btn.setAttribute("aria-expanded", "true");
  const [sw, sh] = shownDims();
  const cur =
    options.width != null && options.height != null
      ? `${options.width}x${options.height}`
      : "auto";
  const dimLabel = (axis: 0 | 1, text: string, value: number) =>
    `<label class="group/dim relative min-w-0 flex-1"><span class="${DIM_FLOAT_LABEL}">${text}</span><input type="text" inputmode="numeric" autocomplete="off" aria-label="Export ${text}" value="${value}" data-dim-axis="${axis}" class="${DIM_INPUT}"></label>`;
  const p = document.createElement("div");
  p.id = "export-dims-panel";
  p.setAttribute("role", "dialog");
  p.setAttribute("aria-label", "Export dimensions");
  p.className =
    "fixed z-[70] max-h-[60vh] w-56 overflow-y-auto rounded-[10px] border border-solid border-input bg-background/90 p-1.5 shadow-lg backdrop-blur-md";
  p.innerHTML = `<div class="flex items-center gap-1.5 px-1.5 pb-2 pt-5">
${dimLabel(0, "width", sw)}
<span class="shrink-0 text-xs text-muted-foreground">×</span>
${dimLabel(1, "height", sh)}
</div>
<div role="listbox" aria-label="Size presets">
<button type="button" class="menu-item" role="option" aria-selected="${cur === "auto"}"><span class="flex-1 text-left">auto</span></button>
${SIZE_PRESETS.map(
  ([label, w, h]) =>
    `<button type="button" class="menu-item" role="option" aria-selected="${cur === `${w}x${h}`}" data-dims="${w}x${h}"><span class="flex-1 text-left">${label}</span><span class="font-mono text-[10px] text-muted-foreground">${w}×${h}</span></button>`,
).join("\n")}
</div>`;
  document.body.append(p);
  dimsPanel = p;
  positionDimsPanel();
  p.querySelectorAll<HTMLInputElement>("[data-dim-axis]").forEach((input) => {
    const axis = Number(input.getAttribute("data-dim-axis")) as 0 | 1;
    input.addEventListener("focus", () => input.select());
    input.addEventListener("keydown", (e) => dimKeydown(axis, e));
    input.addEventListener("change", () => {
      const v = clampDim(input.value);
      const other = shownDims()[axis === 0 ? 1 : 0]!;
      if (v !== null) commitSize(axis === 0 ? [v, other] : [other, v]);
      else input.value = String(shownDims()[axis]);
    });
  });
  p.querySelectorAll<HTMLElement>("[role='option']").forEach((opt) => {
    const preview = (): void => {
      const raw = opt.getAttribute("data-dims");
      previewDims = raw ? (raw.split("x").map(Number) as [number, number]) : null;
      renderPreview();
    };
    const restore = (): void => {
      if (previewDims === null) return;
      previewDims = null;
      renderPreview();
    };
    opt.addEventListener("mouseenter", preview);
    opt.addEventListener("mouseleave", restore);
    opt.addEventListener("focus", preview);
  });
  p.addEventListener("click", (e) => {
    const opt = (e.target as Element | null)?.closest?.("[role='option']") as HTMLElement | null;
    if (!opt) return;
    const d = opt.getAttribute("data-dims");
    if (!d || d === cur) commitSize("auto"); // "auto", or re-picking the active preset
    else commitSize(d.split("x").map(Number) as [number, number]);
    closeDims(true);
  });
  p.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeDims(true);
    }
  });
  addEventListener("scroll", positionDimsPanel, true);
  addEventListener("resize", positionDimsPanel);
}

// ---------------------------------------------------------------------------
// SVG grid — ported from the original's generateSVGGrid.ts nearly verbatim
// (proven Figma compatibility, incl. the angular foreignObject + metadata).
// ---------------------------------------------------------------------------
interface SVGGridOptions {
  exportList: ExportItem[];
  itemWidth: number;
  itemHeight: number;
  gap?: number;
  borderRadius?: number;
  columns?: number;
}

function generateAngularGradientForGrid(
  hexColors: string[],
  angle: number,
  width: number,
  height: number,
  index: number,
): { content: string; defs: string } {
  const colorStops = hexColors.map((color, i) => {
    const position = ((i / (hexColors.length - 1)) * 360).toFixed(6);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 1) ${position}deg`;
  });

  const centerX = width / 2;
  const centerY = height / 2;
  const diagonal = Math.sqrt(width * width + height * height);
  const foreignObjectSize = diagonal * 4;
  const foreignObjectHalf = foreignObjectSize / 2;
  const scale = diagonal / foreignObjectSize;
  const rotationRad = ((angle - 90) * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const a = scale * cos;
  const b = scale * sin;
  const c = -scale * sin;
  const d = scale * cos;

  const clipPathId = `paint${index}_angular_clip_path`;
  const clipDef = `<clipPath id="${clipPathId}"><rect width="${width}" height="${height}"/></clipPath>`;

  const gradientStops = hexColors
    .map((color, i) => {
      const position = i / (hexColors.length - 1);
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const bVal = parseInt(color.slice(5, 7), 16) / 255;
      return `{&quot;color&quot;:{&quot;r&quot;:${r},&quot;g&quot;:${g},&quot;b&quot;:${bVal},&quot;a&quot;:1},&quot;position&quot;:${position}}`;
    })
    .join(",");

  const figmaScale = Math.max(width, height);
  const m00 = figmaScale * cos;
  const m01 = -figmaScale * sin;
  const m10 = figmaScale * sin;
  const m11 = figmaScale * cos;
  const m02 = centerX - (m00 + m01) / 2;
  const m12 = centerY - (m10 + m11) / 2;

  const gradientFillData = `{&quot;type&quot;:&quot;GRADIENT_ANGULAR&quot;,&quot;stops&quot;:[${gradientStops}],&quot;stopsVar&quot;:[${gradientStops}],&quot;transform&quot;:{&quot;m00&quot;:${m00.toFixed(6)},&quot;m01&quot;:${m01.toFixed(6)},&quot;m02&quot;:${m02.toFixed(6)},&quot;m10&quot;:${m10.toFixed(6)},&quot;m11&quot;:${m11.toFixed(6)},&quot;m12&quot;:${m12.toFixed(6)}},&quot;opacity&quot;:1.0,&quot;blendMode&quot;:&quot;NORMAL&quot;,&quot;visible&quot;:true}`;

  const content = `<g clip-path="url(#${clipPathId})" data-figma-skip-parse="true"><g transform="matrix(${a.toFixed(6)} ${b.toFixed(6)} ${c.toFixed(6)} ${d.toFixed(6)} ${centerX.toFixed(6)} ${centerY.toFixed(6)})"><foreignObject x="${-foreignObjectHalf}" y="${-foreignObjectHalf}" width="${foreignObjectSize}" height="${foreignObjectSize}"><div xmlns="http://www.w3.org/1999/xhtml" style="background:conic-gradient(from 90deg,${colorStops.join(",")});height:100%;width:100%;opacity:1"></div></foreignObject></g></g><rect width="${width}" height="${height}" data-figma-gradient-fill="${gradientFillData}"/>`;

  return { content, defs: clipDef };
}

export function generateSVGGrid(options: SVGGridOptions): string {
  const {
    exportList,
    itemWidth,
    itemHeight,
    gap = 40,
    borderRadius = 0,
    columns: columnsProp,
  } = options;

  const gapX = gap;
  const gapY = gap * 2;
  const padding = 56;
  const columns = columnsProp ?? Math.min(exportList.length, 5);
  const rows = Math.ceil(exportList.length / columns);

  const totalWidth = columns * itemWidth + (columns - 1) * gapX + padding * 2;
  const totalHeight = rows * itemHeight + (rows - 1) * gapY + padding * 2;

  const minDimension = Math.min(itemWidth, itemHeight);
  const borderRadiusPx = (borderRadius / 100) * (minDimension / 2);

  const allDefs: string[] = [];
  const allContent: string[] = [];

  for (let index = 0; index < exportList.length; index++) {
    const item = exportList[index];
    if (!item) continue;

    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = padding + column * (itemWidth + gapX);
    const y = padding + row * (itemHeight + gapY);

    const clipPathId = `clip_${index}`;
    if (borderRadiusPx > 0) {
      allDefs.push(
        `<clipPath id="${clipPathId}"><rect width="${itemWidth}" height="${itemHeight}" rx="${borderRadiusPx}" ry="${borderRadiusPx}"/></clipPath>`,
      );
    }
    const clipPathAttr = borderRadiusPx > 0 ? ` clip-path="url(#${clipPathId})"` : "";

    if (item.style === "angularGradient") {
      const { content, defs } = generateAngularGradientForGrid(
        item.hexColors,
        item.angle,
        itemWidth,
        itemHeight,
        index,
      );
      allContent.push(`<g transform="translate(${x}, ${y})"${clipPathAttr}>${content}</g>`);
      allDefs.push(defs);
    } else {
      const itemSVG = generateSvgGradient(
        item.hexColors,
        item.style,
        item.angle,
        { seed: item.seed, searchString: "" },
        null,
        { width: itemWidth, height: itemHeight, gridItemIndex: index },
      );
      const svgMatch = itemSVG.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      if (svgMatch && svgMatch[1]) {
        let innerSVG = svgMatch[1];
        const defsMatch = innerSVG.match(/<defs>([\s\S]*?)<\/defs>/);
        if (defsMatch && defsMatch[1]) {
          allDefs.push(defsMatch[1]);
          innerSVG = innerSVG.replace(/<defs>[\s\S]*?<\/defs>/, "");
        }
        allContent.push(`<g transform="translate(${x}, ${y})"${clipPathAttr}>${innerSVG}</g>`);
      }
    }
  }

  let svgContent = `<svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" fill="none" xmlns="http://www.w3.org/2000/svg">`;
  svgContent += allContent.join("\n");
  if (allDefs.length > 0) svgContent += `\n<defs>\n${allDefs.join("\n")}\n</defs>`;
  svgContent += `\n</svg>`;
  return svgContent;
}

// ---------------------------------------------------------------------------
// PNG grid — NATIVE CANVAS renderer (the original round-trips each tile
// through an SVG → Image; deterministic math here instead: same geometry,
// no async image decoding, no foreignObject rasterization quirks). Stops are
// i/(n-1) for gradients and hard double-stop bands of 1/n for swatches, the
// same distributions data-ops' CSS generator uses.
// ---------------------------------------------------------------------------
const CANVAS_MAX = 16384; // per-side canvas limit on every engine

function fillTile(
  ctx: CanvasRenderingContext2D,
  item: ExportItem,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const colors = item.hexColors;
  const n = colors.length;
  if (n === 0) return;
  let grad: CanvasGradient;
  if (item.style.startsWith("angular")) {
    if (typeof ctx.createConicGradient !== "function")
      throw new Error("conic gradients unsupported");
    // CSS conic from-angle (0 = up, clockwise) → canvas start angle (0 = +x).
    grad = ctx.createConicGradient(((item.angle - 90) * Math.PI) / 180, x + w / 2, y + h / 2);
  } else if (item.style.startsWith("radial")) {
    // circle at 50% 50%, default farthest-corner sizing.
    const cx = x + w / 2;
    const cy = y + h / 2;
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) / 2);
  } else {
    // CSS linear angle line through the center: dir = (sinθ, −cosθ),
    // length = |w·sinθ| + |h·cosθ|.
    const rad = (item.angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const len = Math.abs(w * dx) + Math.abs(h * dy) || 1;
    const cx = x + w / 2;
    const cy = y + h / 2;
    grad = ctx.createLinearGradient(
      cx - (dx * len) / 2,
      cy - (dy * len) / 2,
      cx + (dx * len) / 2,
      cy + (dy * len) / 2,
    );
  }
  if (item.style.endsWith("Swatches")) {
    // Hard bands: two stops per boundary (duplicate offsets = abrupt edge).
    for (let i = 0; i < n; i++) {
      grad.addColorStop(i / n, colors[i]!);
      grad.addColorStop((i + 1) / n, colors[i]!);
    }
  } else if (n === 1) {
    grad.addColorStop(0, colors[0]!);
  } else {
    colors.forEach((c, i) => grad.addColorStop(i / (n - 1), c));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

function renderPNG(): Promise<Blob | null> {
  const { width: iw, height: ih } = dims();
  const gapX = options.gap;
  const gapY = options.gap * 2;
  const padding = 56;
  const cols = Math.min(options.columns, items.length) || 1;
  const rows = Math.ceil(items.length / cols);
  const totalW = cols * iw + (cols - 1) * gapX + padding * 2;
  const totalH = rows * ih + (rows - 1) * gapY + padding * 2;
  const scale = Math.min(1, CANVAS_MAX / totalW, CANVAS_MAX / totalH);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(totalW * scale));
  canvas.height = Math.max(1, Math.round(totalH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.scale(scale, scale);

  const radiusPx = (options.borderRadius / 100) * (Math.min(iw, ih) / 2);
  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padding + col * (iw + gapX);
    const y = padding + row * (ih + gapY);
    ctx.save();
    if (radiusPx > 0) {
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, iw, ih, radiusPx);
      else ctx.rect(x, y, iw, ih);
      ctx.clip();
    }
    fillTile(ctx, item, x, y, iw, ih);
    ctx.restore();
  });
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
}

// ---------------------------------------------------------------------------
// Actions: Copy (Data/SVG/PNG) + Download (SVG/PNG) with label-swap feedback.
// ---------------------------------------------------------------------------
function dims(): { width: number; height: number } {
  if (previewDims) return { width: previewDims[0], height: previewDims[1] };
  return { width: options.width ?? measured.w, height: options.height ?? measured.h };
}

function svgGrid(): string {
  const { width, height } = dims();
  return generateSVGGrid({
    exportList: items,
    itemWidth: width,
    itemHeight: height,
    gap: options.gap,
    borderRadius: options.borderRadius,
    columns: options.columns,
  });
}

// The original's Data payload: rounded coeffs (alpha dropped), a canonical
// URL per palette (web-lite's /seed form), and the sampled hex colors.
function jsonData(): string {
  const origin = location.origin;
  return JSON.stringify(
    items.map((item) => ({
      coeffs: item.coeffs.map((row) => row.slice(0, 3).map((n) => Math.round(n * 1000) / 1000)),
      url: `${origin}/${encodeURIComponent(item.seed)}?style=${item.style}&angle=${item.angle}&steps=${item.steps}`,
      seed: item.seed,
      style: item.style,
      angle: item.angle,
      steps: item.steps,
      hexColors: item.hexColors,
    })),
  );
}

const labelTimers = new WeakMap<HTMLElement, number>();

// The $seed copy feedback: the trigger's icon swaps to a check for 1.2s,
// then back to its original svg (stashed on first swap).
function flashCheck(trigger: HTMLElement): void {
  if (!trigger.hasAttribute("data-icon"))
    trigger.setAttribute("data-icon", trigger.innerHTML);
  trigger.innerHTML = CHECK_SVG;
  clearTimeout(labelTimers.get(trigger));
  labelTimers.set(
    trigger,
    window.setTimeout(() => {
      trigger.innerHTML = trigger.getAttribute("data-icon") ?? "";
    }, 1200),
  );
}

type CopyKind = "data" | "svg" | "png";

async function doCopy(kind: CopyKind, trigger: HTMLElement): Promise<void> {
  try {
    if (kind === "data") {
      await navigator.clipboard.writeText(jsonData());
    } else if (kind === "svg") {
      await navigator.clipboard.writeText(svgGrid());
    } else {
      const blob = await renderPNG();
      if (!blob) throw new Error("canvas unavailable");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    }
    flashCheck(trigger);
    announce(
      kind === "data" ? "Palette data copied" : `${kind.toUpperCase()} grid copied to clipboard`,
    );
  } catch {
    if (kind === "png") {
      // Image clipboard writes are blocked in several browsers/contexts —
      // fall back to downloading the file instead of dead-ending.
      await doDownload("png");
      return;
    }
    announce("Copy failed — clipboard unavailable");
  }
}

async function doDownload(kind: "svg" | "png"): Promise<void> {
  const blob =
    kind === "svg" ? new Blob([svgGrid()], { type: "image/svg+xml" }) : await renderPNG();
  if (!blob) {
    announce(`Could not render the ${kind.toUpperCase()} grid`);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `grabient-grid-${Date.now()}.${kind}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(`${kind.toUpperCase()} grid download started`);
}

// ---------------------------------------------------------------------------
// Panel: option inputs, presets menu, live preview
// ---------------------------------------------------------------------------
function syncPanelInputs(root: HTMLElement): void {
  const set = (id: string, v: string) => {
    const el = root.querySelector<HTMLInputElement>(`#export-${id}`);
    if (!el) return;
    el.value = v;
  };
  set("gap", String(options.gap));
  set("radius", String(options.borderRadius));
  set("cols", String(options.columns));
}

function measureCards(): void {
  const c = document.querySelector("#export-cards .card");
  if (c) {
    const r = c.getBoundingClientRect();
    if (r.width > 0 && r.height > 0)
      measured = { w: Math.round(r.width), h: Math.round(r.height) };
  }
  // An open auto dims popover follows the measured size (the seed's reactive
  // shownDims) — except the input currently being edited.
  if (dimsPanel && (options.width == null || options.height == null)) {
    const [w, h] = shownDims();
    dimsPanel.querySelectorAll<HTMLInputElement>("[data-dim-axis]").forEach((inp) => {
      if (document.activeElement !== inp)
        inp.value = String(inp.getAttribute("data-dim-axis") === "0" ? w : h);
    });
  }
}

let previewRaf = 0;

function renderPreview(): void {
  cancelAnimationFrame(previewRaf);
  previewRaf = requestAnimationFrame(() => {
    const box = document.getElementById("export-preview");
    if (!box || !isOpen || items.length === 0) return;
    box.innerHTML = svgGrid();
  });
}

function applyOptionInput(el: HTMLInputElement): void {
  const field = el.getAttribute("data-export-opt");
  const raw = el.value.trim();
  const n = raw === "" ? NaN : Number(raw);
  const finite = Number.isFinite(n);
  let value = "";
  switch (field) {
    case "gap":
      options.gap = finite ? Math.min(GAP_MAX, Math.max(GAP_MIN, Math.round(n))) : GAP_MIN;
      value = String(options.gap);
      break;
    case "radius":
      options.borderRadius = finite
        ? Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round(n)))
        : RADIUS_MIN;
      value = String(options.borderRadius);
      break;
    case "cols":
      options.columns = finite
        ? Math.min(COLS_MAX, Math.max(COLS_MIN, Math.round(n)))
        : COLS_MIN;
      value = String(options.columns);
      break;
    default:
      return;
  }
  el.value = value;
  saveOptions();
  renderPreview();
}

function wirePanel(root: HTMLElement): void {
  syncPanelInputs(root);
  const menu = window.__menu;
  if (!menu) return;
  const copyBtn = root.querySelector<HTMLElement>("#export-copy");
  const dlBtn = root.querySelector<HTMLElement>("#export-download");
  if (copyBtn)
    menu.menuTrigger(
      copyBtn,
      () => [
        { value: "data", label: "Data (JSON)" },
        { value: "svg", label: "SVG" },
        { value: "png", label: "PNG" },
      ],
      (v) => void doCopy(v as CopyKind, copyBtn),
    );
  if (dlBtn)
    menu.menuTrigger(
      dlBtn,
      () => [
        { value: "svg", label: "SVG" },
        { value: "png", label: "PNG" },
      ],
      (v) => void doDownload(v as "svg" | "png"),
    );
}

// ---------------------------------------------------------------------------
// Open/close + history integration
// ---------------------------------------------------------------------------
function renderCards(): void {
  const ol = document.getElementById("export-cards");
  if (!ol) return;
  ol.innerHTML = items.map(cardHtml).join("");
  document.dispatchEvent(new CustomEvent("likes:refresh-counts"));
  syncLogoAnimation(
    "export",
    items.map((item) => item.hexColors),
  );
  syncToggles(); // fresh toggle DOM needs pressed/label state
  measureCards();
  renderPreview();
}

// The open view replaces ONLY the grid: the h1 row above stays put (its text
// and slot swap — see syncH1/renderSlot), so nothing moves on the y axis.
function renderOpen(): void {
  closeDims();
  window.__renderNavSelectForExport?.(true);
  setHidden("grid-ssr", true);
  setHidden("grid-island", true);
  const root = document.getElementById("export-root");
  if (!root) return;
  root.hidden = false;
  root.innerHTML = `<div class="flex flex-col gap-10 md:flex-row md:gap-8">
<ol id="export-cards" class="mb-12 grid flex-1 auto-rows-[300px] grid-cols-1 content-start gap-x-10 gap-y-20 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4"></ol>
${panelHtml()}
</div>`;
  syncH1();
  renderSlot();
  renderCards();
  wirePanel(root);
}

function renderClosed(): void {
  closeDims();
  clearLogoAnimation("export");
  window.__renderNavSelectForExport?.(false);
  const root = document.getElementById("export-root");
  if (root) {
    root.hidden = true;
    root.replaceChildren();
  }
  setHidden("grid-ssr", false);
  setHidden("grid-island", false);
  syncH1();
  renderSlot();
}

function stripExport(href: string): string {
  const u = new URL(href, location.href);
  u.searchParams.delete("export");
  const s = u.searchParams.toString();
  return u.pathname + (s ? `?${s}` : "");
}

const exportOn = (): boolean => new URLSearchParams(location.search).get("export") === "true";

function openExport(): void {
  if (isOpen || closing || items.length === 0) return;
  isOpen = true;
  shownURL = stripExport(location.href);
  const u = new URL(location.href);
  u.searchParams.set("export", "true");
  history.pushState({ ...(history.state as Record<string, unknown> | null), export: 1 }, "", u.pathname + u.search);
  renderOpen();
  announce(`${items.length} palette${items.length === 1 ? "" : "s"} selected`);
}

function closeExport(): void {
  if (!isOpen || closing) return;
  if (history.state && (history.state as { export?: number }).export) {
    // The open state was pushed by us — unwind it so Back/Forward stay
    // consistent. The popstate lands in onPopstate, which tears the view down.
    closing = true;
    history.back();
    return;
  }
  isOpen = false;
  history.replaceState(history.state, "", shownURL);
  renderClosed();
}

// Registered (on list pages) as window.__popstateHandler: consume ONLY pure
// export-flag flips on the same base URL; anything else is a real navigation
// for the nav layer (bootExport re-syncs open/closed from the URL afterwards).
function onPopstate(): boolean {
  closing = false;
  const want = exportOn();
  if (want === isOpen) return false;
  if (stripExport(location.href) !== shownURL) return false;
  isOpen = want;
  if (want) renderOpen();
  else renderClosed();
  return true;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
function afterMutation(): void {
  renderSelected();
  if (isOpen && items.length === 0) {
    closeExport();
    return;
  }
  syncH1();
  renderSlot();
  if (isOpen) renderCards();
}

function toggleItem(btn: HTMLElement): void {
  const seed = btn.getAttribute("data-export-seed") ?? "";
  const style = btn.getAttribute("data-export-style") as PaletteStyle;
  const steps = Number(btn.getAttribute("data-export-steps"));
  const angle = Number(btn.getAttribute("data-export-angle"));
  const item = exportItemData(seed, style, steps, angle);
  if (!item) return;
  const result = toggleExportItem(item, items);
  items = result.items;
  if (!result.selected) {
    announce("Removed from export selection");
  } else if (result.dropped) {
    announce(`Added — oldest selection dropped (${MAX_EXPORT_ITEMS} max)`);
  } else {
    announce("Added to export selection");
  }
  afterMutation();
}

// ---------------------------------------------------------------------------
// Wiring (once per session) + per-swap boot
// ---------------------------------------------------------------------------
function wireOnce(): void {
  if (wired) return;
  wired = true;

  document.addEventListener("click", (e) => {
    const el = (e.target as Element | null)?.closest?.(
      "[data-export-toggle], #export-open, #export-close, #export-clear, #export-dims",
    ) as HTMLElement | null;
    if (!el) return;
    if (el.hasAttribute("data-export-toggle")) {
      e.preventDefault();
      toggleItem(el);
    } else if (el.id === "export-open") {
      openExport();
    } else if (el.id === "export-close") {
      closeExport();
    } else if (el.id === "export-clear") {
      const n = items.length;
      items = [];
      writeExportList(items);
      announce(`Cleared ${n} palette${n === 1 ? "" : "s"} from the export selection`);
      afterMutation();
    } else if (el.id === "export-dims") {
      if (dimsPanel) closeDims();
      else openDims();
    }
  });

  // The $seed dims popover's outside-close: any pointerdown outside the panel
  // and its trigger dismisses it (no refocus — matches edit.tsx).
  document.addEventListener("pointerdown", (e) => {
    if (!dimsPanel) return;
    const t = e.target as Node | null;
    if (dimsPanel.contains(t)) return;
    const btn = document.getElementById("export-dims");
    if (btn && btn.contains(t)) return;
    closeDims();
  });

  document.addEventListener("change", (e) => {
    const el = (e.target as Element | null)?.closest?.("[data-export-opt]");
    if (el) applyOptionInput(el as HTMLInputElement);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !isOpen) return;
    const t = e.target as Element | null;
    // Inputs (data-step-keys Escape = clear), menus, and the dims popover
    // handle their own Esc.
    if (t?.closest?.("input, select, textarea, .menu-pop, #export-dims-panel")) return;
    closeExport();
  });

  addEventListener("resize", () => {
    if (isOpen && (options.width == null || options.height == null)) {
      measureCards();
      renderPreview();
    }
  });

  // Island re-renders swap in fresh toggle DOM — re-sync pressed/labels (the
  // hearts MutationObserver pattern in app.client.js).
  let syncRaf = 0;
  new MutationObserver((recs) => {
    for (const r of recs)
      for (const n of r.addedNodes)
        if (
          n.nodeType === 1 &&
          ((n as Element).hasAttribute?.("data-export-toggle") ||
            (n as Element).querySelector?.("[data-export-toggle]"))
        ) {
          cancelAnimationFrame(syncRaf);
          syncRaf = requestAnimationFrame(syncToggles);
          return;
        }
  }).observe(document.body, { childList: true, subtree: true });
}

// Idempotent per-swap entry: re-read storage (cross-tab writes land too),
// adopt the URL's export state, re-render every surface.
export function bootExport(): void {
  wireOnce();
  items = readExportList();
  options = loadOptions();
  shownURL = stripExport(location.href);
  isOpen = exportOn() && items.length > 0;
  closing = false;
  // boot always runs on fresh SSR DOM, so the h1 still holds the page title.
  baseTitle = document.getElementById("list-h1")?.textContent ?? "";
  window.__popstateHandler = onPopstate;
  if (exportOn() && items.length === 0) {
    // Stale deep-link (the selection was cleared elsewhere): drop the flag.
    history.replaceState(history.state, "", shownURL);
  }
  renderSelected();
  if (isOpen) renderOpen();
  else renderClosed();
}
