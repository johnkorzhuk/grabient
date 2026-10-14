/* Whether a palette fits the search a page shows: every palette a search answers with carries thumbs named for the
   words ("Good fit for red"), or for the palette a search is by. The account's votes for the words are read once the
   account is known and again when the words or the account change, into the page's own state: a page never waits on
   them. A press shows at once and its write follows, one write per palette at a time with the last press winning;
   signed out, a press leads to sign in and back. */
import { t } from "@grabient/i18n";
import { useQueryClient } from "@tanstack/solid-query";
import { createEffect, createSignal } from "solid-js";
import type { FitVote } from "./bodies.ts";
import { searchVotesQuery } from "./queries.ts";

export interface SearchFit {
  value: FitVote | null;
  /** what the votes are for, as the thumbs name it */
  query: string;
  onVote: (next: FitVote | null) => void;
  disabled: boolean;
}

type Votes = Readonly<Record<string, FitVote>>;

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
  /* the votes on the page, with the account and the words they are for: an answer for others draws nothing */
  const keyOf = (account: string, q: string) => `${account}\n${q}`;
  const [held, setHeld] = createSignal<{ of: string; votes: Votes }>({ of: "", votes: {} });
  const read = (account: string, q: string, fresh = false) =>
    client.fetchQuery({ ...searchVotesQuery(account, q), ...(fresh ? { staleTime: 0 } : {}) }).then(
      votes => setHeld({ of: keyOf(account, q), votes }),
      () => {}
    );
  createEffect(
    () => [options.account(), options.query()] as const,
    ([account, q]) => {
      if (account && q) void read(account, q);
    }
  );

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
      void read(account, q, true);
    } finally {
      busy.delete(key);
    }
  };

  const cast = (account: string, q: string, seed: string, next: FitVote | null) => {
    const voted = (own: Votes = {}): Votes => {
      const { [seed]: _, ...rest } = own;
      return next ? { ...rest, [seed]: next } : rest;
    };
    /* shown at once, and kept where a return to the search reads it */
    setHeld(now => (now.of === keyOf(account, q) ? { of: now.of, votes: voted(now.votes) } : now));
    client.setQueryData(searchVotesQuery(account, q).queryKey, voted);
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
      const own = held();
      return {
        value: (own.of === keyOf(options.account() ?? "", q) && own.votes[seed]) || null,
        query: options.named?.(q) ?? q,
        onVote: next => vote(seed, next),
        disabled: options.offline?.() ?? false
      };
    }
  };
}
