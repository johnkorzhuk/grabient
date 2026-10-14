import { decodePalette } from "@grabient/engine";
import { STEPS_MIN } from "@grabient/engine/view.ts";
import { msg, t } from "@grabient/i18n";
import { createDone } from "@grabient/ui/done.ts";
import { useQueryClient } from "@tanstack/solid-query";
import { createEffect, createSignal, untrack } from "solid-js";
import * as v from "valibot";
import { toast } from "../../app/toast.ts";
import { liked, movePaletteLike } from "../account/likes.ts";
import { api, isAdmin, shownError } from "../account/session.ts";

/* An admin's Save: the palette on screen takes the place of the one the page opened, in the gallery (its date, likes and
   heat) and in every one of Grabient's collections that holds it. The page asks where the opened palette stands as it
   lands, so the press can say where it would go, or why it cannot: a palette anyone liked, the admin included, stays as
   it is, and one the site does not hold has nowhere to go. Once saved, the page stands for the new palette, and every
   list the browser holds shows it in the old one's place, so Back finds the page as it now is. */

/** Where a palette stands, as `GET /api/me/palettes/{seed}` answers an admin. */
export const Standing = v.object({
  seed: v.string(),
  gallery: v.nullable(v.object({})),
  collections: v.array(v.object({ slug: v.string(), title: v.string() })),
  /** a person other than the asking admin liked it */
  liked: v.boolean()
});
type Standing = v.InferOutput<typeof Standing>;
/** What `PUT /api/me/palettes/{seed}` answers: the palette that now stands there. */
export const Saved = v.object({ palette: v.object({ seed: v.string() }) });

const at = (seed: string) => `/api/me/palettes/${encodeURIComponent(seed)}`;

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
  if (asking.has(seed) || untrack(standings).has(seed)) return;
  asking.add(seed);
  try {
    /* an answer in another shape is no standing: Save waits, as it does when the read fails */
    keep(seed, v.parse(Standing, await api(at(seed))));
  } catch {
    /* Save waits; the next palette opened asks again */
  } finally {
    asking.delete(seed);
  }
}

type Held = Record<string, unknown>;
const isHeld = (value: unknown): value is Held => !!value && typeof value === "object";

/** What the browser holds of the site's lists, with the palette `to` where `from` stood: its steps never under its
    keyframes, and gone where the list already holds `to`. A list is an array of palettes by their `kseed` or `seed`,
    wherever it stands in an answer. An account's collections are its own, which the server leaves as they are. What
    holds no `from` comes back as it was given. */
export function replaced<T>(data: T, from: string, to: string): T {
  const floor = Math.max(STEPS_MIN, decodePalette(to)?.anchors.length ?? 0);
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const key = (["kseed", "seed"] as const).find(k =>
        value.some(p => isHeld(p) && p[k] === from)
      );
      if (!key) {
        const next = value.map(walk);
        return next.some((item, i) => item !== value[i]) ? next : value;
      }
      return value.some(p => isHeld(p) && p[key] === to)
        ? value.filter(p => !isHeld(p) || p[key] !== from)
        : value.map(p =>
            isHeld(p) && p[key] === from
              ? {
                  ...p,
                  [key]: to,
                  ...(typeof p.steps === "number" ? { steps: Math.max(p.steps, floor) } : {})
                }
              : p
          );
    }
    if (!isHeld(value) || (isHeld(value.owner) && value.owner.kind === "user")) return value;
    let next: Held | undefined;
    for (const [name, held] of Object.entries(value)) {
      const now = walk(held);
      if (now === held) continue;
      next ??= { ...value };
      next[name] = now;
      /* a collection that already held the new palette holds one fewer */
      if (
        (name === "items" || name === "preview") &&
        typeof value.itemCount === "number" &&
        Array.isArray(held) &&
        Array.isArray(now)
      )
        next.itemCount = Math.max(0, value.itemCount - (held.length - now.length));
    }
    return next ?? value;
  };
  return walk(data) as T;
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
    if (st.liked || liked(o.opened())) return t("Liked by someone");
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
      const answer = v.safeParse(Saved, await api(at(from), { seed: to }, "PUT"));
      const seed = answer.success ? answer.output.palette.seed : to;
      if (before) keep(seed, { ...before, seed, liked: false });
      /* the lists keep their time: read again now, the edge's copy of a minute ago would bring the old palette back */
      for (const query of queries.getQueryCache().findAll()) {
        const held = query.state.data;
        const next = replaced(held, from, seed);
        if (next !== held)
          queries.setQueryData(query.queryKey, next, { updatedAt: query.state.dataUpdatedAt });
      }
      /* the likes moved with the palette on the server: its count and the account's copy follow */
      movePaletteLike(from, seed);
      o.saved(seed);
      markDone("saved");
    } catch (error) {
      toast(shownError(error, msg("Couldn't save.")));
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
