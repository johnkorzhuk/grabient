import { renderToString } from "@solidjs/web";
import { describe, expect, test } from "vitest";
import { adHref, glide, irisPixel, irisToward, ListAd } from "./ListAd.tsx";

/** The words of the markup, as a reader reads them. */
const text = (markup: string) =>
  markup
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("the ad in a palette list's first cell", () => {
  test("leads to Pixeleye in a new tab, naming Grabient as the visit's source and its place as the content", () => {
    const html = renderToString(() => <ListAd place="palettes" />);
    const link = html.match(/<a [^>]*>/)![0];
    expect(link).toContain(`href="${adHref("palettes").replaceAll("&", "&amp;")}"`);
    expect(link).toContain('target="_blank"');
    // the referrer the site sends stays, where other links to other sites drop it, so Pixeleye sees grabient.com
    expect(link).toContain('rel="sponsored noopener"');
    const address = new URL(adHref("collection-search"));
    expect(address.origin + address.pathname).toBe("https://pixeleye.app/");
    expect(Object.fromEntries(address.searchParams)).toEqual({
      utm_source: "grabient",
      utm_content: "collection-search"
    });
  });

  test("says what the drawing says, in its language, then where it leads and that it is an ad", () => {
    const html = renderToString(() => <ListAd place="palettes" />);
    expect(html).toMatch(/<span[^>]*lang="en"[^>]*>\s*Pixeleye: How good is your eye, really\?/);
    expect(text(html)).toMatch(/Play today’s 5 puzzles\. pixeleye\.app Ad \(opens in a new tab\)$/);
    // the pictures are the drawing those words say: nothing more for a screen reader (a bare alt is an empty one)
    const pictures = [...html.matchAll(/<img [^>]*>/g)].map(img => img[0]);
    expect(pictures).toHaveLength(4);
    for (const picture of pictures) expect(picture).toMatch(/ alt(="")?[ >]/);
  });

  test("lays the drawing's pictures in at once in a list, and leaves the editor's to load as they come near", () => {
    const list = renderToString(() => <ListAd place="palettes" />);
    const similar = renderToString(() => <ListAd place="editor" />);
    expect(list).not.toContain('loading="lazy"');
    expect(similar.match(/loading="lazy"/g)).toHaveLength(4);
  });
});

describe("the ad's eye", () => {
  const near = (got: readonly number[], want: readonly number[]) => {
    for (const [i, value] of want.entries()) expect(got[i]).toBeCloseTo(value, 6);
  };

  test("looks straight ahead at a point on its middle", () => {
    expect(irisToward(0, 0, 100)).toEqual([0, 0]);
  });

  test("looks all the way toward a point past its reach, four pixels across and one up or down at most", () => {
    near(irisToward(500, 0, 100), [4, 0]);
    near(irisToward(-500, 0, 100), [-4, 0]);
    near(irisToward(0, 500, 100), [0, 1]);
    near(irisToward(0, -500, 100), [0, -1]);
    near(irisToward(400, 400, 100), [2 * Math.SQRT2, 1]);
  });

  test("looks part of the way toward a point within its reach, alike either way until the lids stop it", () => {
    near(irisToward(50, 0, 100), [2, 0]);
    near(irisToward(10, 0, 100), [0.4, 0]);
    near(irisToward(0, 20, 100), [0, 0.8]);
    near(irisToward(-30, 40, 100), [-1.2, 1]);
  });

  test("shows the pixel it shows until the iris is a fifth of a pixel past halfway to another", () => {
    expect(irisPixel(0, 0.69)).toBe(0);
    expect(irisPixel(0, 0.71)).toBe(1);
    expect(irisPixel(1, 0.31)).toBe(1);
    expect(irisPixel(1, 0.29)).toBe(0);
    expect(irisPixel(-1, -0.4)).toBe(-1);
    expect(Object.is(irisPixel(-1, -0.2), 0)).toBe(true);
    // a long way at once goes straight to the nearest
    expect(irisPixel(0, 2.6)).toBe(3);
  });

  test("glides to where it looks without passing it, alike at any frame rate", () => {
    let at = 0;
    let speed = 0;
    let most = 0;
    for (let frame = 0; frame < 60; frame++) {
      [at, speed] = glide(at, speed, 4, 1 / 60);
      most = Math.max(most, at);
    }
    expect(most).toBeLessThanOrEqual(4);
    expect(at).toBeCloseTo(4, 2);
    // most of the way in a fifth of a second
    let fifth = 0;
    let fifthSpeed = 0;
    for (let frame = 0; frame < 12; frame++)
      [fifth, fifthSpeed] = glide(fifth, fifthSpeed, 4, 1 / 60);
    expect(fifth).toBeGreaterThan(3.2);
    // two frames of a 120 Hz display land where one of a 60 Hz display does
    const [half, halfSpeed] = glide(0, 0, 4, 1 / 120);
    expect(glide(half, halfSpeed, 4, 1 / 120)[0]).toBeCloseTo(glide(0, 0, 4, 1 / 60)[0], 1);
  });
});
