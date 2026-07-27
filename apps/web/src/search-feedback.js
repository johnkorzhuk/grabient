export const SEARCH_FEEDBACK_KEY = "search-feedback";

/**
 * @typedef {"good" | "bad"} SearchFeedback
 * @typedef {{ feedback: SearchFeedback, createdAt: number }} SearchFeedbackEntry
 * @typedef {{ version: 1, data: Record<string, Record<string, SearchFeedbackEntry>> }} SearchFeedbackStore
 */

/** @returns {SearchFeedbackStore} */
function emptyStore() {
  return { version: 1, data: {} };
}

/**
 * @param {Storage} storage
 * @returns {SearchFeedbackStore}
 */
function readStore(storage) {
  try {
    const raw = storage.getItem(SEARCH_FEEDBACK_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !parsed.data || typeof parsed.data !== "object") {
      storage.removeItem(SEARCH_FEEDBACK_KEY);
      return emptyStore();
    }
    return parsed;
  } catch {
    try {
      storage.removeItem(SEARCH_FEEDBACK_KEY);
    } catch {}
    return emptyStore();
  }
}

/**
 * @param {string} query
 * @param {string} seed
 * @param {Storage} [storage]
 * @returns {SearchFeedback | null}
 */
export function getSearchFeedback(query, seed, storage = localStorage) {
  const value = readStore(storage).data[query]?.[seed]?.feedback;
  return value === "good" || value === "bad" ? value : null;
}

/**
 * @param {string} query
 * @param {string} seed
 * @param {SearchFeedback} feedback
 * @param {Storage} [storage]
 * @param {number} [createdAt]
 * @returns {{ current: SearchFeedback | null, event: SearchFeedback | "clear" }}
 */
export function toggleSearchFeedback(
  query,
  seed,
  feedback,
  storage = localStorage,
  createdAt = Date.now(),
) {
  const store = readStore(storage);
  const existing = store.data[query]?.[seed]?.feedback;
  if (existing === feedback) {
    delete store.data[query][seed];
    if (!Object.keys(store.data[query]).length) delete store.data[query];
    storage.setItem(SEARCH_FEEDBACK_KEY, JSON.stringify(store));
    return { current: null, event: "clear" };
  }

  store.data[query] = {
    ...(store.data[query] || {}),
    [seed]: { feedback, createdAt },
  };
  storage.setItem(SEARCH_FEEDBACK_KEY, JSON.stringify(store));
  return { current: feedback, event: feedback };
}
