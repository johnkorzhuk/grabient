import { createSignal } from "solid-js";
import { isAdmin } from "../account/session.ts";

/* Which palettes an admin may draw another way or delete: the ones no person liked, the seeding agents' personas being
   no people. A card's count cannot say whose likes they are, so an admin's page asks about the palettes it shows, in
   batches; until the answer comes a card offers neither, and the server refuses a liked palette all the same. */

const BATCH = 96;

export function createDeletable() {
  const [liked, setLiked] = createSignal<ReadonlySet<string>>(new Set());
  const [known, setKnown] = createSignal<ReadonlySet<string>>(new Set());
  const asking = new Set<string>();
  return {
    /** true when no person liked the palette, false when one did, undefined until the server says */
    of: (seed: string): boolean | undefined => (known().has(seed) ? !liked().has(seed) : undefined),
    learn(seeds: readonly string[]) {
      if (!isAdmin()) return;
      const fresh = [...new Set(seeds)].filter(seed => !known().has(seed) && !asking.has(seed));
      for (let i = 0; i < fresh.length; i += BATCH) {
        const part = fresh.slice(i, i + BATCH);
        for (const seed of part) asking.add(seed);
        fetch(`/api/me/palettes?seeds=${encodeURIComponent(part.join(","))}`, {
          credentials: "same-origin"
        })
          .then(response =>
            response.ok ? (response.json() as Promise<{ liked?: string[] }>) : null
          )
          .then(answer => {
            if (!answer) return;
            setLiked(set => new Set([...set, ...(answer.liked ?? [])]));
            setKnown(set => new Set([...set, ...part]));
          })
          .catch(() => {})
          .finally(() => {
            for (const seed of part) asking.delete(seed);
          });
      }
    }
  };
}
