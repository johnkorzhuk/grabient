import * as v from "valibot";
import { DEFAULT_PAGE_LIMIT } from "@/lib/constants";

export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_LIMIT_MAX = 96;

// Common vowel patterns in English words
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function hasVowel(word: string): boolean {
    for (const char of word) {
        if (VOWELS.has(char)) return true;
    }
    // Allow 'y' as vowel in words without other vowels (e.g., "sky", "gym")
    return word.includes("y");
}

function hasRepeatedChars(word: string, maxRepeat: number = 2): boolean {
    let count = 1;
    for (let i = 1; i < word.length; i++) {
        if (word[i] === word[i - 1]) {
            count++;
            if (count > maxRepeat) return true;
        } else {
            count = 1;
        }
    }
    return false;
}

function hasTooManyConsonants(word: string, maxConsecutive: number = 4): boolean {
    let consecutive = 0;
    for (const char of word) {
        if (!VOWELS.has(char) && char !== "y") {
            consecutive++;
            if (consecutive > maxConsecutive) return true;
        } else {
            consecutive = 0;
        }
    }
    return false;
}

function isLikelyGibberish(word: string): boolean {
    // Too short to validate meaningfully
    if (word.length < 3) return false;

    // Must contain at least one vowel
    if (!hasVowel(word)) return true;

    // No more than 2 repeated consecutive chars (e.g., "aaa" is gibberish)
    if (hasRepeatedChars(word, 2)) return true;

    // No more than 4 consecutive consonants
    if (hasTooManyConsonants(word, 4)) return true;

    // Reject if more than 50% numbers
    const letters = word.replace(/[^a-z]/g, "").length;
    const digits = word.replace(/[^0-9]/g, "").length;
    if (digits > 0 && digits >= letters) return true;

    return false;
}

function normalizeQuery(query: string): string[] {
    return query
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .split(/[\s-]+/)
        .filter((word) => word.length >= 2);
}

export function isValidSearchQuery(query: string): boolean {
    const words = normalizeQuery(query);

    if (words.length === 0) return false;

    // All words must pass the gibberish check
    for (const word of words) {
        if (isLikelyGibberish(word)) return false;
    }

    return true;
}

export const searchQueryValidator = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(SEARCH_QUERY_MAX_LENGTH),
);

export const searchLimitValidator = v.pipe(
    v.number(),
    v.minValue(1),
    v.maxValue(SEARCH_LIMIT_MAX),
);

export const searchInputSchema = v.object({
    query: searchQueryValidator,
    limit: v.optional(searchLimitValidator, DEFAULT_PAGE_LIMIT),
});

export type SearchInput = v.InferOutput<typeof searchInputSchema>;
