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
/* Each collection's card draws palettes it holds as wedges about the middle, taken in turn, each wedge one ring more than
   the last. The site draws a palette in no fewer steps than its keyframes, so the rings start at the most keyframes among
   them. The palettes are ones an admin liked (LIKED, in the views liked); the rings are the card's. */
// Autumn gradients
const TURNING_LEAVES = "kaVjppNx-_bsYvg3mbgt7E8zy8P5EPUAg";
const AMBER = "kUjmYmVjXBum6wbzqcCg";
const BONFIRE = "kYMjsBNLXDtTEQPpuUQ-z9Dvsxv2";
const EMBERS = "kULh0XMKvAUw9wXoKELA";
// Fall porch colors
const MUMS = "kUSRnguCHF0suRLoI8Tg";
const PORCH_LIGHT = "kUVBioyTBTeAtRJ1DECA";
const SQUASH = "kUVBppRTMytgvw1vFcIg";
const PAINTED_DOOR = "kUSROny5cy8u0NhmKsTg";
// Witchy color palette
const POTION = "kY7TwjUh5KT2eROsnkPnZ5DQ-eQu";
const AMETHYST = "kWvlBPWBS9M6TNXFKjxvLg-4";
const LIKED = [
  view(TURNING_LEAVES, "angularSwatches", 13, 0),
  view(AMBER, "linearGradient", 4, 270),
  view(BONFIRE, "linearGradient", 7, 90),
  view(EMBERS, "angularGradient", 14, 99),
  view(MUMS, "linearSwatches", 12, 105),
  view(PORCH_LIGHT, "radialGradient", 80, 0),
  view(SQUASH, "radialSwatches", 12, 0),
  view(PAINTED_DOOR, "linearGradient", 80, 30),
  view(POTION, "linearGradient", 32, 180),
  view(AMETHYST, "linearSwatches", 13, 90)
];
const stepping = (...seeds: string[]) => {
  const from = Math.max(3, ...seeds.map(seed => decodePalette(seed)?.anchors.length ?? 0));
  return Array.from({ length: 9 }, (_, i) =>
    view(seeds[i % seeds.length]!, "linearSwatches", from + i, 90)
  );
};
const AUTUMN: Shelf = {
  title: "Autumn gradients",
  slug: "autumn-gradients",
  note: "27 palettes",
  about: "Burgundy and forest green turning through rust, burnt orange, ochre and gold.",
  card: stepping(TURNING_LEAVES, AMBER, BONFIRE, EMBERS)
};
const PORCH: Shelf = {
  title: "Fall porch colors",
  slug: "fall-porch-colors",
  note: "11 palettes",
  about: "Painted doors, pumpkins, squash, chrysanthemums, woven straw and weathered wood.",
  card: stepping(MUMS, PORCH_LIGHT, SQUASH, PAINTED_DOOR)
};
const WITCHY: Shelf = {
  title: "Witchy color palette",
  slug: "witchy-color-palette",
  note: "22 palettes",
  about: "Amethyst, moss green, potion teal and candle gold for a moody apothecary this Halloween.",
  card: stepping(POTION, AMETHYST)
};
const SHELVES = [AUTUMN, PORCH, WITCHY];
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
