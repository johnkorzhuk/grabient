import { createSignal } from "solid-js";
import { parseListSearch, searchString, type ListSearch } from "../search";

export type Sort = "popular" | "newest" | "oldest";

export type ListKey = ListSearch & { sort: Sort };

function sortFromPath(): Sort {
  return location.pathname === "/newest"
    ? "newest"
    : location.pathname === "/oldest"
      ? "oldest"
      : "popular";
}

export function readKey(): ListKey {
  return { ...parseListSearch(new URLSearchParams(location.search)), sort: sortFromPath() };
}

export function keyToSearch(k: ListKey): string {
  const { sort, ...search } = k;
  return searchString(search);
}

export const [listKey, setListKey] = createSignal<ListKey>(
  typeof location !== "undefined" ? readKey() : ({} as ListKey),
);

/**
 * Transient view overlay: hovering a menu option or spinning a number input
 * previews style/steps/angle on the rendered palettes WITHOUT committing —
 * the current site's hover-preview behavior. Cleared when the change commits.
 */
export type ViewPatch = Pick<ListSearch, "style" | "steps" | "angle">;
export const [previewPatch, setPreviewPatch] = createSignal<ViewPatch | null>(null);

/** Effective params the palettes render with: preview layered over committed. */
export function viewParams(): ListKey {
  const p = previewPatch();
  return p ? { ...listKey(), ...p } : listKey();
}

/**
 * Update params in place: URL via replaceState (pushState for page changes),
 * no navigation. Option changes are pure view transforms, so `page` is
 * preserved — matching the current site's `...prev` spread.
 */
export function updateKey(patch: Partial<ListKey>, opts: { push?: boolean } = {}): void {
  const next = { ...listKey(), ...patch };
  const path = next.sort === "popular" ? "/" : `/${next.sort}`;
  // keyToSearch only knows view params — carry the export view's URL flag
  // forward so changing options/paging while it's open doesn't drop it.
  const qs = keyToSearch(next);
  const keepExport = new URLSearchParams(location.search).get("export") === "true";
  history[opts.push ? "pushState" : "replaceState"](
    history.state,
    "",
    path + qs + (keepExport ? `${qs ? "&" : "?"}export=true` : ""),
  );
  // Keep the nav layer's list-search memory current (island updates bypass swap()).
  try {
    sessionStorage.setItem("gl-list-search", location.search);
  } catch {}
  setListKey(next);
}

export function syncFromLocation(): void {
  setListKey(readKey());
}
