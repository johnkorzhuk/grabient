import { decodePalette } from "@grabient/engine";
import { t } from "@grabient/i18n";
import { Curation, type CurationResult } from "@grabient/ui/Curation.tsx";
import { type QueryClient, useQueryClient } from "@tanstack/solid-query";
import { createEffect, type Element, Show } from "solid-js";
import * as v from "valibot";
import { hexesOf } from "../../lib/palette.ts";
import { liked } from "../account/likes.ts";
import { isAdmin } from "../account/session.ts";
import { call } from "../collections/client.ts";
import { createDeletable } from "../collections/deletable.ts";
import { forgetPalette } from "../collections/overlay.ts";
import { ownOf } from "./drawing.ts";
import type { PaletteItem } from "./schema.ts";

/* An admin's curation of the gallery from a card: Set view draws a palette another way for everyone, and Delete
   takes it out of the gallery, and out of Grabient's collections unless the admin says the gallery alone. Both are
   offered on the palettes no person liked, which the page asks the server about; a liked palette shows them disabled
   and says why. The change shows at once on every list this tab holds. */

const palettePath = (seed: string) => `/api/me/palettes/${encodeURIComponent(seed)}`;
const why = (result: CurationResult) => ({ reasons: result.reasons, comment: result.comment });

/** Every list this tab holds, with one palette drawn another way, or without it. */
function patchLists(
  client: QueryClient,
  seed: string,
  view: Pick<PaletteItem, "style" | "steps" | "angle"> | null
) {
  const patch = <T extends { kseed: string }>(items: readonly T[]): T[] =>
    view
      ? items.map(item => (item.kseed === seed ? { ...item, ...view } : item))
      : items.filter(item => item.kseed !== seed);
  type Held = { items?: PaletteItem[]; palettes?: PaletteItem[] } | undefined;
  client.setQueriesData<Held>(
    { predicate: query => ["palettes", "home", "saved"].includes(String(query.queryKey[0])) },
    data =>
      data && {
        ...data,
        ...(data.items ? { items: patch(data.items) } : {}),
        ...(data.palettes ? { palettes: patch(data.palettes) } : {})
      }
  );
}

export function createCuration(o: {
  /** the palettes the page shows that an admin may curate, by seed */
  seeds: () => readonly string[];
  say: (message: string) => void;
}) {
  const client = useQueryClient();
  const deletable = createDeletable();
  createEffect(
    () => (isAdmin() ? o.seeds() : []),
    seeds => {
      if (seeds.length) deletable.learn(seeds);
    }
  );
  /* nothing a person liked is changed: the admin's own like, which this browser knows, or another's, which the server
     says */
  const free = (seed: string) => (liked(seed) ? false : deletable.of(seed));
  const kept = (seed: string) => (free(seed) ? undefined : t("Liked by someone"));
  const remove = async (seed: string, result: CurationResult) => {
    await call("DELETE", palettePath(seed), v.looseObject({}), {
      ...why(result),
      scope: result.scope ?? "everywhere"
    });
    forgetPalette(seed);
    patchLists(client, seed, null);
    o.say(t("Palette deleted."));
  };
  const redraw = async (seed: string, result: CurationResult) => {
    const view = result.view!;
    await call("PATCH", palettePath(seed), v.looseObject({}), { ...view, ...why(result) });
    patchLists(client, seed, view);
    o.say(t("View saved."));
  };
  return {
    /** The presses beside a card's Edit, once the page knows whether a person liked its palette. `view` adds Set
        view (the palette lists); `scopes` lets a deletion keep to the gallery alone (a gallery list's own palettes). */
    presses: (item: () => PaletteItem, kind: { view?: boolean; scopes?: boolean }): Element => (
      <Show when={isAdmin() && free(item().kseed) !== undefined}>
        <Show when={kind.view}>
          <Curation
            mode="view"
            icon="sliders"
            blocked={kept(item().kseed)}
            stops={hexesOf(ownOf(item()))}
            view={ownOf(item())}
            stopsAt={steps => hexesOf({ seed: item().kseed, steps })}
            minSteps={decodePalette(item().kseed)?.anchors.length}
            onConfirm={result => redraw(item().kseed, result)}
          />
        </Show>
        <Curation
          mode="delete"
          icon="trash"
          scopes={kind.scopes}
          blocked={kept(item().kseed)}
          stops={hexesOf(ownOf(item()))}
          view={ownOf(item())}
          onConfirm={result => remove(item().kseed, result)}
        />
      </Show>
    )
  };
}
