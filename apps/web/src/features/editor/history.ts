import type { ParsedLocation, useRouter } from "@tanstack/solid-router";
import { createEffect, onCleanup, untrack } from "solid-js";
import { TRACKING_PARAM } from "../../lib/links.ts";
import { readSeedPage, type SeedPage, sameAddress, seedAddress, seedSearch } from "./address.ts";
import type { PaletteEditor } from "./editor.ts";
import { searchReader } from "./page.ts";

/* The address follows the palette. History holds pages: an edit, an undo, a redo, a change of view or a lock's turn
   rewrites the page's own entry in place, never adds one, so Back leaves an edited palette in one press. The entry
   keeps the palette's undo and what the page opened with, so Back, Forward and a reload bring them back.

   The address is written at most once per WRITE_MS, the first of a burst at once and the last always: Safari refuses a
   page more than a hundred history calls in thirty seconds, and a drag or a run of presses makes that many in a few.
   While a pointer is down the write waits for its release: each write runs the route again (its data, its head, the
   language menu's links), which in the middle of a drag costs frames, and nobody reads the address until it ends.
   A press on a link or on the way into the selection lands the last write before it is followed, and so does leaving
   the page. Another address arriving (Back, Forward, a link to another palette) is the editor's to take in, and a
   write waiting for its turn is dropped with the entry it was for. The campaign tags a reader landed with stay on
   their entry through its rewrites, where a copy of the address and analytics read them. */
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
    effect: e.effect(),
    locks: e.locks(),
    selection: e.selecting()
  });

/** The palette page the router's location names, or null where it names none. */
export const pageAt = (location: ParsedLocation): SeedPage | null =>
  readSeedPage(
    location.pathname.slice(1),
    searchReader(location.search as Record<string, unknown>)
  );
const tagsAt = (location: ParsedLocation) =>
  Object.fromEntries(
    Object.entries(location.search as Record<string, unknown>).filter(([name]) =>
      TRACKING_PARAM.test(name)
    )
  );

export function followAddress(
  e: PaletteEditor,
  router: Router,
  location: () => ParsedLocation,
  arrived: (page: SeedPage) => void
) {
  /* the address the entry shows: the editor's last write, or the address that arrived. It starts as the address the
     page landed on, which the editor writes over where it shows more (an effect the reader chose plays on a palette
     whose address names no style) */
  let shown = untrack(() => {
    const page = pageAt(location());
    return page ? seedAddress(page) : addressOf(e);
  });
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
      search: { ...seedSearch(page), ...tagsAt(location()) },
      replace: true,
      resetScroll: false,
      state: prev => ({ ...prev, ...e.entry() })
    });
  }
  /* a write leaves the change that asked for it: the router reads its own state as it navigates. One that comes due
     while a pointer is down is the release's to write */
  const due = () => {
    timer = undefined;
    if (!untrack(e.pressing)) flush();
  };
  const writeSoon = () => {
    if (!timer) timer = setTimeout(due, Math.max(0, WRITE_MS - (Date.now() - lastAt)));
  };
  createEffect(e.pressing, down => {
    if (!down && latest) writeSoon();
  });

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
    /* the page left for another, which may still be loading: a write waiting would land on that one's entry */
    if (!page) {
      cancel();
      return;
    }
    const address = seedAddress(page);
    /* an address written another way than the canonical (a link from elsewhere) is rewritten in place */
    let write = !sameAddress(address, at.pathname + at.searchStr);
    if (address !== shown) {
      cancel();
      shown = address;
      /* The selection opening over this palette, closing, or setting the size it exports at: the same page, whose
         undo and record stay, so a step taken in the selection is walked in its place among the edits. The
         selection's entry keeps them as the page's does, for a reload there. */
      const selecting = untrack(e.selecting);
      if (page.seed === untrack(e.seed) && (page.selection || selecting)) {
        write ||= page.selection && !selecting;
        e.take(page);
      } else {
        arrived(page);
        e.arrive(page, at.state as EntryState);
      }
    }
    if (write) {
      latest = address;
      writeSoon();
    }
  });

  /* A press that leads to another entry (a link, the way into the selection) writes what waits first: the entry it
     leaves keeps the router's address, and the selection's is made from it. Other presses, a drag's end among them,
     wait their turn, since a run of presses would otherwise write once each. A page being left writes what it has
     not. */
  const leaving = (event: Event) => {
    if (event.target instanceof Element && event.target.closest("a[href], [data-selection]"))
      flush();
  };
  addEventListener("click", leaving, true);
  addEventListener("pagehide", flush);
  /* the page left for another: its address was written as the press that left it landed */
  onCleanup(() => {
    cancel();
    removeEventListener("click", leaving, true);
    removeEventListener("pagehide", flush);
  });
  return {
    /** The entry keeps what the editor holds, its address unchanged, at the next write: a Save made the page stand
        for the palette saved, which a reload or a return finds. A write waits its turn, by which time the change that
        asked for it has settled. */
    keep() {
      latest ??= shown;
      writeSoon();
    },
    /** The address bar shows the palette now, out of turn: for what reads it there (U copies it). The router hands
        the browser its writes a moment later, unless told to now. */
    settle() {
      flush();
      router.history.flush();
    }
  };
}
