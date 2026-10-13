/* Whether a palette fits the search a page shows: every palette a search answers with carries thumbs named for the
   words ("Good fit for red"), or for the palette a search is by. The account's votes for the words are read once the
   account is known and again when the words or the account change. A press shows at once and its write follows, one
   write per palette at a time with the last press winning; signed out, a press leads to sign in and back. */
import { t } from "@grabient/i18n";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createEffect } from "solid-js";
import type { FitVote } from "./bodies.ts";
import { searchVotesQuery } from "./queries.ts";

export interface SearchFit {
  value: FitVote | null;
  /** what the votes are for, as the thumbs name it */
  query: string;
  onVote: (next: FitVote | null) => void;
  disabled: boolean;
}

export function createSearchFit(options: {
  /** the words the page shows, "" for none */
  query: () => string;
  /** the account signed in: null signed out, undefined while not yet known */
  account: () => string | null | undefined;
  /** a press while signed out: sign in, and back to this search */
  signIn: () => void;
  /** a vote could not be saved */
  fail: (message: string) => void;
  /** the browser is offline: the thumbs wait for the server */
  offline?: () => boolean;
  /** what the thumbs say a search is for: its words, or a palette's name */
  named?: (query: string) => string;
}) {
  const client = useQueryClient();
  const votes = useQuery(() => ({
    ...searchVotesQuery(options.account() ?? "", options.query()),
    enabled: !!options.account() && !!options.query()
  }));

  /* one write per palette at a time: a press while one is out waits, and only the last press is sent after it */
  const wanted = new Map<string, FitVote | null>();
  const busy = new Set<string>();
  const send = async (account: string, q: string, seed: string) => {
    const key = `${q}\n${seed}`;
    if (busy.has(key)) return;
    busy.add(key);
    try {
      while (wanted.has(key)) {
        const vote = wanted.get(key) ?? null;
        wanted.delete(key);
        const response = await fetch("/api/me/search-votes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q, seed, vote })
        });
        if (!response.ok) throw new Error(`The vote answered ${response.status}`);
      }
    } catch {
      wanted.delete(key);
      options.fail(t("Couldn't save your vote."));
      void client.invalidateQueries({ queryKey: searchVotesQuery(account, q).queryKey });
    } finally {
      busy.delete(key);
    }
  };

  const cast = (account: string, q: string, seed: string, next: FitVote | null) => {
    client.setQueryData(searchVotesQuery(account, q).queryKey, (own = {}) => {
      const { [seed]: _, ...rest } = own;
      return next ? { ...rest, [seed]: next } : rest;
    });
    wanted.set(`${q}\n${seed}`, next);
    void send(account, q, seed);
  };

  /* a press before the account is known waits for it, as a heart does */
  let waiting: { q: string; seed: string; next: FitVote | null } | null = null;
  createEffect(
    () => options.account(),
    account => {
      const press = waiting;
      if (account === undefined || !press) return;
      waiting = null;
      if (account === null) options.signIn();
      else if (press.q === options.query()) cast(account, press.q, press.seed, press.next);
    }
  );
  const vote = (seed: string, next: FitVote | null) => {
    const q = options.query();
    const account = options.account();
    if (!q) return;
    if (account === undefined) waiting = { q, seed, next };
    else if (account === null) options.signIn();
    else cast(account, q, seed, next);
  };

  return {
    /** A card's thumbs, or undefined while the page has no words. */
    fitOf(seed: string): SearchFit | undefined {
      const q = options.query();
      if (!q) return undefined;
      return {
        value: votes.data?.[seed] ?? null,
        query: options.named?.(q) ?? q,
        onVote: next => vote(seed, next),
        disabled: options.offline?.() ?? false
      };
    }
  };
}
