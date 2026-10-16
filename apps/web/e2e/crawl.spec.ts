import { expect, test } from "@playwright/test";

/* What a crawler reads in the server's HTML: a link to a page production keeps out of the index says nofollow, so a
   crawler spends no visit on it, and every other link of the site's is followed. They read whatever the local database
   holds. */

/** Each link of a document whose address matches, as its tag and its words. */
function links(html: string, href: RegExp): { tag: string; href: string; rel?: string }[] {
  return [...html.matchAll(/<a\b[^>]*>/g)].flatMap(([tag]) => {
    const to = /\shref="([^"]*)"/.exec(tag)?.[1]?.replaceAll("&amp;", "&");
    return to && href.test(to) ? [{ tag, href: to, rel: /\srel="([^"]*)"/.exec(tag)?.[1] }] : [];
  });
}
const PALETTE = (language: string) => new RegExp(`^${language}/k[A-Za-z0-9_-]{8,49}(?:\\?|$)`);

test("a list's palettes and searches are followed in English and nofollow in another language, where their pages are out of the index", async ({
  request
}) => {
  const english = await (await request.get("/palettes")).text();
  const japanese = await (await request.get("/ja/palettes")).text();
  const cards = links(english, PALETTE(""));
  const chips = links(english, /^\/palettes\?q=/);
  expect(cards.length).toBeGreaterThan(0);
  expect(chips.length).toBeGreaterThan(0);
  for (const link of [...cards, ...chips])
    expect([link.href, link.rel]).toEqual([link.href, undefined]);
  const theirs = links(japanese, PALETTE("/ja"));
  const searched = links(japanese, /^\/ja\/palettes\?q=/);
  expect(theirs.length).toBe(cards.length);
  expect(searched.length).toBeGreaterThan(0);
  for (const link of [...theirs, ...searched])
    expect([link.href, link.rel]).toEqual([link.href, "nofollow"]);
});

test("a collection's tags and its Rising order are nofollow, its own page followed", async ({
  request
}) => {
  const listed = (await (await request.get("/api/collections?sort=popular&limit=24")).json()) as {
    items: { slug: string; tags: string[] }[];
  };
  const tagged = listed.items.find(c => c.tags.length > 0 && !c.slug.startsWith("@"));
  expect(tagged).toBeTruthy();
  const slug = tagged!.slug;
  const html = await (await request.get(`/${slug}`)).text();
  const chips = links(html, /^\/collections\?q=/);
  expect(chips.length).toBe(tagged!.tags.length);
  for (const chip of chips) expect([chip.href, chip.rel]).toEqual([chip.href, "nofollow"]);
  expect(links(html, new RegExp(`^/${slug}/rising$`)).map(link => link.rel)).toEqual(["nofollow"]);
  expect(links(html, new RegExp(`^/${slug}$`)).map(link => link.rel)).toContain(undefined);
});

test("the footer's privacy choices are nofollow, and Privacy and Terms are in another language too", async ({
  request
}) => {
  const english = await (await request.get("/about")).text();
  const japanese = await (await request.get("/ja/about")).text();
  expect(links(english, /^\/settings#privacy$/).map(link => link.rel)).toEqual(["nofollow"]);
  expect(links(english, /^\/(?:privacy|terms)$/).map(link => link.rel)).toEqual([
    undefined,
    undefined
  ]);
  expect(links(japanese, /^\/ja\/(?:privacy|terms)$/).map(link => link.rel)).toEqual([
    "nofollow",
    "nofollow"
  ]);
});
