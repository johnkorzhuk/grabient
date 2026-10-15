/* Sample emails and one of each part, for the preview script and the tests. Never sent.

   The palettes are staging's gallery as it stood when the samples were written; every palette a sample issue draws is
   in LIKED, which stands in for the admins' likes. The sample foot's unsubscribe token is 64 zeros, which names no
   account. */
import { encodePalette } from "@grabient/engine";
import type { Style } from "@grabient/engine/view.ts";
import type { Locale } from "@grabient/i18n";
import type { Letter } from "../src/document.ts";
import {
  type IssueContent,
  LEDE,
  newsletter,
  pick,
  rising,
  type Shelf,
  shelf,
  view,
  ways
} from "../src/issue.ts";
import { confirmDeletion, signInCode, signInLink } from "../src/letters.ts";
import { collection, collections, type PaletteView, palette, palettes } from "../src/palette.ts";
import { blurb, mentions, promo } from "../src/partner.ts";
import {
  button,
  code,
  eyebrow,
  heading,
  image,
  link,
  links,
  list,
  mono,
  note,
  type Part,
  rule,
  section,
  snippet,
  stack,
  strong,
  subheading,
  text,
  title
} from "../src/parts.ts";

interface Shown {
  origin: string;
  locale?: Locale;
  scheme?: "auto" | "light" | "dark";
  /** the brand's colors, as an account email is sent when the gallery has no palette for it to wear */
  brand?: boolean;
}

