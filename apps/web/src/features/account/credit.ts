import { queryOptions } from "@tanstack/solid-query";
import * as v from "valibot";
import { getJson } from "../../lib/query.ts";
import { api } from "./session.ts";

/* The account's username on the palettes it liked first (server/account/credit.ts): Settings' switch, and Profile's
   offer of it when a username is set. Off until the account turns it on. A refusal carries the server's own message,
   translated. */

const Shown = v.object({ on: v.boolean() });

/** Whether the signed-in account's username shows on the palettes it liked first, read once per account under
    `creditKey`. */
export const creditQuery = () =>
  queryOptions({
    queryKey: ["account", "credit"],
    queryFn: async () => (await getJson("/api/me/credit", Shown)).on,
    staleTime: Number.POSITIVE_INFINITY
  });
/** The key an account's answer is kept under: Profile's switch and its offer share it. */
export const creditKey = (accountId: string) => [...creditQuery().queryKey, accountId];

/** Turns the account's name on palettes on, once the server finds its username fit to show, or off; what the server
    holds after. */
export const writeCredit = async (on: boolean) =>
  v.parse(Shown, await api("/api/me/credit", { on }, "PUT")).on;
