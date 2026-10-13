import { renderToString } from "@solidjs/web";
import type { Element } from "solid-js";
import { describe, expect, test } from "vitest";
import { CollectionCard, mosaicSpans } from "../src/CollectionCard.tsx";
import {
  CollectionGroup,
  CollectionGroupPlaceholder,
  columnsAt,
  shownAt
} from "../src/CollectionGroup.tsx";
import { type CollectChoice, CollectList } from "../src/CollectList.tsx";
import { CollectPress } from "../src/CollectPress.tsx";
import { Curation } from "../src/Curation.tsx";
import { Fit } from "../src/Fit.tsx";
import { SaveToCollection } from "../src/SaveToCollection.tsx";

/* The collections' parts as the server draws them. */

const html = (view: () => Element) => renderToString(view);
type Attrs = Record<string, string>;
function tags(markup: string, name: string): Attrs[] {
  return [...markup.matchAll(new RegExp(`<${name}(\\s[^>]*?)?/?>`, "g"))].map(m =>
    Object.fromEntries(
      [...(m[1] ?? "").matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map(a => [a[1], a[2] ?? ""])
    )
  );
}
const text = (markup: string) =>
  markup
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&#39;/g, "'");
const nothing = async () => {};

describe("Fit", () => {
  test("names each thumb for the collection, and the cast one is pressed", () => {
    const presses = tags(
      html(() => <Fit value="up" collection="Ocean gradients" onVote={() => {}} />),
      "button"
    );
    expect(presses.map(b => [b["aria-label"], b["aria-pressed"]])).toEqual([
      ["Good fit for Ocean gradients", "true"],
      ["Bad fit for Ocean gradients", "false"]
    ]);
  });
  test("an admin's down on one of Grabient's is a ruling that takes the palette out", () => {
    const markup = html(() => <Fit value="down" admin collection="Ocean gradients" disabled />);
    const [, down] = tags(markup, "button");
    expect(down).toMatchObject({
      "aria-label": "Remove from collection",
      "data-ruling": "",
      disabled: ""
    });
    expect(tags(markup, "fieldset")[0]).toMatchObject({ "aria-label": "Fit" });
  });
});

describe("CollectionGroup", () => {
  test("caps its cards at two rows of the grid's columns, three on a phone", () => {
    expect([1, 2, 3, 4, 5, 6].map(columns => shownAt(columns, 20))).toEqual([3, 4, 6, 8, 10, 12]);
    expect(shownAt(6, 5)).toBe(5);
    expect([700, 728, 1168, 1424, 1808, 2960].map(columnsAt)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  test("links its title, tells its words under the title, and keeps every card in the document", () => {
    const markup = html(() => (
      <CollectionGroup
        title="Ocean gradients"
        href="/ja/ocean-gradients"
        description="Blue"
        owner="Grabient"
        age="2 days"
        count={14}
        private
        palettes={["a", "b", "c", "d", "e"]}
        card={palette => <span data-card={palette()} />}
      />
    ));
    expect(tags(markup, "a")[0]).toMatchObject({ href: "/ja/ocean-gradients" });
    expect(tags(markup, "span").filter(s => "data-card" in s)).toHaveLength(5);
    expect(text(markup)).toContain("14 palettes");
    expect(text(markup)).toContain("Private");
    expect(tags(markup, "h2")[0]).toMatchObject({ dir: "auto" });
  });
  test("stands as its shape while it is on its way", () => {
    expect(
      tags(
        html(() => <CollectionGroupPlaceholder count={3} />),
        "section"
      )[0]
    ).toMatchObject({ "aria-hidden": "true" });
  });
});

describe("CollectionCard", () => {
  test("fills its picture whatever the count, in rows as even as they can be", () => {
    expect(mosaicSpans(1)).toEqual([12]);
    expect(mosaicSpans(5)).toEqual([6, 6, 4, 4, 4]);
    expect(mosaicSpans(12)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(mosaicSpans(20)).toHaveLength(12);
  });
  test("opens the collection from the picture and the title", () => {
    const markup = html(() => (
      <CollectionCard
        href="/ocean-gradients"
        title="Ocean gradients"
        palettes={[
          { stops: ["#000000", "#ffffff"] },
          { stops: ["#ff0000", "#0000ff"], style: "radialSwatches" }
        ]}
        count={1}
        owner="@ada"
        age="May 2025"
      />
    ));
    const links = tags(markup, "a");
    expect(links.map(a => a.href)).toEqual(["/ocean-gradients", "/ocean-gradients"]);
    expect(links[0]?.["aria-label"]).toBe("Open Ocean gradients");
    expect(text(markup)).toContain("1 palette");
  });
});

describe("the checklist", () => {
  const own: CollectChoice[] = [
    { slug: "a", title: "Holds all", count: 3, has: true },
    { slug: "b", title: "Holds some", count: 4, has: "some", colors: ["#ff0000"] },
    { slug: "c", title: "Holds none", count: 1, has: false }
  ];
  test("says what each collection holds of the palettes at hand", () => {
    const markup = html(() => <CollectList own={own} onToggle={nothing} onNew={nothing} />);
    const rows = tags(markup, "button").filter(b => "aria-pressed" in b);
    expect(rows.map(b => b["aria-pressed"])).toEqual(["true", "mixed", "false"]);
    expect(text(markup)).toContain("New collection");
    expect(markup).not.toContain('type="search"');
  });
  test("is searched by its titles when it holds many, and names a group over its first row", () => {
    const many = Array.from(
      { length: 9 },
      (_, i): CollectChoice => ({ slug: `c${i}`, title: `Collection ${i}`, count: i })
    );
    const markup = html(() => (
      <CollectList
        own={[...many, { slug: "g", title: "Grabient's", count: 9, group: "Grabient" }]}
        onToggle={nothing}
        onNew={nothing}
      />
    ));
    expect(tags(markup, "input")[0]).toMatchObject({
      type: "search",
      "aria-label": "Search collections"
    });
    expect(text(markup)).toContain("Grabient");
  });
  test("signed out, the export column's Save leads to sign in", () => {
    const markup = html(() => (
      <SaveToCollection signIn="/login?redirect=%2F" onToggle={nothing} onNew={nothing} />
    ));
    expect(tags(markup, "a")[0]).toMatchObject({ href: "/login?redirect=%2F" });
    expect(text(markup)).toContain("Sign in to save collections.");
  });
  test("a card's press is one press until it opens, and a link signed out", () => {
    const collect = { own: own, onOpen: () => {}, onToggle: nothing, onNew: nothing };
    const closed = tags(
      html(() => <CollectPress collect={collect} />),
      "button"
    )[0];
    expect(closed).toMatchObject({
      "aria-label": "Add to collection",
      "aria-expanded": "false",
      "data-variant": "art"
    });
    const out = tags(
      html(() => <CollectPress collect={{ ...collect, signIn: "/login" }} size="lg" />),
      "a"
    )[0];
    expect(out).toMatchObject({ href: "/login", "data-size": "lg" });
  });
});

describe("Curation", () => {
  test("keeps a press it does not offer in place, saying why", () => {
    const markup = html(() => (
      <Curation
        mode="delete"
        icon="trash"
        blocked="Liked by someone"
        stops={["#000000"]}
        view={{ style: "linearGradient", steps: 7, angle: 90 }}
        onConfirm={nothing}
      />
    ));
    const press = tags(markup, "button")[0];
    expect(press).toMatchObject({ "aria-label": "Delete palette", disabled: "" });
    expect(text(markup)).toContain("Liked by someone");
  });
});
