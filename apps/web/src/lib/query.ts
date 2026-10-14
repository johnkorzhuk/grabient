import { msg, t } from "@grabient/i18n";
import { QueryClient } from "@tanstack/solid-query";
import * as v from "valibot";
import { shownError } from "../features/account/session.ts";

/* One QueryClient per request on the server and one per tab in the browser (router.tsx). The server's cache rides to
   the browser inside the document, so the first render reads what the server read and fetches nothing. */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // a failed read shows its error and Retry at once
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // what the server read is fresh when the page starts; each query says how long it stays so
        staleTime: 60_000,
        // a page left behind is kept half an hour, so Back shows it as it was
        gcTime: 30 * 60_000
      }
    }
  });

/** A read a page waits on ends as a failure after this long: a browser's fetch has no end of its own. */
export const READ_TIMEOUT = 15_000;

/* A list's or a page's read that fails resolves to `{ failed }`, the reason in the reader's language, so the page keeps
   what it showed beside the reason and its Retry. Freshness counts from the database read (`fetchedAt`), never from the
   moment an answer reached the browser. */

/** A read that failed: why, in the reader's language, and on the server the status the page answers with. */
export type Failed = { failed: string; status?: number };
/** Whether a read failed. */
export const failed = (data: unknown): data is Failed =>
  typeof data === "object" && data !== null && "failed" in data;

/** Fresh for `ttl` from the database read that made the answer. A failure is never fresh, nor an answer an allowance
    cut short, nor a list's summary shown while the whole is read. */
export const freshFor =
  (ttl: number) =>
  (query: { state: { data?: unknown; dataUpdatedAt: number } }): number => {
    const data = query.state.data as
      | { fetchedAt?: number; limited?: boolean; provisional?: boolean }
      | undefined;
    if (!data || failed(data) || data.limited || data.provisional) return 0;
    const at = query.state.dataUpdatedAt;
    return Math.max(0, ttl - (at - Math.min(data.fetchedAt ?? at, at)));
  };

/** A read in the browser, its failure as a value: the server's own words, or `fallback` for a read that never reached
    it. A read its last reader let go of is no failure. */
export async function attempt<T>(
  read: () => Promise<T>,
  signal: AbortSignal | undefined,
  fallback: string
): Promise<T | Failed> {
  try {
    return await read();
  } catch (error) {
    if (signal?.aborted) throw error;
    return { failed: shownError(error, fallback) };
  }
}

/** The browser's side of a public read: a GET of the API route that answers it, checked against the schema the server
    answers with. A failure carries the server's own message, translated. */
export async function getJson<S extends v.GenericSchema>(
  path: string,
  schema: S,
  signal?: AbortSignal
): Promise<v.InferOutput<S>> {
  const timeout = AbortSignal.timeout(READ_TIMEOUT);
  const response = await fetch(path, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: unknown } | null)?.error;
    throw new Error(t(typeof error === "string" ? error : msg("Something went wrong. Try again.")));
  }
  return v.parse(schema, body);
}
