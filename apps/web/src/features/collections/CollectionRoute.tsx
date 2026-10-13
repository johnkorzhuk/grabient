import { Show, untrack } from "solid-js";
import type { PaletteOrder } from "./address.ts";
import { CollectionPage } from "./CollectionPage.tsx";
import { listView } from "./params.ts";
import { answerWith, type Loaded } from "./route.ts";

/** A collection's page at any of its addresses (/{slug}, /@{handle}/{slug}, either with /rising): a new page for each
    collection, so nothing of one stands on the next, in the order and view the address says. */
export function CollectionRoute(props: {
  slug: string;
  order: PaletteOrder;
  search: string;
  loaded: Loaded | undefined;
}) {
  answerWith(untrack(() => props.loaded?.status));
  return (
    <Show when={props.slug} keyed>
      {slug => (
        <CollectionPage
          slug={slug}
          order={props.order}
          view={listView(new URLSearchParams(props.search))}
        />
      )}
    </Show>
  );
}
