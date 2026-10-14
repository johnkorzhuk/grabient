import { Show, untrack } from "solid-js";
import { answerWith } from "../../lib/route.ts";
import type { PaletteOrder } from "./address.ts";
import { CollectionPage } from "./CollectionPage.tsx";
import { viewOf } from "./params.ts";
import type { CollectionLoaded } from "./route.ts";

/** A collection's page at any of its addresses (/{slug}, /@{handle}/{slug}, either with /rising): a new page for each
    collection, so nothing of one stands on the next, in the order and view the address says. */
export function CollectionRoute(props: {
  slug: string;
  order: PaletteOrder;
  search: string;
  loaded: CollectionLoaded | undefined;
}) {
  answerWith(untrack(() => props.loaded?.status));
  return (
    <Show when={props.slug} keyed>
      {slug => (
        <CollectionPage
          slug={slug}
          order={props.order}
          view={viewOf(new URLSearchParams(props.search))}
          signedOut={props.loaded?.signedOut}
        />
      )}
    </Show>
  );
}
