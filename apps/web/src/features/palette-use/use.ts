import { isServer } from "@solidjs/web";
import { colorFormat } from "../../lib/color-format.ts";
import type { Drawn } from "../../lib/palette.ts";
import { adminAccount } from "../account/session.ts";

/* What a reader does with a public palette: opened from a card, copied, downloaded, and a collection's page seen. Each
   is sent to the Worker (POST /api/used), which counts it for the seeding agents with no address, account or cookie,
   and keeps only palettes the site shows publicly. An admin's own use is the site at work, never a visitor's, and is
   not sent. Nothing waits on it and nothing is shown. Browser only. */

export type UseSurface =
  | "home"
  | "list"
  | "search"
  | "saved"
  | "collections"
  | "collection"
  | "selection"
  | "editor";
/** Where on the site: the kind of page, the search it shows, and whether this tab counted that search. */
export interface UsePlace {
  surface: UseSurface;
  words?: string;
  searched?: boolean;
}
/** Where on the page: the public collection the card stood under, and its place there or in the list, from 0. */
export interface UseAt {
  collection?: string;
  position?: number;
}
type UsedPalette = Pick<Drawn, "seed"> & Partial<Omit<Drawn, "seed">>;

function send(body: Record<string, unknown>) {
  if (isServer || adminAccount()) return;
  try {
    fetch("/api/used", {
      method: "POST",
      keepalive: true,
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).catch(() => {});
  } catch {
    /* counting never stands in a press's way */
  }
}
/* CSS and its file's address follow Settings' color spelling: another than OKLCH says which (css:hex) */
const spelled = (format: string) => {
  const kind = colorFormat();
  return kind !== "oklch" && (format === "css" || format === "link:css")
    ? `${format}:${kind}`
    : format;
};
const item = (p: UsedPalette, at?: UseAt) => ({
  seed: p.seed,
  style: p.style,
  steps: p.steps,
  angle: p.angle,
  ...(at?.position !== undefined && at.position >= 0 ? { position: at.position } : {})
});

/* the cards opened in this tab, by seed: where the editor's palette came from, so a copy there counts under the
   collection and the place it was opened from; kept while the tab stays on the site */
const OPENED_KEPT = 40;
const opened = new Map<string, UseAt>();

/** Edit pressed on a card. */
export function useOpened(place: UsePlace, palette: UsedPalette, at: UseAt = {}): void {
  opened.delete(palette.seed);
  opened.set(palette.seed, at);
  if (opened.size > OPENED_KEPT) opened.delete(opened.keys().next().value!);
  send({
    action: "open",
    surface: place.surface,
    words: place.words,
    collection: at.collection,
    searched: !!place.searched,
    items: [item(palette, at)]
  });
}

/** A card's, the editor's or the selection's copy or download: each palette with the view it was taken in. */
export function useTaken(
  action: "copy" | "download",
  format: string,
  place: UsePlace,
  palettes: readonly UsedPalette[],
  at: UseAt = {}
): void {
  if (!palettes.length) return;
  const as = spelled(format);
  send({
    action,
    format: as,
    surface: place.surface,
    words: place.words,
    collection: at.collection,
    searched: !!place.searched,
    items: palettes.slice(0, 50).map(p => item(p, at))
  });
}

/** The editor's copy or download. `openedSeed` is the palette the editor opened on, `palette` what it shows now: a
    palette changed since counts as a use of the one opened, and the Worker keeps how it changed as numbers. */
export function useInEditor(
  action: "copy" | "download",
  format: string,
  openedSeed: string,
  palette: UsedPalette
): void {
  const at = opened.get(openedSeed) ?? {};
  const edited = palette.seed !== openedSeed ? palette.seed : undefined;
  const as = spelled(format);
  send({
    action,
    format: as,
    surface: "editor",
    collection: at.collection,
    items: [item({ ...palette, seed: openedSeed }, at)],
    ...(edited ? { edited } : {})
  });
}

/* A view counts once the reader has pressed, typed, scrolled with a wheel or touched: a crawler that runs the page
   under a browser's name passes the Worker's check, and would count a view of every collection it opens. The views
   held until then are the last few pages'. */
const INPUTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
let present = false;
let held: (() => void)[] = [];
function arrive(event: Event) {
  if (!event.isTrusted) return;
  present = true;
  for (const type of INPUTS) document.removeEventListener(type, arrive, true);
  const due = held;
  held = [];
  for (const run of due) run();
}
function whenPresent(run: () => void) {
  if (present) return run();
  if (!held.length)
    for (const type of INPUTS)
      document.addEventListener(type, arrive, { capture: true, passive: true });
  held = [...held.slice(-9), run];
}

/** A public collection's page, seen. */
export function useCollectionSeen(slug: string): void {
  if (isServer) return;
  whenPresent(() => send({ action: "view", surface: "collection", collection: slug, items: [] }));
}