/* a sample's picks carry names written for it; a real issue's are the site's, given as the site draws it */
const named = (seed: string, style: Style, steps: number, angle: number, name: string) => ({
  ...pick(seed, style, steps, angle),
  name
});
const RISING_ONE = [
  named("kYuXkT47BBu6sxXjqsk1ilF8Onws", "radialGradient", 32, 0, "Coral lagoon"),
  named("kW8RUxaqO8dmsPXbqE2x6zBg", "linearSwatches", 5, 135, "Peach orchard"),
  named("kWzVMw17K7kq5vM-LD1shs7Y", "linearGradient", 32, 180, "Desert dusk"),
  named("kW6hdK6pbElaRxXeH9QcJFBI", "radialSwatches", 5, 0, "Pistachio macaron"),
  named("kW0ibSWiTBMytwpBMkKMyhAQ", "angularGradient", 32, 315, "Orchid velvet")
];
const RISING_TWO = [
  named("ka7hulaKRBFTAwVATkDrrvAENJP5aNz7g", "linearGradient", 32, 135, "Deep end"),
  named("kWk5ENVro_-Mpv_wGb_-we_4", "linearSwatches", 5, 90, "Strawberry milk"),
  named("kWelD3zS9AVgeu3fEbQ8xAyQ", "angularSwatches", 5, 135, "Paper pinwheel"),
  named("kY4B0o4Bi5UyavQ9GLvL5s9SQVvk", "radialGradient", 32, 90, "Porch light"),
  named("kWkEqj3Z87moauRiHzrShc_A", "radialSwatches", 6, 270, "Tide pool")
];
const RISING_THREE = [
  named("kcPDTIpSY_bCowC-IkCy47BdeHz9hIEL5i_Ag", "linearGradient", 32, 180, "Midnight wheat"),
  named("kWsY8L7ztIve4QXauNFR0nBo", "angularSwatches", 5, 45, "Beach ball"),
  named("kW8hpGbo259ciu7COz-u8BAQ", "radialGradient", 32, 225, "Raspberry cream"),
  named("kUSRnguCHF0suRLoI8Tg", "linearSwatches", 12, 105, "Canyon layers"),
  named("kWvi6O7Ju42qqu5aL7zQ6w84", "radialSwatches", 6, 45, "Oasis")
];
const POPULAR = [
  named("kYVQPiMh1BUYpwNao8EaBDD2iRyu", "linearSwatches", 6, 135, "Mulberry ribbons"),
  named("kWUUi8uac_tCiv7gmT7YhM8g", "radialGradient", 32, 45, "Blue iris"),
  named("kcTSHHsBdOEctwjdMsIa7NDG8tw9opsWWy_GQ", "linearGradient", 32, 135, "Neon dawn"),
  named("kYOBzgLZxBMYfwTUH8Dzh_ADmdv0", "radialSwatches", 6, 270, "Nightshade")
];
const LEAD = { ...named("kU-g958yvENOmxwpkD_g", "radialGradient", 32, 0, "Ice cave"), chips: true };
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
const STEEL_PAN: Shelf = {
  title: "Steel pan poster",
  slug: "steel-pan-poster",
  note: "25 palettes",
  about: "Cobalt, turquoise, yellow, orange, magenta and plum, with strong print contrast.",
  tiles: [
    view("kYhkOkWCW6Oe0PBsuT0ZjY8Ve3vA", "radialGradient", 32, 45),
    view("kWaVzy0cVGmm6xversnTLVHo", "angularSwatches", 5, 225),
    view("kYp103v7C8Comu4iqrYMiw8ckduq", "linearSwatches", 6, 90),
    view("kSPkDT1Sq2uC6rG", "linearGradient", 32, 135),
    view("kYlzCV2J2316rOrcOTu0kc9kNFvs", "linearGradient", 32, 180)
  ]
};
const KASAVU: Shelf = {
  title: "Kasavu silk and marigold",
  slug: "kasavu-silk-and-marigold",
  note: "14 palettes",
  about: "Ivory silk, marigold gold, turmeric orange, banana green and deep teal.",
  tiles: [
    view("kWmC53Y549PEnPDtMDz2jG-A", "radialSwatches", 6, 45),
    view("kaXjjbtyK6kwXvNiE7ZcCS6vCvPfisD7g", "linearGradient", 32, 90),
    view("kY5TVIZLG7cUnP40GMYyiDCGqYvU", "angularSwatches", 6, 270),
    view("kW7xJTcZo7mUvP_XLsATZnCg", "linearSwatches", 6, 90),
    view("kU7Rw_4DM_buYTHWqzeA", "linearGradient", 32, 135)
  ]
};
const TOMATO: Shelf = {
  title: "Tomato vine abundance",
  slug: "tomato-vine-abundance",
  note: "24 palettes",
  about: "Tomato red, basil green, ochre, soil brown and rain blue.",
  tiles: [
    view("kWrmol26lEdgoRJKoEKuY7Dw", "radialGradient", 32, 225),
    view("kYWBg8PJm_dGowVdMD82bS886_PU", "radialSwatches", 6, 225),
    view("kUaSeEv567dY6so9u77g", "linearGradient", 32, 135),
    view("kWcGsLrZQ6bgTrzKrTw1LE9w", "linearSwatches", 6, 90),
    view("kWoCmlVhU_z-ethTqrevbu5w", "linearGradient", 32, 135)
  ]
};
const CAFE: Shelf = {
  title: "Home café",
  slug: "home-cafe",
  note: "9 palettes",
  about: "Roasted coffee, crema, milk, syrups and ceramic cups.",
  tiles: [
    view("kUVCQeSSdBV8nQl2jUDg", "radialGradient", 32, 0),
    view("kUY0cKSSvBaIMQPxjkNg", "linearSwatches", 4, 135),
    view("kUhRfpYYnCfELSgvkbxg", "radialSwatches", 4, 0),
    view("kYRCWwuR8_lUWvhzka7Q6U7yOPvy", "linearSwatches", 6, 90),
    view("kUOxMZsSS9cmsQZyDkQA", "linearGradient", 32, 180)
  ]
};
const CALM = [
  view("kWRR-muJm7VKlvljp7955I_A", "linearGradient", 6, 180),
  view("kU0g0o24lNsoRQm7BcAA", "radialSwatches", 5, 210),
  view("kS5x_Ta5hBfCTQm", "angularSwatches", 5, 135),
  view("kW2Rl-zaBJGyQVPTnrvXxHSI", "linearSwatches", 5, 90),
  view("kcsjQI0RBA9EEr_ckLz54Y8OeLtxbEcGTwfCg", "radialSwatches", 8, 0)
];
const SHELVES = [LIMINAL, TIDES, SEAGRASS, STEEL_PAN, KASAVU, TOMATO, CAFE];
const LIKED: readonly PaletteView[] = [
  ...RISING_ONE,
  ...RISING_TWO,
  ...RISING_THREE,
  ...POPULAR,
  LEAD,
  ...CALM,
  ...SHELVES.flatMap(of => of.tiles ?? [])
];
const CSS = ".hero {\n  background: linear-gradient(90deg, #4158d0, #c850c0, #ffcc70);\n}";

