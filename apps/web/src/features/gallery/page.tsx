import { localHref } from "@grabient/i18n";
import { SaveToCollection } from "@grabient/ui/SaveToCollection.tsx";
import { createContext, createSignal, useContext } from "solid-js";
import { signInUnavailable } from "../../app/connection.ts";
import { ShellContext } from "../../app/shell.ts";
import type { Drawn } from "../../lib/palette.ts";
import { noteCounts, readLikeCounts } from "../account/likes.ts";
import { loginHref } from "../account/session.ts";
import { inputOf } from "../collections/client.ts";
import { createChecklists } from "../collections/collect.ts";
import type { UsePlace, UseSurface } from "../palette-use/use.ts";
import type { SearchPage } from "../search/bodies.ts";
import { searchedHere } from "../search/count.ts";
import { createSelectionScreen } from "../selection/SelectionScreen.tsx";
import { selection } from "../selection/selection.ts";
import { type ListParams, listSearch } from "./address.ts";
import type { PaletteItem } from "./schema.ts";

/* What a gallery page keeps for every card on it: its line, the selection and its export screen, the account's
   collections as a checklist, where the page stands on the site for counting what readers take, and what the frame
   paints. */

export function createGalleryPage(o: {
  /** the address's own path, without its query */
  path: () => string;
  params: () => ListParams;
  /** the kind of page a use is counted under */
  surface: () => UseSurface;
  /** where Enter counts this page's searches */
  counted: Extract<SearchPage, "home" | "palettes">;
  /** the palettes on screen first, as the page draws them: what the bar and the water carry */
  painted: () => readonly Drawn[];
}) {
  const words = () => o.params().words;
  /* what a press did or could not do, said on the line while the words it was said over stand */
  const [said, setSaid] = createSignal<{ words: string; message: string; error: boolean } | null>(
    null
  );
  const line = () => {
    const last = said();
    return last && last.words === words() ? last : null;
  };
  const say = (message: string) =>
    setSaid(message ? { words: words(), message, error: false } : null);
  const checklists = createChecklists(say);
  const saving = checklists.selection(() => selection().map(inputOf));
  const chosen = createSelectionScreen({
    note: say,
    save: () => (
      <SaveToCollection
        own={saving.own}
        onOwn={saving.onOwn}
        onChanged={saving.onChanged}
        onToggle={saving.onToggle}
        onNew={saving.onNew}
        signIn={saving.signIn}
        disabled={signInUnavailable()}
      />
    )
  });
  /* after the selection's own, so this one stands: the selection while its screen is shown, else the page's palettes */
  useContext(ShellContext)?.paint(() => (chosen.open() ? selection() : o.painted()));

  /* The cards the window drew this turn, by when their lists read their counts: each count is noted at that age, so
     an old one is never made fresh, then asked for again where it is old, all in one ask. */
  const drawn = new Map<number, { seed: string; likes: number }[]>();
  const count = () => {
    const seeds: string[] = [];
    for (const [at, items] of drawn) {
      noteCounts(items, at);
      for (const item of items) seeds.push(item.seed);
    }
    drawn.clear();
    void readLikeCounts(seeds).catch(() => {});
  };

  return {
    params: o.params,
    words,
    /** what the line says now, and whether it is a refusal */
    line,
    say,
    /** why the field's text cannot be searched; "" once the reader types again, which leaves any other note be */
    refuse: (message: string) =>
      setSaid(now =>
        message ? { words: words(), message, error: true } : now?.error ? null : now
      ),
    /** a card of a list was drawn: its count, read with the list at `at`, is kept up */
    counted: (item: PaletteItem, at: number) => {
      if (!drawn.size) queueMicrotask(count);
      const read = drawn.get(at) ?? [];
      read.push({ seed: item.kseed, likes: item.likes });
      drawn.set(at, read);
    },
    /** the selection's press, its floating twin and its export screen */
    chosen,
    checklists,
    /** where the page stands, for counting what a reader opens and takes */
    place: (): UsePlace => {
      const surface = o.surface();
      const asked = words();
      return {
        surface,
        ...(asked ? { words: asked } : {}),
        searched: surface !== "saved" && !!asked && searchedHere(asked, o.counted)
      };
    },
    /** this page's address, without the selection */
    here: () => o.path() + listSearch(o.params(), { selection: false }),
    /** sign in, and back to this page */
    signIn: () => localHref(loginHref(o.path() + listSearch(o.params(), { selection: false })))
  };
}

export type GalleryPage = ReturnType<typeof createGalleryPage>;
export const GalleryContext = createContext<GalleryPage>();
