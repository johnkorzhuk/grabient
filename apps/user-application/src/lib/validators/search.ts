import * as v from "valibot";
import { DEFAULT_PAGE_LIMIT } from "@/lib/constants";

export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_LIMIT_MAX = 96;

// Regex for Latin alphabet characters
const LATIN_LETTER_REGEX = /[a-zA-Z]/;
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function isLatinWord(word: string): boolean {
    return LATIN_LETTER_REGEX.test(word);
}

function hasVowel(word: string): boolean {
    for (const char of word) {
        if (VOWELS.has(char)) return true;
    }
    return word.includes("y");
}

function hasRepeatedChars(word: string, maxRepeat: number = 3): boolean {
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

function isLikelyGibberishLatin(word: string): boolean {
    if (word.length < 3) return false;
    if (!hasVowel(word)) return true;
    if (hasRepeatedChars(word, 2)) return true;
    if (hasTooManyConsonants(word, 4)) return true;

    const letters = word.replace(/[^a-z]/g, "").length;
    const digits = word.replace(/[^0-9]/g, "").length;
    if (digits > 0 && digits >= letters) return true;

    return false;
}

function isLikelyGibberishNonLatin(word: string): boolean {
    if (hasRepeatedChars(word, 3)) return true;
    return false;
}

function normalizeQuery(query: string): string[] {
    return query
        .toLowerCase()
        .normalize("NFC")
        .split(/[\s\-_]+/)
        .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
        .filter((word) => word.length >= 1);
}

export function isValidSearchQuery(query: string): boolean {
    const trimmed = query.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.length > SEARCH_QUERY_MAX_LENGTH) return false;

    const words = normalizeQuery(trimmed);
    if (words.length === 0) return false;

    for (const word of words) {
        if (isLatinWord(word)) {
            if (isLikelyGibberishLatin(word)) return false;
        } else {
            if (isLikelyGibberishNonLatin(word)) return false;
        }
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
