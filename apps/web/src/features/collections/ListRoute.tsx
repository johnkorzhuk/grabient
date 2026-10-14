import { untrack } from "solid-js";
import { answerWith } from "../../lib/route.ts";
import { CollectionsPage } from "./CollectionsPage.tsx";
import type { ListPlace } from "./params.ts";

/** A collections list's page, answering with the status its loader found. A module of its own, so a list's page loads
    none of a collection's page and a collection's page none of a list's. */
export function ListRoute(props: {
  place: ListPlace;
  loaded: { status?: number; signedOut?: boolean } | undefined;
}) {
  answerWith(untrack(() => props.loaded?.status));
  return <CollectionsPage place={props.place} signedOut={props.loaded?.signedOut} />;
}
