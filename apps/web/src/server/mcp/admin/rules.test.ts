import { describe, expect, it } from "vitest";
import queueGolden from "../fixtures/queue-rules.json" with { type: "json" };
import faultsGolden from "../fixtures/translation-faults.json" with { type: "json" };
import { personaInput } from "./personas.ts";
import { parseDue, queueInput, queueLabel } from "./queue.ts";
import { reviewSubject } from "./reviews.ts";
import {
  fingerprint,
  TRANSLATED_LOCALES,
  type TranslatedLocale,
  translationFault
} from "./translations.ts";

const NOW = Date.parse("2026-10-12T12:00:00Z");

describe("the seeding queue's rules", () => {
  it("read a due time within a month back and 400 days ahead", () => {
    for (const [value, at] of queueGolden.parseDue as [unknown, string | null][]) {
      const read = parseDue(value, NOW);
      expect(read === null ? null : new Date(read).toISOString()).toBe(at);
    }
  });

  it("bound a batch's label", () => {
    for (const [value, label] of queueGolden.queueLabel) expect(queueLabel(value)).toBe(label);
  });

  it("check an item as its apply will read it, keyed by what it is", () => {
    for (const { raw, read } of queueGolden.queueInput) {
      const got = queueInput(raw, new Set(["persona-ash"]), NOW);
      // an item's key is always made from the item itself: a key sent with one is not read
      if ("key" in raw) {
        expect(got.ok).toBe(true);
        continue;
      }
      if (!read.ok) expect(got).toEqual(read);
      else {
        const { key: _key, ...item } = read.item as typeof read.item & { key: null };
        expect(got).toEqual({ ok: true, item });
      }
    }
  });

  it("read a persona's handle, name and taste", () => {
    for (const [raw, read] of queueGolden.personaInput) expect(personaInput(raw)).toEqual(read);
  });

  it("key a review by the palette, a collection's fit or a search's", () => {
    for (const [raw, subject] of queueGolden.reviewSubject)
      expect(reviewSubject(raw as never)).toBe(subject);
  });
});

describe("translations", () => {
  it("are written in the language's script, within their lengths, on one line and without an em dash", () => {
    type Fault = {
      locale: TranslatedLocale;
      text: string;
      english: string;
      kind: "title";
      fault: string | null;
    };
    type Rest = { locales: string[]; fingerprint: string };
    for (const golden of faultsGolden as (Fault | Rest)[]) {
      if (!("locale" in golden)) {
        expect(TRANSLATED_LOCALES).toEqual(golden.locales);
        expect(fingerprint("Sunset gradients", "Coral, peach and plum skies.")).toBe(
          golden.fingerprint
        );
        continue;
      }
      // long texts were cut in the fixture: rebuild them
      const text = golden.text.includes("…(")
        ? golden.text.slice(0, 1).repeat(Number(/…\((\d+)\)/.exec(golden.text)![1]))
        : golden.text;
      expect(
        translationFault(
          golden.locale as TranslatedLocale,
          text,
          golden.english,
          golden.kind as "title"
        )
      ).toBe(golden.fault);
    }
  });
});