/** The three emails an account receives, each wearing a palette of the Rising list. */
const worn = (shown: Shown, of: PaletteView) => ({
  origin: shown.origin,
  locale: shown.locale,
  scheme: shown.scheme,
  palette: shown.brand ? undefined : of
});
export const sampleAccount = {
  link: (shown: Shown): Letter =>
    signInLink({
      ...worn(shown, RISING_ONE[2]),
      url: `${shown.origin}/api/auth/magic-link/verify?token=sample`
    }),
  code: (shown: Shown): Letter => signInCode({ ...worn(shown, RISING_ONE[3]), code: "482913" }),
  deletion: (shown: Shown): Letter =>
    confirmDeletion({ ...worn(shown, RISING_ONE[1]), url: `${shown.origin}/settings?token=sample` })
};

/* A partner is whoever the issue's author swaps with, so a sample names none. Its picture is a plain gray one of the
   site's own in a share card's shape, the picture a partner most often has. */
const THEIRS = encodePalette({
  anchors: [
    { l: 0.9, c: 0, h: 0 },
    { l: 0.8, c: 0, h: 0 }
  ]
});
const partner = (origin: string): Part =>
  promo({
    label: "Partner",
    name: "Partner name",
    href: "https://example.com",
    about: "Two sentences in the partner's own words: what it is, and who it is for.",
    picture: {
      src: `${origin}/${THEIRS}.png?w=1200&h=630`,
      alt: "The partner's picture",
      width: 1200,
      height: 630
    },
    action: "Visit Partner name",
    terms:
      "Partner name recommends Grabient in its newsletter, and we recommend it here. No money changed hands."
  });
const partners = (): Part =>
  mentions({
    label: "Partners",
    items: ["First partner", "Second partner", "Third partner"].map(name => ({
      name,
      href: "https://example.com",
      about: "One sentence in its own words."
    })),
    terms:
      "Each of these mentions Grabient to its readers, and we mention them here. No money changed hands."
  });

/** One of each part, by its id in spec.ts. */
export const sampleParts = (origin: string): Record<string, Part> => ({
  title: stack("s4", title("Introducing collections", { large: true }), title("Sign in")),
  heading: stack("s3", heading("New this month"), subheading("In the editor")),
  text: stack(
    "s3",
    text("Group the palettes that belong together.", { role: "lede" }),
    text([
      "A collection holds palettes that belong together. Select palettes in any list, then press ",
      strong("Save"),
      ". Read ",
      link("how palettes work", `${origin}/about`),
      ", or add ",
      mono(".css"),
      " to a palette link."
    ]),
    text("This link expires in 5 minutes. If you didn't ask for it, ignore this email.", {
      role: "small"
    })
  ),
  eyebrow: eyebrow("From the editor"),
  button: stack(
    "s3",
    button({ href: `${origin}/collections`, label: "Browse collections" }),
    button({ href: `${origin}/about`, label: "How palettes work", quiet: true }),
    button({ href: `${origin}/login`, label: "Sign in", full: true })
  ),
  code: code("482913"),
  list: list(
    "Select palettes in any list, then press Save.",
    "Search collections by a color or a mood.",
    "Save any collection to your account."
  ),
  note: note(
    text([
      "Every palette has its CSS at its own address. Add ",
      mono(".css"),
      " to a palette link."
    ])
  ),
  snippet: snippet(CSS),
  image: image({
    src: `${origin}/grabient.png`,
    alt: "A gradient from pale pink to deep red under the Grabient wordmark, over its seven colors as hex codes",
    width: 1200,
    height: 630,
    href: origin,
    caption: "A palette as its share card."
  }),
  palette: palette(LEAD),
  palettes: palettes(POPULAR),
  collection: collection(shelf(origin)(LIMINAL)),
  collections: collections([TIDES, SEAGRASS].map(shelf(origin))),
  promo: partner(origin),
  mentions: partners(),
  rule: rule(),
  links: links(
    { label: "Palettes", href: `${origin}/palettes` },
    { label: "Collections", href: `${origin}/collections` },
    { label: "About", href: `${origin}/about` }
  ),
  section: section(
    "New this month",
    text("A collection holds palettes that belong together."),
    button({ href: `${origin}/collections`, label: "Browse collections" })
  ),
  stack: stack("s3", title("Sign in"), text("Save your favorite palettes.", { role: "lede" }))
});

const foot = (origin: string) => ({
  reason: "You get this because you signed up for Grabient.",
  unsubscribe: { label: "Unsubscribe", href: `${origin}/unsubscribe/${"0".repeat(64)}` }
});

