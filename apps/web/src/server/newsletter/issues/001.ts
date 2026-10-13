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
const LIMINAL: Shelf = {
  title: "Liminal Hours",
  slug: "liminal-hours-n5jqs8ak",
  note: "21 palettes",
  about:
    "Gradients for the in-between moments: blue hour, fog lifting, the last light on a lake, neon rain.",
  tiles: [
    view("kW1lA1Wy67USpu2xnjjopO8Y", "linearGradient", 7, 180),
    view("kW7Q_UZpg_9Mpv2_rz9rKS_4", "linearGradient", 7, 45),
    view("kWKC3RLLdA8tNRZbwkJbawtI", "linearGradient", 7, 90),
    view("kWOhzJKp1B1CxzXoNkIdZ_Bo", "linearGradient", 7, 180),
    view("kW5UA4YzU885KPU1NL6GhO-A", "linearGradient", 7, 135)
  ]
};
const TIDES: Shelf = {
  title: "Between tides",
  slug: "between-tides",
  note: "30 palettes",
  about: "Southwest Florida coastal moods in quiet neutrals, luminous gradients and bolder bands.",
  tiles: [
    view("kQ3yUGthcyI", "radialGradient", 32, 0),
    view("kYoCnCYRDJe2Wxv1j8P5pFLUYbQq", "angularGradient", 11, 180),
    view("kWOR7UZp1N9SbtI2lLi8Q5R4", "radialSwatches", 9, 0),
    view("kWezyUXx8-b4cQNfGa6ZhpMI", "linearGradient", 32, 45),
    view("kWQBh4Z5a6EYYQeyFUNp4_Aw", "linearSwatches", 5, 210)
  ]
};
const SEAGRASS: Shelf = {
  title: "Spring tide seagrass",
  slug: "spring-tide-seagrass",
  note: "22 palettes",
  about: "Tidal blue, seafoam, eelgrass green, sand and dusky violet.",
  tiles: [
    view("kWXDFzyB9BFeVQzTkslv6JEo", "linearGradient", 32, 180),
    view("kWOxu4MRW6EOdu9NHzxTqA5I", "linearSwatches", 6, 135),
    view("kW8Rihbha_uUbPlkIbtayi8g", "radialGradient", 32, 0),
    view("kY2BWf2hO9kYUvPEkzp1xU6-qPPs", "angularSwatches", 6, 225),
    view("kW1Cq_XqO_VSgP9cmzGUSc_o", "linearSwatches", 5, 90)
  ]
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
    liked: [...PICKS, ...SHELVES.flatMap(of => of.tiles)],
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
