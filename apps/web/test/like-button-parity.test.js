import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The like button exists twice: likeButton() in src/buttons.ts renders the
// server HTML (and the export view reuses it), while LikeButton in
// src/islands/grid.tsx is the Solid mirror the grid island swaps in.
//
// They must stay identical. The liked state is painted by a generated
// stylesheet keyed on [data-like-seed], and the counts are positioned by the
// shared class strings — so if the two drift, hearts silently stop lighting up
// or shift position the moment the island replaces the SSR grid.
//
// A render-based comparison is not possible here: grid.tsx is Solid JSX and
// vitest.config.ts deliberately has no solid plugin (the suite tests the
// worker and the plain-JS client). So this pins the shared contract at the
// source level instead, which is the thing that actually drifts.
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const buttons = read("../src/buttons.ts");
const grid = read("../src/islands/grid.tsx");

// The button's class list, as written in each file.
const BUTTON_CLASS = /class=["{`]?"?(likes group\/like [^"`]*)"/;
// The like-count span's static class prefix, before the conditional opacity.
const COUNT_CLASS = /(like-count select-none[^"`$]*)/;

function buttonClass(source, label) {
  const match = source.match(BUTTON_CLASS);
  if (!match) throw new Error(`no like button class found in ${label}`);
  return match[1].trim();
}

function countClass(source, label) {
  const match = source.match(COUNT_CLASS);
  if (!match) throw new Error(`no like-count class found in ${label}`);
  return match[1].trim();
}

// Every data-* attribute the click handler and the generated stylesheet read.
function likeDataAttributes(source) {
  return [...source.matchAll(/data-(like-[a-z]+|count)\b/g)]
    .map((m) => m[0])
    .filter((name, i, all) => all.indexOf(name) === i)
    .sort();
}

describe("like button parity between buttons.ts and the grid island", () => {
  it("renders the same button class list", () => {
    expect(buttonClass(grid, "grid.tsx")).toBe(
      buttonClass(buttons, "buttons.ts"),
    );
  });

  it("renders the same like-count class list", () => {
    expect(countClass(grid, "grid.tsx")).toBe(countClass(buttons, "buttons.ts"));
  });

  it("exposes the same data attributes the client keys on", () => {
    const shared = ["data-count", "data-like-angle", "data-like-row",
      "data-like-seed", "data-like-steps", "data-like-style"];

    expect(likeDataAttributes(buttons)).toEqual(
      expect.arrayContaining(shared),
    );
    expect(likeDataAttributes(grid)).toEqual(expect.arrayContaining(shared));
  });

  it("hides the count with the same conditional when there are no likes", () => {
    // Both must fall back to displaying 1 rather than 0, and both must apply
    // opacity-0 in exactly the same place.
    for (const [label, source] of [
      ["buttons.ts", buttons],
      ["grid.tsx", grid],
    ]) {
      expect(source, label).toContain('" opacity-0"');
      expect(source, label).toMatch(/likesCount > 0 \? likesCount : 1|likesCount > 0 \? props\.p\.likesCount : 1/);
    }
  });
});
