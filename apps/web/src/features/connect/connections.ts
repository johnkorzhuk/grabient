import { queryOptions } from "@tanstack/solid-query";
import type { Connection } from "../../server/oauth/connections.ts";
import { api } from "./account.ts";

/* The account's connected apps, read in the browser once the account is known: the page they sit on is public HTML,
   which never carries an account. */

/** The apps an account allowed: read when the account is known, and again on a look back at the tab after a while,
    since an app may be allowed in another tab. */
export const connectionsQuery = (account: string) =>
  queryOptions({
    queryKey: ["connections", account] as const,
    queryFn: () => api<{ connections: Connection[] }>("/api/settings/connections"),
    staleTime: 2_000,
    refetchOnWindowFocus: true,
    reconcile: "clientId"
  });

/** Ends every grant of an app for the signed-in account, with its tokens, on every machine. */
export const disconnectApp = (clientId: string) =>
  api<{ disconnected: boolean }>("/api/settings/connections/disconnect", { clientId });
