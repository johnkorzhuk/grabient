import {
  button,
  collection,
  collections,
  type Issue,
  LEDE,
  link,
  note,
  pick,
  rising,
  type Shelf,
  section,
  shelf,
  snippet,
  text,
  view,
  ways
} from "@grabient/email";

/* No. 2, November 2026: connecting an AI app, in the MCP page's words. It holds whether or not an app's own list of
   connectors names Grabient: Claude's one-click link and the address work today. LISTED names the apps that do, and
   adds the sentence that says so. */
const PICKS = [
  pick("ka7hulaKRBFTAwVATkDrrvAENJP5aNz7g", "linearGradient", 32, 135, "Deep end"),
  pick("kWk5ENVro_-Mpv_wGb_-we_4", "linearSwatches", 5, 90, "Strawberry milk"),
  pick("kWelD3zS9AVgeu3fEbQ8xAyQ", "angularSwatches", 5, 135, "Paper pinwheel"),
  pick("kY4B0o4Bi5UyavQ9GLvL5s9SQVvk", "radialGradient", 32, 90, "Porch light"),
  pick("kWkEqj3Z87moauRiHzrShc_A", "radialSwatches", 6, 270, "Tide pool")
];
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
const SHELVES = [STEEL_PAN, KASAVU];
const CALM = [
  view("kWRR-muJm7VKlvljp7955I_A", "linearGradient", 6, 180),
  view("kU0g0o24lNsoRQm7BcAA", "radialSwatches", 5, 210),
  view("kS5x_Ta5hBfCTQm", "angularSwatches", 5, 135),
  view("kW2Rl-zaBJGyQVPTnrvXxHSI", "linearSwatches", 5, 90),
  view("kcsjQI0RBA9EEr_ckLz54Y8OeLtxbEcGTwfCg", "radialSwatches", 8, 0)
];
const LISTED: readonly string[] = [];
const listedIn = (apps: readonly string[]) =>
  apps.length > 1
    ? `${apps.slice(0, -1).join(", ")} and ${apps.at(-1)} list Grabient among their connectors, so you can add it there by name.`
    : `${apps[0]} lists Grabient among its connectors, so you can add it there by name.`;
/* Claude's own link, which opens its Add custom connector dialog with the address filled in: a web address, so a mail
   app keeps it, where the other apps' one-click links open the app itself and are stripped. */
const addToClaude = (address: string) =>
  `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Grabient&connectorUrl=${encodeURIComponent(address)}`;

export const november: Issue = {
  number: 2,
  month: "2026-11",
  write: origin => {
    const page = `${origin}/mcp-server`;
    const address = `${origin}/mcp`;
    return {
      subject: "Rising in November, and Grabient in your AI app",
      issue: "No. 2 · November 2026",
      title: "Rising in November",
      lede: LEDE,
      ahead: "In this issue: palettes from your AI app, and two collections.",
      liked: [...PICKS, ...CALM, ...SHELVES.flatMap(of => of.tiles ?? [])],
      picks: PICKS,
      more: rising(origin),
      body: [
        section(
          "Ask your AI app for palettes",
          text(
            "Connect an AI app such as Claude to your Grabient account. It can search the gallery, make palettes and save them for you."
          ),
          note(text("Find five calm palettes for a meditation app.")),
          collection({
            title: "Five calm palettes",
            href: `${origin}/palettes?q=calm`,
            tiles: CALM,
            note: "From the gallery"
          }),
          button({ href: addToClaude(address), label: "Add to Claude" }),
          LISTED.length ? text(listedIn(LISTED)) : null,
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
        section("Featured collections", collections(SHELVES.map(shelf(origin))))
      ],
      links: ways(origin, { label: "MCP", href: page })
    };
  }
};
