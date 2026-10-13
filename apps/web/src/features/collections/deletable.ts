import { createSignal } from "solid-js";

/* Which palettes an admin may draw another way or delete: the ones no person liked, the seeding agents' personas being
   no people. A card's count cannot say whose likes they are, so an admin's page asks about the palettes it shows, in
   batches; until the answer comes a card offers neither, and the server refuses a liked palette all the same. */

const BATCH = 96;

export function createDeletable() {
  /* what the server said, by seed: true where no person liked the palette */
  const [answers, setAnswers] = createSignal<ReadonlyMap<string, boolean>>(new Map());
  /* the seeds asked about, answered or on their way: plain, so asking reads nothing a page tracks */
  const asked = new Set<string>();
  return {
    /** true when no person liked the palette, false when one did, undefined until the server says */
    of: (seed: string): boolean | undefined => answers().get(seed),
    /** Asks about the palettes not asked about yet. */
    learn(seeds: readonly string[]) {
      const fresh = [...new Set(seeds)].filter(seed => !asked.has(seed));
      for (let i = 0; i < fresh.length; i += BATCH) {
        const part = fresh.slice(i, i + BATCH);
        for (const seed of part) asked.add(seed);
        fetch(`/api/me/palettes?seeds=${encodeURIComponent(part.join(","))}`, {
          credentials: "same-origin"
        })
          .then(response =>
            response.ok ? (response.json() as Promise<{ liked?: string[] }>) : null
          )
          .then(answer => {
            if (!answer) throw new Error("unanswered");
            const liked = new Set(answer.liked ?? []);
            setAnswers(
              map => new Map([...map, ...part.map(seed => [seed, !liked.has(seed)] as const)])
            );
          })
          .catch(() => {
            // asked again with the next page that shows it
            for (const seed of part) asked.delete(seed);
          });
      }
    }
  };
}