const first = (origin: string): IssueContent => ({
  liked: LIKED,
  links: ways(origin, { label: "About", href: `${origin}/about` }),
  subject: "Rising in October, and collections",
  issue: "No. 1 · October 2026",
  title: "Rising in October",
  lede: LEDE,
  ahead: "In this issue: collections, and a quick tip.",
  picks: RISING_ONE,
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
    section("Featured collections", collections([LIMINAL, TIDES, SEAGRASS].map(shelf(origin)))),
    section(
      "Quick tip",
      text(["Add ", mono(".css"), " to any palette link to get its CSS."]),
      snippet(CSS),
      button({ href: `${origin}/about`, label: "How palettes work", quiet: true })
    )
  ]
});
/** An issue that uses every kind of part an issue of its own words is made of. */
export const sampleIssue = (shown: Shown): Letter =>
  newsletter({ ...shown, ...foot(shown.origin), ...first(shown.origin) });

/* Claude's own link that opens its Add custom connector dialog with the address filled in: a web address, so a mail
   app keeps it. */
const claudeAdd = (address: string) =>
  `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Grabient&connectorUrl=${encodeURIComponent(address)}`;
/* The apps whose own lists of connectors name Grabient, as a sentence. */
const listedIn = (apps: readonly string[]) =>
  apps.length > 1
    ? `${apps.slice(0, -1).join(", ")} and ${apps.at(-1)} list Grabient among their connectors, so you can add it there by name.`
    : `${apps[0]} lists Grabient among its connectors, so you can add it there by name.`;

const second = (origin: string, listed?: readonly string[]): IssueContent => {
  const page = `${origin}/mcp-server`;
  const address = `${origin}/mcp`;
  return {
    liked: LIKED,
    links: ways(origin, { label: "MCP", href: page }),
    subject: "Rising in November, and Grabient in your AI app",
    issue: "No. 2 · November 2026",
    title: "Rising in November",
    lede: LEDE,
    ahead: "In this issue: palettes from your AI app, and two collections.",
    picks: RISING_TWO,
    more: rising(origin),
    body: [
      section(
        "Ask your AI app for palettes",
        text(
          "Connect an AI app like Claude to your Grabient account. It can search, make and save palettes for you."
        ),
        note(text("Find five calm palettes for a meditation app.")),
        collection({
          title: "Five calm palettes",
          href: `${origin}/palettes?q=calm`,
          tiles: CALM,
          note: "From the gallery"
        }),
        button({ href: claudeAdd(address), label: "Add to Claude" }),
        listed?.length ? text(listedIn(listed)) : null,
        text("In any other app, add a custom connector or MCP server with this address."),
        snippet(address),
        text(
          [
            "Your app asks you to sign in to Grabient when you add it. Choose Allow. The ",
            link("MCP page", page),
            " has the setup for each app."
          ],
          { role: "small" }
        )
      ),
      section("Featured collections", collections([STEEL_PAN, KASAVU].map(shelf(origin))))
    ]
  };
};
/** An issue that promotes connecting an AI app. `listed` names the apps whose own lists name Grabient. */
export const sampleMcpIssue = (shown: Shown & { listed?: readonly string[] }): Letter =>
  newsletter({ ...shown, ...foot(shown.origin), ...second(shown.origin, shown.listed) });

/** An issue with a partner on a tile of its own and three in a few lines, under the palettes and collections. */
export const samplePartnerIssue = (shown: Shown): Letter =>
  newsletter({
    ...shown,
    ...foot(shown.origin),
    liked: LIKED,
    links: ways(shown.origin, { label: "About", href: `${shown.origin}/about` }),
    subject: "Rising in December, and two collections",
    issue: "No. 3 · December 2026",
    title: "Rising in December",
    lede: LEDE,
    ahead: "In this issue: two collections, and picks from our partners.",
    picks: RISING_THREE,
    more: rising(shown.origin),
    body: [
      section("Featured collections", collections([TOMATO, CAFE].map(shelf(shown.origin)))),
      section("From a partner", partner(shown.origin)),
      section("Also worth a look", partners())
    ]
  });

/** Grabient as a partner's newsletter shows it, in its three sizes. */
export const sampleBlurbs = (origin: string) => ({
  line: blurb({ origin, size: "line" }),
  short: blurb({ origin, size: "short" }),
  card: blurb({ origin, size: "card", palette: RISING_ONE[0], liked: LIKED })
});
