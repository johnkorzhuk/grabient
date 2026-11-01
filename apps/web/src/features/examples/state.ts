/* The palette a palette's examples page shows, which the editor's keys turn here as they do there: B for a random
   palette of as many keyframes, I to invert it, E to reverse it, and the undo, which walks these turns on this page and
   never leaves it. The page is one for each palette, its parts in the looks its seed picks (looks.ts), so the steps'
   and the angle's keys have nothing to turn here. The address follows, written in the page's own history entry, never a new one, so Back leaves the
   page in one press; at most once each WRITE_MS, the first of a burst at once and the last always, as the editor's
   (history.ts): Safari refuses a page more than a hundred history calls in thirty seconds. Another address arriving
   (Back, Forward, a link) is taken in whole. What the page paints passes the flash guard, as the editor's picture
   does: a held key turns the palette faster than three times a second, and the examples repaint whole. */
import { canonical, encodePalette } from "@grabient/engine";
import { luminance } from "@grabient/engine/contrast.ts";
import { createFlashGuard } from "@grabient/ui/flash.ts";
import { keyRow } from "@grabient/ui/keymap.ts";
import type { Binding } from "@grabient/ui/keys.ts";
import type { ParsedLocation, useRouter } from "@tanstack/solid-router";
import { createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { copyAddress } from "../../app/keys.ts";
import { examplesPath } from "../../lib/page-meta.ts";
import { NO_LOCKS, readSeedPage } from "../editor/address.ts";
import { onceAFrame } from "../editor/keys.ts";
import * as ops from "../editor/ops.ts";
import { searchReader } from "../editor/page.ts";
import { plainOf } from "./looks.ts";
import { drawnColors, type Shown } from "./paint.ts";

const WRITE_MS = 350;
/** The turns an undo walks back, at most. */
const LIMIT = 100;

type Router = ReturnType<typeof useRouter>;

const addressOf = (s: Shown) => examplesPath(s.seed);
/** The palette an examples address names, or null where it names none. */
function shownAt(location: ParsedLocation): Shown | null {
  const [id, rest] = location.pathname.slice(1).split("/");
  if (rest !== "examples" || !id) return null;
  const page = readSeedPage(id, searchReader({}));
  return page ? plainOf(page.seed, page.palette) : null;
}

export function createExamplesState(o: {
  initial: Shown;
  router: Router;
  location: () => ParsedLocation;
}) {
  const [now, setNow] = createSignal<Shown>(o.initial);
  /* a plain copy: a signal written now reads its old value until the write settles */
  let plain = o.initial;
  let past: Shown[] = [];
  let ahead: Shown[] = [];
  /* what the page paints: the same, except that a turn which would complete a flash waits a moment */
  const painted = createFlashGuard(now, s => drawnColors(s).map(luminance));

  /* the address the entry shows: the last one written, or the one that arrived */
  let shown = addressOf(o.initial);
  let latest: Shown | null = null;
  let lastAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    latest = null;
    clearTimeout(timer);
    timer = undefined;
  };
  /** The waiting write, now: before a link is followed or the address copied. */
  function settle() {
    clearTimeout(timer);
    timer = undefined;
    const s = latest;
    if (!s) return;
    latest = null;
    lastAt = Date.now();
    shown = addressOf(s);
    void o.router.navigate({
      to: "/$id/examples",
      params: { id: s.seed },
      search: {},
      replace: true,
      resetScroll: false
    });
  }
  const writeSoon = () => {
    if (!timer) timer = setTimeout(settle, Math.max(0, WRITE_MS - (Date.now() - lastAt)));
  };
  /** The page turned to another palette: a step the undo walks back. */
  function put(next: Shown, step = true) {
    if (addressOf(next) === addressOf(plain)) return;
    if (step) {
      past = [...past.slice(-(LIMIT - 1)), plain];
      ahead = [];
    }
    plain = next;
    setNow(next);
    latest = addressOf(next) === shown ? null : next;
    if (latest) writeSoon();
  }
  const withPalette = (palette: Shown["palette"]): Shown => {
    const P = canonical(palette);
    return plainOf(encodePalette(P), P);
  };

  /* an address arriving from elsewhere is the page's whole: its palette, and an undo that starts again */
  createEffect(o.location, at => {
    const next = shownAt(at);
    if (!next) {
      cancel();
      return;
    }
    const address = addressOf(next);
    if (address === shown || address === addressOf(untrack(now))) return;
    cancel();
    shown = address;
    past = [];
    ahead = [];
    plain = next;
    setNow(next);
  });
  onCleanup(cancel);

  return {
    /** the palette as the keys left it, which the address follows */
    now,
    /** the palette as the page paints it */
    painted,
    settle,
    random() {
      put(withPalette(ops.rolled(plain.palette, [], NO_LOCKS).palette));
    },
    invert() {
      put(withPalette(ops.inverted(plain.palette, [])));
    },
    reverse() {
      put(withPalette(ops.reversed(plain.palette, [])));
    },
    canUndo: () => past.length > 0,
    canRedo: () => ahead.length > 0,
    undo() {
      const back = past.at(-1);
      if (!back) return;
      past = past.slice(0, -1);
      ahead = [plain, ...ahead];
      put(back, false);
    },
    redo() {
      const next = ahead[0];
      if (!next) return;
      ahead = ahead.slice(1);
      past = [...past, plain];
      put(next, false);
    }
  };
}
export type ExamplesState = ReturnType<typeof createExamplesState>;

const row = (id: string) => {
  const found = keyRow(id);
  if (!found) throw new Error(`No key map row ${id}`);
  return found;
};

/** The editor's keys that turn the palette, as this page answers them. Each names its row of the key map, so a key the
    reader changed on the Shortcuts page applies here and the ? list shows it. */
export function examplesBindings(st: ExamplesState): Binding[] {
  const bind = (id: string, run: Binding["run"], when?: () => boolean): Binding => {
    const r = row(id);
    return { id, key: r.keys, label: r.label, scope: r.scope, run, when };
  };
  return [
    /* the address as the last turn leaves it, whose write may still be waiting its turn */
    bind("copyUrl", () => {
      st.settle();
      copyAddress();
    }),
    bind(
      "random",
      onceAFrame(() => st.random())
    ),
    bind(
      "invert",
      onceAFrame(() => st.invert())
    ),
    bind(
      "reverse",
      onceAFrame(() => st.reverse())
    ),
    /* the page's own undo while it has turns to walk; the site's otherwise */
    bind(
      "undo",
      i => (i === 0 ? st.undo() : st.redo()),
      () => st.canUndo() || st.canRedo()
    )
  ];
}
