import {
  button,
  collections,
  type Issue,
  LEDE,
  mono,
  pick,
  rising,
  type Shelf,
  section,
  shelf,
  snippet,
  strong,
  text,
  view,
  ways
} from "@grabient/email";
import { decodePalette } from "@grabient/engine";

/* No. 1, October 2026: collections, and that a palette's CSS is at its own address. */
const PICKS = [
  pick("kYuXkT47BBu6sxXjqsk1ilF8Onws", "radialGradient", 32, 0, "Coral lagoon"),
  pick("kW8RUxaqO8dmsPXbqE2x6zBg", "linearSwatches", 5, 135, "Peach orchard"),
  pick("kWzVMw17K7kq5vM-LD1shs7Y", "linearGradient", 32, 180, "Desert dusk"),
  pick("kW6hdK6pbElaRxXeH9QcJFBI", "radialSwatches", 5, 0, "Pistachio macaron"),
  pick("kW0ibSWiTBMytwpBMkKMyhAQ", "angularGradient", 32, 315, "Orchid velvet")
];
/* Each collection's card draws palettes it holds, each a wedge of its own about the middle and one ring more than the
   last. The site draws a palette in no fewer steps than its keyframes, so the rings start at the most keyframes among
   them. Each card's palettes are ones an admin liked, listed in the views liked; the rings are the card's. */
const SUMAC_PALETTES = [
  view("kauzREWKQ61A0vZGOj6uzO-jEZvKyD7Lg", "linearGradient", 32, 180),
  view("kWcT9tsiE8asZuokH7tHCI-g", "linearSwatches", 13, 90),
  view("kWk4kUS6RCsiTSa5lMiqhTF4", "radialGradient", 32, 225),
  view("kWyEVBTRTDTgLx4wC1DvK_Fo", "linearSwatches", 6, 90),
  view("kcPUwUMqjCMWoRBPscNzq5B0OXx-0uceq9ZAI", "linearGradient", 8, 90)
];
const PORCH_PALETTES = [
  view("kUSRnguCHF0suRLoI8Tg", "linearSwatches", 12, 105),
  view("kUloMico7EKYZuxWr0Wg", "linearSwatches", 4, 180),
  view("kUVBppRTMytgvw1vFcIg", "radialSwatches", 12, 0),
  view("kUVBioyTBTeAtRJ1DECA", "radialGradient", 80, 0),
  view("kYsmE1QSBAqaNwskD7iPK0_dQ3QW", "linearSwatches", 6, 315),
  view("kUSROny5cy8u0NhmKsTg", "linearGradient", 80, 30)
];
const MYSTIC_PALETTES = [
  view("kU1SJfShzPEGXOSiD1Cg", "radialSwatches", 4, 0),
  view("kSpTAuShystmO0K", "linearGradient", 56, 135),
  view("kU1CNgy52zrYhvYmD1Cg", "radialSwatches", 4, 0),
  view("kUPyfTORm_lQUrdkFzoA", "linearGradient", 32, 90),
  view("kUzxQpxyAuTQpRIhjcZA", "linearSwatches", 4, 346),
  view("kUNgp6tQ5AEYQuvBHbMg", "radialSwatches", 4, 0)
];
const LIKED = [...SUMAC_PALETTES, ...PORCH_PALETTES, ...MYSTIC_PALETTES];
const stepping = (liked: readonly { seed: string }[]) => {
  const from = Math.max(3, ...liked.map(({ seed }) => decodePalette(seed)?.anchors.length ?? 0));
  return liked.slice(0, 9).map(({ seed }, i) => view(seed, "linearSwatches", from + i, 90));
};
const SUMAC: Shelf = {
  title: "Red sumac roadside",
  slug: "red-sumac-roadside",
  note: "13 palettes",
  about: "Sumac red, rust and tobacco brown against roadside green, teal and storm blue.",
  card: stepping(SUMAC_PALETTES)
};
const PORCH: Shelf = {
  title: "Fall porch colors",
  slug: "fall-porch-colors",
  note: "11 palettes",
  about: "Painted doors, pumpkins, squash, chrysanthemums, woven straw and weathered wood.",
  card: stepping(PORCH_PALETTES)
};
const MYSTIC: Shelf = {
  title: "Mystic outlands",
  slug: "mystic-outlands",
  note: "25 palettes",
  about: "Mist blue, lichen green, stone gray, twilight violet and rust from otherworldly ruins.",
  card: stepping(MYSTIC_PALETTES)
};
const SHELVES = [SUMAC, PORCH, MYSTIC];
const CSS = ".hero {\n  background: linear-gradient(90deg, #4158d0, #c850c0, #ffcc70);\n}";

export const october: Issue = {
  number: 1,
  month: "2026-10",
  published: "2026-10-08",
  write: origin => ({
    subject: "Rising in October, and collections",
    issue: "No. 1 · October 2026",
    title: "Rising in October",
    lede: LEDE,
    ahead: "In this issue: collections, and a quick tip.",
    liked: [...PICKS, ...LIKED],
    picks: PICKS,
    more: rising(origin),
    body: [
      section(
        "Introducing collections",
        text([
          "Group the palettes that belong together. Select a few in any list and press ",
          strong("Save"),
          "."
        ]),
        text("Find a collection by a color or a mood, and save it to your account."),
        button({ href: `${origin}/collections`, label: "Browse collections" })
      ),
      section("Featured collections", collections(SHELVES.map(shelf(origin)))),
      section(
        "Quick tip",
        text(["Add ", mono(".css"), " to any palette link to get its CSS."]),
        snippet(CSS),
        button({ href: `${origin}/about`, label: "How palettes work", quiet: true })
      )
    ],
    links: ways(origin, { label: "About", href: `${origin}/about` })
  })
};
