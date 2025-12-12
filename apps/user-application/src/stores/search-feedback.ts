import { Store } from "@tanstack/react-store";

const STORAGE_KEY = "search-feedback";
const STORAGE_VERSION = 1;

export type FeedbackType = "good" | "bad";

interface FeedbackEntry {
    feedback: FeedbackType;
    createdAt: number;
}

// Map structure: query -> seed -> feedback entry
type FeedbackMap = Map<string, Map<string, FeedbackEntry>>;

interface SearchFeedbackStore {
    feedback: FeedbackMap;
}

function loadFromStorage(): FeedbackMap {
    if (typeof window === "undefined") {
        return new Map();
    }

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            return new Map();
        }

        const parsed = JSON.parse(stored);
        if (parsed.version !== STORAGE_VERSION) {
            localStorage.removeItem(STORAGE_KEY);
            return new Map();
        }

        // Convert stored object back to nested Maps
        const feedbackMap = new Map<string, Map<string, FeedbackEntry>>();
        for (const [query, seeds] of Object.entries(parsed.data)) {
            const seedMap = new Map<string, FeedbackEntry>();
            for (const [seed, entry] of Object.entries(seeds as Record<string, FeedbackEntry>)) {
                seedMap.set(seed, entry as FeedbackEntry);
            }
            feedbackMap.set(query, seedMap);
        }
        return feedbackMap;
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return new Map();
    }
}

function saveToStorage(feedback: FeedbackMap): void {
    if (typeof window === "undefined") return;

    try {
        // Convert Maps to plain objects for JSON serialization
        const data: Record<string, Record<string, FeedbackEntry>> = {};
        for (const [query, seeds] of feedback) {
            data[query] = {};
            for (const [seed, entry] of seeds) {
                data[query][seed] = entry;
            }
        }

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ version: STORAGE_VERSION, data })
        );
    } catch (error) {
        console.warn("Failed to save search feedback to localStorage:", error);
    }
}

export const searchFeedbackStore = new Store<SearchFeedbackStore>({
    feedback: loadFromStorage(),
});

export function getFeedback(query: string, seed: string): FeedbackType | null {
    const state = searchFeedbackStore.state;
    return state.feedback.get(query)?.get(seed)?.feedback ?? null;
}

export function setFeedback(
    query: string,
    seed: string,
    feedback: FeedbackType
): void {
    searchFeedbackStore.setState((prev) => {
        const newFeedback = new Map(prev.feedback);

        if (!newFeedback.has(query)) {
            newFeedback.set(query, new Map());
        }

        const seedMap = new Map(newFeedback.get(query)!);
        const existing = seedMap.get(seed);

        // If clicking the same feedback again, clear it (toggle off)
        if (existing?.feedback === feedback) {
            seedMap.delete(seed);
            if (seedMap.size === 0) {
                newFeedback.delete(query);
            } else {
                newFeedback.set(query, seedMap);
            }
        } else {
            seedMap.set(seed, { feedback, createdAt: Date.now() });
            newFeedback.set(query, seedMap);
        }

        saveToStorage(newFeedback);
        return { feedback: newFeedback };
    });
}

export function clearFeedback(query: string, seed: string): void {
    searchFeedbackStore.setState((prev) => {
        const newFeedback = new Map(prev.feedback);
        const seedMap = newFeedback.get(query);

        if (seedMap) {
            const newSeedMap = new Map(seedMap);
            newSeedMap.delete(seed);

            if (newSeedMap.size === 0) {
                newFeedback.delete(query);
            } else {
                newFeedback.set(query, newSeedMap);
            }
        }

        saveToStorage(newFeedback);
        return { feedback: newFeedback };
    });
}

export function getBadSeedsForQuery(query: string): Set<string> {
    const state = searchFeedbackStore.state;
    const seedMap = state.feedback.get(query);
    if (!seedMap) return new Set();

    const badSeeds = new Set<string>();
    for (const [seed, entry] of seedMap) {
        if (entry.feedback === "bad") {
            badSeeds.add(seed);
        }
    }
    return badSeeds;
}

export function getGoodSeedsForQuery(query: string): Set<string> {
    const state = searchFeedbackStore.state;
    const seedMap = state.feedback.get(query);
    if (!seedMap) return new Set();

    const goodSeeds = new Set<string>();
    for (const [seed, entry] of seedMap) {
        if (entry.feedback === "good") {
            goodSeeds.add(seed);
        }
    }
    return goodSeeds;
}
