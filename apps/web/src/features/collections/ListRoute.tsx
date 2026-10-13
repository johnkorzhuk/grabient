import { untrack } from "solid-js";
import { CollectionsPage } from "./CollectionsPage.tsx";
import type { ListPlace } from "./params.ts";
import { answerWith, type Loaded } from "./route.ts";

/** A collections list's page, answering with the status its loader found. A module of its own, so a list's page loads
    none of a collection's page and a collection's page none of a list's. */
export function ListRoute(props: { place: ListPlace; loaded: Loaded | undefined }) {
  answerWith(untrack(() => props.loaded?.status));
  return <CollectionsPage place={props.place} />;
}
