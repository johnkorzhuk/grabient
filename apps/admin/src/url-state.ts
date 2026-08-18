// The URL is this dashboard's global store.
//
// There is no client runtime here — no router, no signals, no bundler — so
// every piece of view state that outlives a single render has to live in the
// address bar. That is a constraint, but it is also the behaviour a router
// like TanStack's gives you deliberately: state that is linkable, shareable,
// survives a reload, and can be handed to an agent as a URL.
//
// What a router also gives you, and what hand-written links do NOT, is the
// guarantee that navigation MERGES state rather than dropping it. Building
// hrefs by hand meant every `<a>` was a chance to silently reset the range —
// and one of them did. So this module is the small version of that guarantee:
//
//   parseState(url)        the whole store, parsed and validated, once per request
//   href(path, state, ...) the ONLY way a link is built anywhere in the app
//
// A path declares which keys it actually consumes (PARAMS below), so /goals
// never grows a ?globe= it ignores, and adding a new piece of state means
// adding it here rather than auditing every link.

import { parseRange, DEFAULT_RANGE, type RangeKey, type RangeOption } from "./range";

export type GlobeMetric = "requests" | "people" | "threats" | "data";

export interface DashboardState {
  /** Resolved window. Every data module on a range-aware page honours it. */
  range: RangeOption;
  /** Which layer the world card draws. */
  globe: GlobeMetric;
  /** Reports archive filter. */
  kind?: "report" | "digest";
  /** Reports keyset cursor. Deliberately NOT propagated across pages. */
  before?: string;
}

const GLOBE_VALUES: readonly GlobeMetric[] = ["requests", "people", "threats", "data"];
const DEFAULT_GLOBE: GlobeMetric = "requests";

/**
 * Which state keys each path reads. A key absent here is not emitted into
 * that path's links — the alternative is every URL carrying every parameter,
 * which turns a shared link into a puzzle.
 *
 * `before` is intentionally nowhere: a cursor is a position inside one
 * listing, and carrying it onto another page would land the reader mid-list
 * for no reason. It is added explicitly by the one link that needs it.
 */
const PARAMS: Record<string, readonly (keyof DashboardState)[]> = {
  "/": ["range", "globe"],
  "/trends": ["range"],
  "/indexation": ["range"],
  "/acquisition": ["range"],
  "/goals": [],
  "/campaigns": [],
  "/reports": ["kind"],
  "/brief": [],
  "/ops": [],
};

export function parseState(url: URL): DashboardState {
  const params = url.searchParams;
  const globe = params.get("globe");
  const kind = params.get("kind");
  return {
    range: parseRange(params.get("range")),
    globe: GLOBE_VALUES.includes(globe as GlobeMetric) ? (globe as GlobeMetric) : DEFAULT_GLOBE,
    kind: kind === "report" || kind === "digest" ? kind : undefined,
    before: params.get("before") ?? undefined,
  };
}

/**
 * Build a link to `path`, carrying the current state forward.
 *
 * Overrides are how a control changes ONE key without knowing about the rest:
 * the range selector passes `{ range }`, the globe toggle passes `{ globe }`,
 * and both keep everything else exactly as the reader left it. Values equal to
 * their default are omitted, so the common URL stays clean and
 * `/trends` and `/trends?range=28d` never diverge as two spellings of one view.
 */
export function href(
  path: string,
  state: DashboardState,
  overrides: Partial<{ range: RangeKey; globe: GlobeMetric; kind?: string; before?: string }> = {},
): string {
  const allowed = PARAMS[path] ?? [];
  const params = new URLSearchParams();

  const range = overrides.range ?? state.range.key;
  if (allowed.includes("range") && range !== DEFAULT_RANGE) params.set("range", range);

  const globe = overrides.globe ?? state.globe;
  if (allowed.includes("globe") && globe !== DEFAULT_GLOBE) params.set("globe", globe);

  const kind = "kind" in overrides ? overrides.kind : state.kind;
  if (allowed.includes("kind") && kind) params.set("kind", kind);

  // Cursors are per-link, never inherited — see the note on PARAMS.
  if (overrides.before) params.set("before", overrides.before);

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Pages whose content actually varies with the range — they draw the control. */
export const RANGE_AWARE = new Set(
  Object.entries(PARAMS)
    .filter(([, keys]) => keys.includes("range"))
    .map(([path]) => path),
);

export const NAV_PATHS = Object.keys(PARAMS);
