import { decodePalette } from "@grabient/engine";
import { expect, test } from "vitest";
import { PRODUCTION_ORIGIN, pageMeta } from "../../lib/page-meta.ts";
import { NO_LOCKS, type SeedPage } from "./address.ts";
import { metaPage } from "./StaticPalette.tsx";

/* What the palette route hands the page's metadata: the facts' saved view, with or without words written for it, is
   the page's address, which its canonical and its structured data name as the sitemap and IndexNow do. */

const SEED = "kS7Q8Yy5S_SChv0";
const page: SeedPage = {
  seed: SEED,
  palette: decodePalette(SEED)!,
  view: { style: "radialGradient", steps: 7, angle: 30 },
  locks: NO_LOCKS,
  selection: false
};
const address = (facts: Parameters<typeof metaPage>[1]) => {
  const meta = pageMeta(metaPage(page, facts), PRODUCTION_ORIGIN);
  const work = meta.structuredData.find(data => data["@type"] === "CreativeWork");
  return [meta.canonical, work?.url];
};

test("a palette's page names the view it was saved in as its address, with no words written for it", () => {
  const own = `https://grabient.com/${SEED}?style=linearSwatches&steps=9&angle=45`;
  expect(address({ saved: { style: "linearSwatches", steps: 9, angle: 45 }, heldBy: [] })).toEqual([
    own,
    own
  ]);
  // one nothing saved stands at its default view
  expect(address({ heldBy: [] })).toEqual([
    `https://grabient.com/${SEED}`,
    `https://grabient.com/${SEED}`
  ]);
  expect(address(null)).toEqual([`https://grabient.com/${SEED}`, `https://grabient.com/${SEED}`]);
});
