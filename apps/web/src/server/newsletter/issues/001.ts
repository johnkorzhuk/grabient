import {
  button,
  collections,
  type Issue,
  image,
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
  tip,
  view,
  ways
} from "@grabient/email";
import { decodePalette } from "@grabient/engine";

/* No. 1, October 2026: collections, and a quick tip. */
const PICKS = [
  pick("kWMS7qPZ68084TQkCrUnaNBo", "linearGradient", 40, 135),
  pick("kU9ClB669AFIzOk9Lj2g", "radialGradient", 32, 0),
  pick("kWziAlUZi-bxAvSmqr2kRe7g", "angularSwatches", 32, 0),
  pick("kUby9y5jE3PaQwI4IDlg", "angularSwatches", 24, 60),
  pick("kUkSoUPQrBKiNOiSm75A", "linearSwatches", 13, 90)
];
/* an October palette from Grabient's Halloween gradients, among the leads, whose addresses the tips show too */
const FOREST = "kUPhh1NqG9EqmuVWvLvg";
/* the pumpkin orange the hex tip searches for */
const PUMPKIN = "#e86a17";
/* More October palettes from the Rising list an admin may lead with instead, each in the view liked. */
const LEADS = [
  view("kWOCz5KKDAjWoQRGJML1qDCQ", "linearGradient", 32, 90),
  view("kYsDwc0aBB0MgwQwnD_H429piQMm", "linearGradient", 32, 180),
  view("kWOhzJKp1B1CxzXoNkIdZ_Bo", "linearGradient", 7, 180),
  view("kW1lA1Wy67USpu2xnjjopO8Y", "linearGradient", 7, 180),
  view("kWVCNaQ5-_topPfnrj3dB9AI", "linearGradient", 7, 90),
  view("kUhTMb0ypEriFL8wEqsA", "radialGradient", 64, 0),
  view("kYMSMAK6vBj9BwLMx0EWrvCW6uQ4", "radialSwatches", 6, 180),
  view("kUp2HtvK3CCcjw-fkEWA", "radialGradient", 32, 0),
  /* and October's own */
  view(FOREST, "linearGradient", 7, 180)
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
/* The quick tips an admin may end the issue with, the first unless another is chosen. Each is what the site does now:
   the files at a palette's or a public collection's address (files/palette-files.ts, collection-files.ts), a picture's
   size (images/size.ts), search by a hex code or a palette's link (search/search.ts), and the editor's keys as the
   key map has them. */
const tips = (origin: string) => [
  tip(
    "css",
    "CSS at a palette's link",
    text(["Add ", mono(".css"), " to any palette link to get its CSS."]),
    snippet(CSS),
    button({ href: `${origin}/about`, label: "How palettes work", quiet: true })
  ),
  tip(
    "png",
    "A picture at any size",
    text([
      "Add ",
      mono(".png"),
      " to any palette link for a picture of it. Add a size for a wallpaper or a slide."
    ]),
    snippet(`${origin}/${FOREST}.png?size=1920x1080`),
    button({ href: `${origin}/${FOREST}.png?size=1920x1080`, label: "See it", quiet: true })
  ),
  tip(
    "swatches",
    "A collection's swatch files",
    text([
      "Add ",
      mono(".ase"),
      ", ",
      mono(".gpl"),
      " or ",
      mono(".grd"),
      " to a public collection's link to take all its palettes into your design app at once. A palette's link takes them too."
    ]),
    snippet(`${origin}/${SUMAC.slug}.ase`)
  ),
  tip(
    "hex",
    "Search by a hex code",
    text("Search for a hex code to find palettes near that color."),
    button({
      href: `${origin}/palettes?q=${encodeURIComponent(PUMPKIN)}`,
      label: `Search ${PUMPKIN}`,
      quiet: true,
      swatch: PUMPKIN
    })
  ),
  tip(
    "like",
    "Palettes like one you love",
    text("Paste a palette's link into search to find palettes like it."),
    snippet(`${origin}/${FOREST}`),
    button({ href: `${origin}/palettes?q=${FOREST}`, label: "Find palettes like it", quiet: true })
  ),
  tip(
    "keys",
    "The editor's keys",
    text([
      "In the editor, press ",
      mono("B"),
      " for a random palette, and ",
      mono("["),
      " or ",
      mono("]"),
      " for fewer or more steps. Press ",
      mono("?"),
      " to see every key."
    ]),
    button({ href: `${origin}/random`, label: "Open a random palette", quiet: true })
  )
];

export const october: Issue = {
  number: 1,
  month: "2026-10",
  published: "2026-10-08",
  leads: LEADS,
  write: origin => ({
    subject: "Rising in October, and collections",
    issue: "No. 1 · October 2026",
    title: "Rising in October",
    lede: LEDE,
    ahead: "In this issue: collections, and a quick tip.",
    liked: [...PICKS, ...LEADS, ...LIKED],
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
        image({
          src: `${origin}/email/collections-4.gif`,
          light: `${origin}/email/collections-4-light.gif`,
          alt: "A palette liked and added to two collections from its card, then turned into the bar of Grabient's logo",
          width: 534,
          height: 300,
          href: `${origin}/collections`
        }),
        text("Find a collection by a color or a mood, and save it to your account."),
        button({ href: `${origin}/collections`, label: "Browse collections" })
      ),
      section("Featured collections", collections(SHELVES.map(shelf(origin))))
    ],
    tips: tips(origin),
    links: ways(origin, { label: "About", href: `${origin}/about` })
  })
};
