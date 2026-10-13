import type { ParsedLocation, useRouter } from "@tanstack/solid-router";
import { createEffect, onCleanup, untrack } from "solid-js";
import { readSeedPage, type SeedPage, sameAddress, seedAddress, seedSearch } from "./address.ts";
import type { PaletteEditor } from "./editor.ts";
import { searchReader } from "./page.ts";

/* The address follows the palette. History holds pages: an edit, an undo, a redo, a change of view or a lock's turn
   rewrites the page's own entry in place, never adds one, so Back leaves an edited palette in one press. The entry
   keeps the palette's undo and what the page opened with, so Back, Forward and a reload bring them back.

   The address is written at most once per WRITE_MS, the first of a burst at once and the last always: Safari refuses a
   page more than a hundred history calls in thirty seconds, and a drag makes that many in two. A press lands the last
   write before anything it leads to, and so does leaving the page. Another address arriving (Back, Forward, a link
   to another palette) is the editor's to take in, and a write waiting for its turn is dropped with the entry it
   was for. */
const WRITE_MS = 350;

type Router = ReturnType<typeof useRouter>;
interface EntryState {
  edits?: unknown;
  opened?: unknown;
}

const addressOf = (e: PaletteEditor) =>
  seedAddress({
    seed: e.seed(),
    view: { style: e.style(), steps: e.steps(), angle: e.angle(), size: e.size() },
    locks: e.locks(),
    selection: e.selecting()
  });

/** The palette page the router's location names, or null where it names none. */
export const pageAt = (location: ParsedLocation): SeedPage | null =>
  readSeedPage(
    location.pathname.slice(1),
    searchReader(location.search as Record<string, unknown>)
  );

export function followAddress(
  e: PaletteEditor,
  router: Router,
  location: () => ParsedLocation,
  arrived: (page: SeedPage) => void
) {
  /* the address the entry shows: the editor's last write, or the address that arrived */
  let shown = untrack(() => addressOf(e));
  let latest: string | null = null;
  let lastAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    latest = null;
    clearTimeout(timer);
    timer = undefined;
  };
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    const to = latest;
    if (!to) return;
    latest = null;
    lastAt = Date.now();
    shown = to;
    const page = readSeedPage(
      to.slice(1).split("?")[0],
      new URLSearchParams(to.split("?")[1] ?? "")
    );
    if (!page) return;
    void router.navigate({
      to: "/$id",
      params: { id: page.seed },
      search: seedSearch(page),
      replace: true,
      resetScroll: false,
      state: prev => ({ ...prev, ...e.entry() })
    });
  }
  /* a write leaves the change that asked for it: the router reads its own state as it navigates */
  const writeSoon = () => {
    if (!timer) timer = setTimeout(flush, Math.max(0, WRITE_MS - (Date.now() - lastAt)));
  };

  createEffect(
    () => addressOf(e),
    address => {
      if (address === shown) {
        /* a value dragged back to the address while another waits: the wait keeps this one */
        if (latest) latest = address;
        return;
      }
      latest = address;
      writeSoon();
    }
  );

  createEffect(location, at => {
    const page = pageAt(at);
    if (!page) return;
    const address = seedAddress(page);
    if (address !== shown) {
      cancel();
      shown = address;
      arrived(page);
      e.arrive(page, at.state as EntryState);
    }
    /* an address written another way than the canonical (a link from elsewhere) is rewritten in place */
    if (!sameAddress(address, at.pathname + at.searchStr)) {
      latest = address;
      writeSoon();
    }
  });

  /* a drag's last value is in the address the moment it lets go, a press on a link writes it before the link is
     followed, and a page being left writes what it has not */
  const lift = () => {
    if (latest) setTimeout(flush, 0);
  };
  addEventListener("pointerup", lift, true);
  addEventListener("click", flush, true);
  addEventListener("pagehide", flush);
  /* the page left for another: its address was written as the press that left it landed */
  onCleanup(() => {
    cancel();
    removeEventListener("pointerup", lift, true);
    removeEventListener("click", flush, true);
    removeEventListener("pagehide", flush);
  });
  return {
    /** The entry keeps what the editor holds, its address unchanged, at the next write: a Save made the page stand
        for the palette saved, which a reload or a return finds. A write waits its turn, by which time the change that
        asked for it has settled. */
    keep() {
      latest ??= shown;
      writeSoon();
    }
  };
}
