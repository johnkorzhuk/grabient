import { beforeEach, describe, expect, it } from "vitest";
import {
  getSearchFeedback,
  SEARCH_FEEDBACK_KEY,
  toggleSearchFeedback,
} from "../src/search-feedback";

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

beforeEach(() => values.clear());

describe("query palette feedback", () => {
  it("preserves the pre-rewrite v1 storage shape and toggles a repeated vote off", () => {
    expect(toggleSearchFeedback("warm sunset", "seed-a", "good", storage, 123)).toEqual({
      current: "good",
      event: "good",
    });
    expect(JSON.parse(values.get(SEARCH_FEEDBACK_KEY))).toEqual({
      version: 1,
      data: {
        "warm sunset": {
          "seed-a": { feedback: "good", createdAt: 123 },
        },
      },
    });
    expect(getSearchFeedback("warm sunset", "seed-a", storage)).toBe("good");

    expect(toggleSearchFeedback("warm sunset", "seed-a", "good", storage, 456)).toEqual({
      current: null,
      event: "clear",
    });
    expect(JSON.parse(values.get(SEARCH_FEEDBACK_KEY))).toEqual({
      version: 1,
      data: {},
    });
  });

  it("replaces the opposite vote without disturbing other queries", () => {
    toggleSearchFeedback("warm sunset", "seed-a", "good", storage, 1);
    toggleSearchFeedback("ocean", "seed-b", "bad", storage, 2);
    expect(toggleSearchFeedback("warm sunset", "seed-a", "bad", storage, 3)).toEqual({
      current: "bad",
      event: "bad",
    });
    expect(getSearchFeedback("ocean", "seed-b", storage)).toBe("bad");
  });
});
