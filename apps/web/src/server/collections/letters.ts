/* Stands in for the collections letters (wip/collections server/collections/letters.ts): what the writes copied here
   call of it. */

/** Words as a search compares them: compatibility forms, lowercase. */
export const folded = (words: string): string => words.normalize("NFKC").toLowerCase();
