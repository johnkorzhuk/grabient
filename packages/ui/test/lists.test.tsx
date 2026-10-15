import { readFileSync } from "node:fs";
import { renderToString } from "@solidjs/web";
import type { Element } from "solid-js";
import { describe, expect, test } from "vitest";
import { CollectionGroup, shownAt } from "../src/CollectionGroup.tsx";
import { GroupFeed } from "../src/GroupFeed.tsx";
import { Like } from "../src/Like.tsx";
import { ListNav } from "../src/ListNav.tsx";
import { PaletteCard, type PaletteCardProps } from "../src/PaletteCard.tsx";
import { PaletteFeed } from "../src/PaletteFeed.tsx";
import { columnsAt } from "../src/PaletteGrid.tsx";
import { PaletteGridPlaceholder } from "../src/PalettePlaceholder.tsx";
import { Thumbnail } from "../src/Thumbnail.tsx";

/* The components lists draw, as the server renders them: what a reader, a crawler and an agent are sent. */

const html = (view: () => Element) => renderToString(view);
type Attrs = Record<string, string>;
function tags(markup: string, name: string): Attrs[] {
  return [...markup.matchAll(new RegExp(`<${name}(\\s[^>]*?)?/?>`, "g"))].map(m =>
    Object.fromEntries(
      [...(m[1] ?? "").matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map(a => [a[1], a[2] ?? ""])
    )
  );
}
const tag = (markup: string, name: string, i = 0): Attrs => tags(markup, name)[i] ?? {};
/** The words of the markup, as a reader reads them. */
const text = (markup: string) => markup.replace(/<!--.*?-->/g, "").replace(/<[^>]*>/g, "");
const noop = () => {};
const helpers = JSON.parse(
  readFileSync(
    new URL("../../../apps/web/src/features/gallery/fixtures/helpers.json", import.meta.url),
    "utf8"
  )
) as { columnsAt: [number, number][]; shownAt: [number, number, number][] };

const card = (change: Partial<PaletteCardProps> = {}): PaletteCardProps => ({
  seed: "kS7Q8Yy5S_SChv0",
  name: "Navy, blue and lavender",
  stops: ["#112244", "#335599", "#aabbee"],
  style: "linearGradient",
  angle: 90,
  href: "/kS7Q8Yy5S_SChv0?steps=3",
  age: "3 days",
  likes: 12,
  ...change
});

describe("the list's grid", () => {
  test("draws grabient4's columns at each width, and a group its cards", () => {
    expect(helpers.columnsAt.map(([width]) => [width, columnsAt(width)])).toEqual(
      helpers.columnsAt
    );
    expect(helpers.shownAt.map(([c]) => [c, shownAt(c, 12), shownAt(c, 2)])).toEqual(
      helpers.shownAt
    );
  });

  test("placeholders stand in for as many cards as are coming", () => {
    const markup = html(() => <PaletteGridPlaceholder count={5} />);
    expect(tags(markup, "div").filter(d => d["aria-hidden"] === "true")).toHaveLength(5);
  });
});

describe("PaletteCard", () => {
  test("is an article named for its palette, its picture an image named for its style", () => {
    const markup = html(() => <PaletteCard {...card()} />);
    expect(tag(markup, "article")["aria-label"]).toBe("Navy, blue and lavender palette");
    expect(tag(markup, "div", 1)).toMatchObject({
      role: "img",
      "aria-label": "Navy, blue and lavender gradient"
    });
    const swatches = html(() => <PaletteCard {...card({ style: "radialSwatches" })} />);
    expect(swatches).toContain('aria-label="Navy, blue and lavender swatches"');
  });

  test("leads to its editor, and keeps its hover tools out of the server's markup", () => {
    const markup = html(() => <PaletteCard {...card({ tools: () => <i data-strip="" /> })} />);
    expect(tag(markup, "a")).toMatchObject({
      href: "/kS7Q8Yy5S_SChv0?steps=3",
      "aria-label": "Edit"
    });
    expect(markup).not.toContain("data-strip");
    expect(markup).not.toContain("blur");
  });

  test("its plus adds it to the selection, and a check takes it out, each named for what it does", () => {
    const off = html(() => <PaletteCard {...card()} onSelect={noop} />);
    expect(tags(off, "button")[0]).toMatchObject({ "aria-label": "Add to selection" });
    const on = html(() => (
      <PaletteCard {...card({ selected: true, collect: <i data-collect="" /> })} />
    ));
    expect(tags(on, "button")[0]).toMatchObject({ "aria-label": "Remove from selection" });
    // the name says it, so no pressed state stands beside it
    for (const markup of [off, on])
      expect(tags(markup, "button")[0]).not.toHaveProperty("aria-pressed");
    expect(on).toContain("data-collect");
  });

  test("a removed palette says so, and its line takes no press", () => {
    const markup = html(() => (
      <PaletteCard {...card({ removed: true, lead: <i data-undo="" /> })} />
    ));
    expect(tag(markup, "article")["aria-label"]).toBe("Navy, blue and lavender palette, removed");
    expect(markup).toContain("data-undo");
    expect(markup).not.toContain('aria-label="Edit"');
    expect(tags(markup, "div").some(d => d.inert === "")).toBe(true);
  });
});

describe("Like", () => {
  test("names its count, and a liked heart counts the reader's own", () => {
    expect(
      tag(
        html(() => <Like count={3} />),
        "button"
      )
    ).toMatchObject({
      "aria-pressed": "false",
      "aria-label": "Like, 3"
    });
    expect(
      tag(
        html(() => <Like count={0} liked />),
        "button"
      )
    ).toMatchObject({
      "aria-pressed": "true",
      "aria-label": "Like, 1"
    });
    expect(
      tag(
        html(() => <Like count={0} disabled />),
        "button"
      ).disabled
    ).toBe("");
  });
});

describe("ListNav", () => {
  test("on the home: the sections alone, neither chosen, the orders' room kept", () => {
    const markup = html(() => (
      <ListNav section={null} order={null} onSection={noop} sectionHref={s => `/${s}`} />
    ));
    expect(tag(markup, "nav")["aria-label"]).toBe("Lists");
    expect(tags(markup, "a").map(a => [a.href, a["aria-current"]])).toEqual([
      ["/palettes", undefined],
      ["/collections", undefined]
    ]);
    expect(tags(markup, "div").some(d => d["data-reserved"] === "")).toBe(true);
  });

  test("on a list: its order current, Rising with its frame, Saved a press with no address", () => {
    const markup = html(() => (
      <ListNav
        section="palettes"
        order="rising"
        frame="3m"
        frames={["1w", "3m"]}
        onSection={noop}
        sectionHref={s => `/${s}`}
        orderHref={o => (o === "saved" ? undefined : `/palettes/${o}`)}
        disabled={choice => choice === "popular"}
      />
    ));
    const order = tags(markup, "nav")[1]!;
    expect(order["aria-label"]).toBe("Order");
    const links = tags(markup, "a");
    /* the name starts with the words on screen, then says the frame in full */
    const rising = links.find(a => a["aria-current"] === "page" && a["aria-label"]);
    expect(rising?.["aria-label"]).toBe("Rising 3m, Rising, 3 months");
    expect(text(markup)).toContain("Rising 3m");
    expect(links.find(a => a["aria-disabled"] === "true")?.href).toBeUndefined();
    expect(markup).toContain("3m");
    expect(tags(markup, "button")).toHaveLength(1);
  });
});

describe("Thumbnail", () => {
  test("leads to its palette, named for it", () => {
    const markup = html(() => <Thumbnail stops={["#000", "#fff"]} name="Ink" href="/kAbc" />);
    expect(tag(markup, "a").href).toBe("/kAbc");
    expect(markup).toContain("Ink palette");
  });
});

describe("the feeds on the server", () => {
  test("a palette feed draws every card it was given, with no padding", () => {
    const items = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const markup = html(() => (
      <PaletteFeed items={items} key={i => i} card={i => <i data-card={i()} />} />
    ));
    expect(tags(markup, "i")).toHaveLength(30);
    expect(tag(markup, "div")).toMatchObject({ "data-count": "30" });
    expect(tag(markup, "div").style).toBe("padding-top:0px;padding-bottom:0px");
  });

  test("a group feed draws its first groups and stands the rest in as their height", () => {
    const items = Array.from({ length: 10 }, (_, i) => `g${i}`);
    const markup = html(() => (
      <GroupFeed
        items={items}
        key={i => i}
        group={i => <i data-g={i()} />}
        estimate={() => 500}
        initial={2}
      />
    ));
    expect(tags(markup, "i").map(i => i["data-g"])).toEqual(["g0", "g1"]);
    expect(tag(markup, "div").style).toBe(`--before:0px;--after:${8 * (500 + 64)}px`);
  });

  test("a group shows its title as the way to it, its count and its cards", () => {
    const markup = html(() => (
      <CollectionGroup
        title="Ocean blues"
        href="/ocean-blues"
        count={1}
        private
        palettes={["a", "b"]}
        card={p => <i data-p={p()} />}
      />
    ));
    expect(tag(markup, "section")["aria-label"]).toBe("Ocean blues");
    expect(tag(markup, "a").href).toBe("/ocean-blues");
    expect(text(markup)).toContain("1 palette");
    expect(markup).toContain("Private");
    expect(tags(markup, "i")).toHaveLength(2);
  });
});
