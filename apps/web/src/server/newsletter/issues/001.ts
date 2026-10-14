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

/* No. 1, October 2026: collections, and that a palette's CSS is at its own address. */
const PICKS = [
  pick("kYuXkT47BBu6sxXjqsk1ilF8Onws", "radialGradient", 32, 0, "Coral lagoon"),
  pick("kW8RUxaqO8dmsPXbqE2x6zBg", "linearSwatches", 5, 135, "Peach orchard"),
  pick("kWzVMw17K7kq5vM-LD1shs7Y", "linearGradient", 32, 180, "Desert dusk"),
  pick("kW6hdK6pbElaRxXeH9QcJFBI", "radialSwatches", 5, 0, "Pistachio macaron"),
  pick("kW0ibSWiTBMytwpBMkKMyhAQ", "angularGradient", 32, 315, "Orchid velvet")
];
/* Each collection's card draws palettes it holds as wedges about the middle, taken in turn, their rings stepping up from
   three to eleven around the card. The palettes are ones an admin liked (LIKED, in the views liked); the rings are the
   card's. */
const SUNSET = "kW1lA1Wy67USpu2xnjjopO8Y";
const FOG = "kW-wQ8cwY_uiJ1DTlMBuJfAA";
const LAKE = "kW6QZ-Y4jAM-NwI6jcBqYxAw";
const BLUE_HOUR = "kW-Qmd8xC-2IhQNKp8IsCfCY";
const TWILIGHT = "kW7Q_UZpg_9Mpv2_rz9rKS_4";
const TIDE_LINES = "kWfT2g0CA-GOZvBvmTn7p-8g";
const SHELL = "kYoCnCYRDJe2Wxv1j8P5pFLUYbQq";
const SAND = "kY9QtP7I05eIWwhdGUG3pHDuaRxu";
const EELGRASS = "kWXDFzyB9BFeVQzTkslv6JEo";
const TIDAL_BLUE = "kWYCuqupzC9IbwPnkT78Qq5Q";
const DEEP_GREEN = "kWTixwPaU_tQpQBhn0A4YrAQ";
const OLIVE = "kYTy6vO59AFKWPlhkrc4yc8NawP6";
const LIKED = [
  view(SUNSET, "linearGradient", 7, 180),
  view(FOG, "linearGradient", 7, 90),
  view(LAKE, "linearGradient", 7, 135),
  view(BLUE_HOUR, "linearGradient", 7, 45),
  view(TWILIGHT, "linearGradient", 7, 45),
  view(TIDE_LINES, "linearSwatches", 6, 180),
  view(SHELL, "angularGradient", 11, 180),
  view(SAND, "linearSwatches", 13, 90),
  view(EELGRASS, "linearGradient", 32, 180),
  view(TIDAL_BLUE, "radialGradient", 32, 315),
  view(DEEP_GREEN, "linearGradient", 32, 90),
  view(OLIVE, "radialGradient", 32, 315)
];
const stepping = (...seeds: string[]) =>
  Array.from({ length: 9 }, (_, i) => view(seeds[i % seeds.length]!, "linearSwatches", i + 3, 90));
const LIMINAL: Shelf = {
  title: "Liminal Hours",
  slug: "liminal-hours-n5jqs8ak",
  note: "21 palettes",
  about:
    "Gradients for the in-between moments: blue hour, fog lifting, the last light on a lake, neon rain.",
  card: stepping(SUNSET, FOG, LAKE, BLUE_HOUR, TWILIGHT)
};
const TIDES: Shelf = {
  title: "Between tides",
  slug: "between-tides",
  note: "30 palettes",
  about: "Southwest Florida coastal moods in quiet neutrals, luminous gradients and bolder bands.",
  card: stepping(TIDE_LINES, SHELL, SAND)
};
const SEAGRASS: Shelf = {
  title: "Spring tide seagrass",
  slug: "spring-tide-seagrass",
  note: "22 palettes",
  about: "Tidal blue, seafoam, eelgrass green, sand and dusky violet.",
  card: stepping(EELGRASS, TIDAL_BLUE, DEEP_GREEN, OLIVE)
};
const SHELVES = [LIMINAL, TIDES, SEAGRASS];
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
