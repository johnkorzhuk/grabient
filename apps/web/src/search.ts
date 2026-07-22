// TanStack Router-style search param validation (validateSearch + stripSearchParams),
// shared by the worker (SSR + /api/palettes) and the Solid islands.
// v.fallback collapses invalid values to defaults instead of throwing — the
// pattern TanStack's search-param docs recommend for valibot.
import * as v from "valibot";
import type { PaletteStyle } from "@repo/data-ops/valibot-schema/grabient";

// Literal copy of data-ops PALETTE_STYLES kept out of the client bundle's
// runtime imports; `satisfies` pins it to the source-of-truth type and a unit
// test asserts runtime equality.
export const STYLE_VALUES = [
  "angularGradient",
  "angularSwatches",
  "linearGradient",
  "linearSwatches",
  "radialGradient",
  "radialSwatches",
] as const satisfies readonly PaletteStyle[];

export const DEFAULT_LIMIT = 24;

const int = (min: number, max: number) =>
  v.pipe(
    v.string(),
    v.transform(Number),
    v.number(),
    v.finite(),
    v.integer(),
    v.minValue(min),
    v.maxValue(max),
  );

const auto = <T extends v.GenericSchema<string, number>>(schema: T) =>
  v.fallback(
    v.optional(v.union([v.literal("auto"), schema]), "auto" as const),
    "auto" as const,
  );

export const listSearchSchema = v.object({
  style: v.fallback(
    v.optional(v.union([v.literal("auto"), v.picklist(STYLE_VALUES)]), "auto" as const),
    "auto" as const,
  ),
  steps: auto(int(2, 50)),
  angle: auto(int(0, 360)),
  page: v.fallback(v.optional(int(1, 1_000_000), "1"), 1),
  limit: v.fallback(v.optional(int(12, 96), String(DEFAULT_LIMIT)), DEFAULT_LIMIT),
});

export type ListSearch = v.InferOutput<typeof listSearchSchema>;

const KNOWN_KEYS = ["style", "steps", "angle", "page", "limit"] as const;

export function parseListSearch(sp: URLSearchParams): ListSearch {
  const raw: Record<string, string> = {};
  for (const k of KNOWN_KEYS) {
    const value = sp.get(k);
    if (value !== null) raw[k] = value;
  }
  return v.parse(listSearchSchema, raw);
}

/** Canonical query string: default values omitted so URLs and cache keys stay stable. */
export function searchString(s: ListSearch, overrides: Partial<ListSearch> = {}): string {
  const m = { ...s, ...overrides };
  const q = new URLSearchParams();
  if (m.style !== "auto") q.set("style", m.style);
  if (m.steps !== "auto") q.set("steps", String(m.steps));
  if (m.angle !== "auto") q.set("angle", String(m.angle));
  if (m.page !== 1) q.set("page", String(m.page));
  if (m.limit !== DEFAULT_LIMIT) q.set("limit", String(m.limit));
  const str = q.toString();
  return str ? `?${str}` : "";
}

/**
 * Preview dimensions (seed pages): "WxH" compact format, island-owned like
 * `mod` — not part of the list schema, preserved by normalizeSearch as an
 * unknown param. Bounds mirror the original's width/height validators.
 */
export type PreviewSize = "auto" | [number, number];
export const MIN_DIM = 40;
export const MAX_DIM = 6000;

export function parseSize(raw: string | null): PreviewSize {
  if (!raw) return "auto";
  const m = raw.match(/^(\d{2,4})x(\d{2,4})$/);
  if (!m) return "auto";
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w < MIN_DIM || w > MAX_DIM || h < MIN_DIM || h > MAX_DIM) return "auto";
  return [w, h];
}

export function sizeParam(size: PreviewSize): string | null {
  return size === "auto" ? null : `${size[0]}x${size[1]}`;
}

/**
 * stripSearchParams-style normalization: validates known params, drops invalid
 * and default-valued ones, preserves unknown params (utm_* etc.) in their
 * original order. Returns the normalized search string, or null when the URL
 * is already canonical (idempotent — a normalized URL always returns null).
 */
export function normalizeSearch(sp: URLSearchParams): string | null {
  const parsed = parseListSearch(sp);
  const rest = new URLSearchParams(sp);
  for (const k of KNOWN_KEYS) rest.delete(k);
  const canonical = new URLSearchParams(searchString(parsed).slice(1));
  for (const [k, value] of canonical) rest.set(k, value);
  const next = rest.toString() ? `?${rest.toString()}` : "";
  const current = sp.toString() ? `?${sp.toString()}` : "";
  return next === current ? null : next;
}
