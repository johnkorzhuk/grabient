import { msg, t } from "@grabient/i18n";
import { useQueryClient } from "@tanstack/solid-query";
import { createEffect, createSignal } from "solid-js";
import { account } from "../account/session.ts";
import { accountSearchQuery } from "../search/queries.ts";
import type { SearchItem } from "./schema.ts";

/** The account's own search of words the public one could not read for everyone (its tier `account`), or read in
    part: asked once the account is known, within the account's own allowance. Its palettes stand where the public
    ones stood; while it reads, or when its allowance is spent, it says so for the page's line. */
export function createAccountSearch(o: { words: () => string; wanted: () => boolean }) {
  const client = useQueryClient();
  const [held, setHeld] = createSignal<{
    of: string;
    items?: readonly SearchItem[];
    note: string;
  }>({ of: "", note: "" });
  const asked = () => {
    const who = account()?.id;
    return o.wanted() && who ? `${who}\n${o.words()}` : "";
  };
  let reading = "";
  createEffect(asked, of => {
    if (!of || of === reading) return;
    reading = of;
    const [who, words] = of.split("\n") as [string, string];
    const land = (items: readonly SearchItem[] | undefined, note: string) =>
      setHeld(now => (reading === of ? { of, items, note } : now));
    land(undefined, t("Searching…"));
    client.fetchQuery(accountSearchQuery(who, words)).then(
      answer =>
        answer.limited
          ? land(undefined, t(answer.message ?? msg("Too many searches. Try again in a moment.")))
          : land(answer.items, ""),
      () => land(undefined, "")
    );
  });
  const now = () => {
    const read = held();
    return read.of && read.of === asked() ? read : null;
  };
  return {
    /** the account's answer, once it has one */
    items: () => now()?.items ?? null,
    /** what the line says of it meanwhile */
    note: () => now()?.note ?? ""
  };
}
