import { describe, expect, test } from "vitest";
import { listWords } from "../../lib/words.ts";
import { readField } from "../gallery/field.ts";
import {
  accountHandle,
  collectionHref,
  isCollectionSlug,
  isPrivateSlug,
  privateSlug,
  slugifyTitle,
  slugWords,
  sortCollectionItems,
  typedCollection
} from "./address.ts";
import slugs from "./fixtures/slugs.json" with { type: "json" };
import sortItems from "./fixtures/sort-items.json" with { type: "json" };
import validate from "./fixtures/validate.json" with { type: "json" };
import {
  type CollectionInput,
  collectionItem,
  normalizeNote,
  validateCollection
} from "./schema.ts";

/* grabient4's own answers (fixtures/*.json), which addresses and validation must keep. */

describe("a link in a search field", () => {
  test("to a collections search is its words, and to a collection the words of its address", () => {
    expect(readField("https://grabient.com/collections/rising?q=Warm")).toMatchObject({
      words: "warm"
    });
    expect(readField("grabient.com/ocean-depths")).toMatchObject({ words: "ocean depths" });
    expect(listWords("https://grabient.com/ja/@ada/warm-sunsets/rising")).toBe("warm sunsets");
    expect(readField("https://grabient.com/about")).toEqual({
      error: "Paste a link to one palette."
    });
  });
});

describe("addresses", () => {
  test.each(slugs.slugifyTitle)("%j as an address is %j", (title, slug) => {
    expect(slugifyTitle(title)).toBe(slug);
  });
  test.each(slugs.accountHandle.map(([who, handle]) => [who, handle] as const))(
    "%j lives under %j",
    (who, handle) => {
      expect(accountHandle(who as { id: string; username: string | null })).toBe(handle);
    }
  );
  test.each(slugs.privateSlug)("%j under %j beside %j is %j", (title, handle, taken, slug) => {
    expect(
      privateSlug(title as string, handle as string, s => (taken as string[]).includes(s))
    ).toBe(slug);
  });
  test.each(slugs.isPrivateSlug)(
    "%j is %j's private address under %j: %j",
    (slug, title, handle, is) => {
      expect(isPrivateSlug(slug as string, title as string, handle as string)).toBe(is);
    }
  );
  test.each(slugs.isCollectionSlug)("%j is a collection's address: %j", (slug, is) => {
    expect(isCollectionSlug(slug as string)).toBe(is);
  });

  test("a typed address leads to the slug it means, a handle keeping its underscores", () => {
    expect(typedCollection("/Ocean_Depths")).toEqual({ slug: "ocean-depths", order: "popular" });
    expect(typedCollection("/Ocean%20Gradients")).toEqual({
      slug: "ocean-gradients",
      order: "popular"
    });
    expect(typedCollection("/@first_user/Warm_Sunsets")).toEqual({
      slug: "@first_user/warm-sunsets",
      order: "popular"
    });
    expect(typedCollection("/ocean-depths/rising")).toEqual({
      slug: "ocean-depths",
      order: "rising"
    });
    expect(typedCollection("/rising")).toEqual({ slug: "rising", order: "popular" });
    expect(typedCollection("/@ada/rising")).toEqual({ slug: "@ada/rising", order: "popular" });
    expect(typedCollection("/@ada/rising/rising")).toEqual({
      slug: "@ada/rising",
      order: "rising"
    });
    expect(typedCollection("/ocean-depths/newest")).toBeNull();
    expect(typedCollection("/collections")).toBeNull();
    expect(collectionHref("@ada/rising", "rising")).toBe("/@ada/rising/rising");
    expect(slugWords("@ada/warm-sunsets")).toBe("warm sunsets");
  });

  test("a collection's palettes in its two orders", () => {
    const order = (o: "popular" | "rising") =>
      sortCollectionItems(sortItems.input, o).map(item => item.position);
    expect(order("popular")).toEqual(sortItems.popular);
    expect(order("rising")).toEqual(sortItems.rising);
  });
});

/* the bodies grabient4's answers were recorded for (fixtures/validate.json, in its order) */
const SEEDS = [
  "kY4mpDazO-mUuu_fuLqXU49dvVP6",
  "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
  "kamzkm1gtFdWRyrLHcJuB9B6KaQgOlEGg",
  "kWs2um4jE-G62O7xwb3bkk-4",
  "kSyQDAzZa8zgZxS",
  "kUzkiw66E-e4YQltnUXg",
  "kcgI_BPOBA0BgwZI1sK2LpDueoxrwLsS764_g",
  "kcERi8Fyy_zqWO_hlTGb7C9OA3va4rz2CA29A"
];
const items = SEEDS.map(seed => ({ seed, style: "linearGradient", steps: 7, angle: 90 }));
const BODIES: Record<string, Record<string, unknown>> = {
  "empty body": {},
  "no items": { title: "x", items: [] },
  "bad seed": { title: "x", items: [{ seed: "not-a-seed" }] },
  "too many": { title: "x", items: Array.from({ length: 101 }, () => items[0]) },
  "bad style": { title: "x", items: [{ ...items[0], style: "sparkle" }] },
  "bad visibility": { title: "x", visibility: "friends", items },
  "long title": { title: "x".repeat(81), items },
  "title 80": { title: "x".repeat(80), items },
  "title with controls": { title: "a\u0000b\tc\n d", items },
  "long description": { title: "x", description: "d".repeat(501), items },
  "bad tag": { title: "x", tags: ["a"], items },
  "too many tags": { title: "x", tags: Array.from({ length: 13 }, (_, i) => `tag${i}`), items },
  "tags normalized": {
    title: "x",
    tags: [
      "Sunset",
      " warm ",
      "sunset",
      "Golden hour",
      "neon/pink",
      "ΘΆΛΑΣΣΑ",
      "Café",
      "cafe\u0301"
    ],
    items
  },
  "tags cjk one char": { title: "x", tags: ["春", "봄", "ア", "\u{20bb7}"], items },
  "tag one latin": { title: "x", tags: ["a"], items },
  "tag emoji": { title: "x", tags: ["red \u2764\ufe0f"], items },
  "tag 32": { title: "x", tags: ["x".repeat(32)], items },
  "tag 33": { title: "x", tags: ["x".repeat(33)], items },
  "tag c++": { title: "x", tags: ["c++"], items },
  "dedupe items": { title: "x", items: [items[0], items[0], { ...items[0], angle: 45 }] },
  "default visibility": { title: "x", items },
  "public asked": { title: "x", visibility: "public", items }
};

/** What grabient4 recorded of an answer: the palettes counted, not listed. */
const shown = (result: ReturnType<typeof validateCollection>) =>
  result.ok ? { ok: true, input: { ...result.input, items: result.input.items.length } } : result;

describe("validation", () => {
  test.each(validate.cases as [string, unknown][])("%s", (label, expected) => {
    expect(shown(validateCollection(BODIES[label]!))).toEqual(expected);
  });

  test("a change keeps every field it leaves out", () => {
    const base: CollectionInput = {
      title: "Kept",
      description: "Old",
      tags: ["a b"],
      visibility: "private",
      items: items.slice(0, 2).map(item => collectionItem(item)!)
    };
    expect(shown(validateCollection({ description: "New" }, base))).toEqual(validate.partial);
  });

  test.each(validate.collectionItem as [unknown, unknown][])(
    "the item %j reads as %j",
    (input, item) => {
      expect(collectionItem(input)).toEqual(item);
    }
  );

  test.each(validate.normalizeNote as [unknown, string | null][])(
    "the note %j reads as %j",
    (input, note) => {
      expect(normalizeNote(input)).toBe(note);
    }
  );
});
