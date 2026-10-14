import { localHref, msg, t } from "@grabient/i18n";
import type { FitVote } from "@grabient/ui/Fit.tsx";
import { createEffect, createSignal } from "solid-js";
import { account, loginHref, sessionReady } from "../account/session.ts";
import { trackSignInPrompt } from "../analytics/analytics.ts";
import { castVote, readVotes } from "./client.ts";
import { COLLECTION_LIMIT } from "./params.ts";

/* Whether a palette fits the collection it stands in: the account's votes, read a page of collections at a time once
   the account is known, and its presses. A press shows at once and its write follows, one write per palette at a time,
   the last press winning; a failure puts the vote back and says why. Signed out, a press leads to sign in and back. */

export function createFit(options: {
  slugs: () => readonly string[];
  say: (message: string) => void;
}) {
  const [votes, setVotes] = createSignal<
    Readonly<Record<string, Readonly<Record<string, FitVote>>>>
  >({});
  let asked = new Set<string>();
  let reader: string | undefined;
  createEffect(
    () => [account()?.id, options.slugs()] as const,
    ([who, slugs]) => {
      if (who !== reader) {
        reader = who;
        asked = new Set();
        setVotes({});
      }
      if (!who) return;
      const fresh = slugs.filter(slug => !asked.has(slug));
      for (let i = 0; i < fresh.length; i += COLLECTION_LIMIT) {
        const part = fresh.slice(i, i + COLLECTION_LIMIT);
        for (const slug of part) asked.add(slug);
        readVotes(part).then(
          answer => {
            if (reader === who) setVotes(all => ({ ...all, ...answer.votes }));
          },
          () => {}
        );
      }
    }
  );
  const show = (slug: string, seed: string, vote: FitVote | null) =>
    setVotes(all => {
      const { [seed]: _, ...rest } = all[slug] ?? {};
      return { ...all, [slug]: vote ? { ...rest, [seed]: vote } : rest };
    });
  /* the last press of each palette waiting to be written, and whether a write of it is on its way */
  const waiting = new Map<string, FitVote | null>();
  const sending = new Set<string>();
  async function send(slug: string, seed: string, before: FitVote | null) {
    const key = `${slug} ${seed}`;
    sending.add(key);
    try {
      while (waiting.has(key)) {
        const vote = waiting.get(key) ?? null;
        waiting.delete(key);
        await castVote(slug, seed, vote);
        before = vote;
      }
    } catch (reason) {
      waiting.delete(key);
      show(slug, seed, before);
      options.say(
        reason instanceof Error && reason.message
          ? reason.message
          : t(msg("Couldn't save your vote."))
      );
    } finally {
      sending.delete(key);
    }
  }
  return {
    of: (slug: string, seed: string): FitVote | null => votes()[slug]?.[seed] ?? null,
    vote(slug: string, seed: string, next: FitVote | null) {
      if (!account()) {
        if (!sessionReady()) return;
        trackSignInPrompt("vote");
        return location.assign(localHref(loginHref()));
      }
      const key = `${slug} ${seed}`;
      const before = votes()[slug]?.[seed] ?? null;
      show(slug, seed, next);
      waiting.set(key, next);
      if (!sending.has(key)) void send(slug, seed, before);
    }
  };
}
