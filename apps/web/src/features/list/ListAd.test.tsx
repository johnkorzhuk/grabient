import { renderToString } from "@solidjs/web";
import { describe, expect, test } from "vitest";
import { adHref, irisToward, ListAd } from "./ListAd.tsx";

/** The words of the markup, as a reader reads them. */
const text = (markup: string) =>
  markup
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("the ad in a palette list's first cell", () => {
  test("leads to Pixeleye in a new tab, naming Grabient as the visit's source and its place as the content", () => {
    const html = renderToString(() => <ListAd place="palette-list" />);
    const link = html.match(/<a [^>]*>/)![0];
    expect(link).toContain(`href="${adHref("palette-list").replaceAll("&", "&amp;")}"`);
    expect(link).toContain('target="_blank"');
    // the referrer the site sends stays, where other links to other sites drop it, so Pixeleye sees grabient.com
    expect(link).toContain('rel="sponsored noopener"');
    const address = new URL(adHref("similar-palettes"));
    expect(address.origin + address.pathname).toBe("https://pixeleye.app/");
    expect(Object.fromEntries(address.searchParams)).toEqual({
      utm_source: "grabient",
      utm_medium: "display",
      utm_campaign: "grabient-ad",
      utm_content: "similar-palettes"
    });
  });

  test("says what the drawing says, in its language, then where it leads and that it is an ad", () => {
    const html = renderToString(() => <ListAd place="palette-list" />);
    expect(html).toMatch(/<span[^>]*lang="en"[^>]*>\s*Pixeleye: How good is your eye, really\?/);
    expect(text(html)).toMatch(/Play today’s 5 puzzles\. pixeleye\.app Ad \(opens in a new tab\)$/);
    // the pictures are the drawing those words say: nothing more for a screen reader (a bare alt is an empty one)
    const pictures = [...html.matchAll(/<img [^>]*>/g)].map(img => img[0]);
    expect(pictures).toHaveLength(2);
    for (const picture of pictures) expect(picture).toMatch(/ alt(="")?[ >]/);
  });

  test("lays the drawing's pictures in at once in a list, and leaves the editor's to load as they come near", () => {
    const list = renderToString(() => <ListAd place="palette-list" />);
    const similar = renderToString(() => <ListAd place="similar-palettes" />);
    expect(list).not.toContain('loading="lazy"');
    expect(similar.match(/loading="lazy"/g)).toHaveLength(2);
  });
});

describe("the ad's eye", () => {
  test("looks straight ahead at a point on its middle", () => {
    expect(irisToward(0, 0, 100)).toEqual([0, 0]);
  });

  test("turns all the way toward a point past its reach, four pixels across and one up or down at most", () => {
    expect(irisToward(500, 0, 100)).toEqual([4, 0]);
    expect(irisToward(-500, 0, 100)).toEqual([-4, 0]);
    expect(irisToward(0, 500, 100)).toEqual([0, 1]);
    expect(irisToward(0, -500, 100)).toEqual([0, -1]);
    expect(irisToward(400, 400, 100)).toEqual([3, 1]);
  });

  test("looks down at a point a little under it, as far as its lids let it", () => {
    expect(irisToward(0, 20, 100)).toEqual([0, 1]);
    expect(irisToward(0, 10, 100)).toEqual([0, 0]);
    expect(irisToward(30, -60, 100)).toEqual([1, -1]);
  });

  test("turns part of the way toward a point within its reach, a whole pixel at a time", () => {
    expect(irisToward(50, 0, 100)).toEqual([2, 0]);
    expect(irisToward(10, 0, 100)).toEqual([0, 0]);
    expect(irisToward(-30, 10, 100)).toEqual([-1, 0]);
  });
});
