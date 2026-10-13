import { msg, t } from "@grabient/i18n";
import { createDone } from "@grabient/ui/done.ts";
import { useQueryClient } from "@tanstack/solid-query";
import { createEffect, createSignal } from "solid-js";
import * as v from "valibot";
import { toast } from "../../app/toast.ts";
import { liked } from "../account/likes.ts";
import { isAdmin } from "../account/session.ts";

/* An admin's Save: the palette on screen takes the place of the one the page opened, in the gallery (its date, likes and
   heat) and in every agent collection that holds it. The page asks where the opened palette stands as it lands, so the
   press can say where it would go, or why it cannot: a palette anyone liked, the admin included, stays as it is, and
   one the site does not hold has nowhere to go. Once saved, the page stands for the new palette, and every list the
   browser holds is read again, so Back finds the new palette in the old one's place. */

const Standing = v.object({
  seed: v.string(),
  gallery: v.nullable(v.object({})),
  collections: v.array(v.object({ slug: v.string(), title: v.string() })),
  liked: v.number()
});
type Standing = v.InferOutput<typeof Standing>;

/* the standings asked this page's life, the latest few: an admin edits one palette at a time */
const KEPT = 16;
const [standings, setStandings] = createSignal<ReadonlyMap<string, Standing>>(new Map());
const asking = new Set<string>();
function keep(seed: string, standing: Standing) {
  setStandings(map => {
    const next = new Map(map);
    next.delete(seed);
    next.set(seed, standing);
    if (next.size > KEPT) next.delete(next.keys().next().value as string);
    return next;
  });
}
async function ask(seed: string) {
  if (asking.has(seed) || standings().has(seed)) return;
  asking.add(seed);
  try {
    const answer = await fetch(`/api/me/palettes/${seed}`, { cache: "no-store" });
    /* an answer in another shape is no standing: Save waits, as it does when the read fails */
    if (answer.ok) keep(seed, v.parse(Standing, await answer.json()));
  } catch {
    /* Save waits; the next palette opened asks again */
  } finally {
    asking.delete(seed);
  }
}

export function createPaletteSave(o: {
  /** the palette on screen */
  seed: () => string;
  /** the palette the page opened, or last saved */
  opened: () => string;
  /** the page now stands for this palette */
  saved: (seed: string) => void;
  key: () => string;
}) {
  const queries = useQueryClient();
  const [saving, setSaving] = createSignal(false);
  const [done, markDone] = createDone<"saved">(1600);
  createEffect(
    () => (isAdmin() ? o.opened() : ""),
    opened => {
      if (opened) void ask(opened);
    }
  );
  const standing = () => standings().get(o.opened());
  /** why Save cannot put this palette anywhere, or nothing */
  const reason = () => {
    const st = standing();
    if (!st) return "";
    if (st.liked > 0 || liked(o.opened())) return t("Liked by someone");
    return st.gallery || st.collections.length ? "" : t("Not in the gallery or a collection");
  };
  const can = () => isAdmin() && !saving() && !!standing() && !reason() && o.seed() !== o.opened();
  /** where the press puts it, then its key */
  const tip = () => {
    const st = standing();
    const n = st?.collections.length ?? 0;
    const where = !st
      ? ""
      : st.gallery && n
        ? t(
            "Replaces it in the gallery and {count, plural, one {# collection} other {# collections}}",
            { count: n }
          )
        : st.gallery
          ? t("Replaces it in the gallery")
          : n
            ? t("Replaces it in {count, plural, one {# collection} other {# collections}}", {
                count: n
              })
            : "";
    return where ? `${where} · ${o.key()}` : o.key();
  };
  /* a second press in the same moment saves nothing: the signal that one is under way settles a microtask later */
  let busy = false;
  async function save() {
    if (busy) return;
    if (!can()) {
      if (isAdmin() && reason()) toast(reason());
      return;
    }
    const from = o.opened();
    const to = o.seed();
    const before = standing();
    busy = true;
    setSaving(true);
    try {
      const answer = await fetch(`/api/me/palettes/${from}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: to })
      });
      const body = (await answer.json().catch(() => null)) as {
        error?: string;
        palette?: { seed?: string };
      } | null;
      if (!answer.ok) throw new Error(t(body?.error ?? msg("Couldn't save.")));
      const seed = body?.palette?.seed ?? to;
      if (before) keep(seed, { ...before, seed, liked: 0 });
      o.saved(seed);
      void queries.invalidateQueries();
      markDone("saved");
    } catch (error) {
      toast(error instanceof Error && error.message ? error.message : t("Couldn't save."));
    } finally {
      busy = false;
      setSaving(false);
    }
  }
  return {
    admin: isAdmin,
    can,
    reason,
    tip,
    saving,
    done: () => done() === "saved",
    save
  };
}
export type PaletteSave = ReturnType<typeof createPaletteSave>;
