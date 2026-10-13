import { readFileSync } from "node:fs";
import { decodePalette, encodePalette } from "@grabient/engine";
import { translate } from "@grabient/i18n";
import { LOGO_BAR, LOGO_PATH } from "@grabient/ui/logo.data.ts";
import { describe, expect, test } from "vitest";
import {
  bare,
  bytes,
  classes,
  decode,
  hrefs,
  inlineStyles,
  ORIGIN as origin,
  srcs,
  styleBlocks
} from "../test/support.ts";
import { email, insetStyles, specimen } from "./document.ts";
import { headFault, pickHead } from "./head.ts";
import * as api from "./index.ts";
import { issuePage, type NewsletterOptions, newsletter } from "./issue.ts";
import { confirmDeletion, signInCode, signInLink } from "./letters.ts";
import { collection, hexes, palette, palettes } from "./palette.ts";
import { blurb, mentions, promo } from "./partner.ts";
import {
  button,
  type Ctx,
  image,
  link,
  list,
  mono,
  note,
  section,
  snippet,
  strong,
  text
} from "./parts.ts";
import {
  sampleAccount,
  sampleBlurbs,
  sampleIssue,
  sampleMcpIssue,
  samplePartnerIssue,
  sampleParts
} from "./sample.ts";
import { PARTS } from "./spec.ts";
import { BRAND, HEAD_CID, HEAD_FILES, SIZE } from "./theme.ts";

const seed = "kS7Q8Yy5S_SChv0";
const second = "kWo3evWSq82MnutpJ745p1CI";
const third = "kU53xGajA9GKuO3bvrwA";
const url = `${origin}/api/auth/magic-link/verify?token=a&b=<c>"d'`;
const out = `${origin}/unsubscribe/${"0".repeat(64)}`;
const liked = [
  { seed },
  { seed: second },
  { seed: third },
  { seed, style: "radialSwatches" as const, steps: 5, angle: 0 }
];
const ctx: Ctx = {
  origin,
  locale: "en",
  dir: "ltr",
  start: "left",
  end: "right",
  sans: "sans-serif",
  measure: 534
};
const drawn = (part: (ctx: Ctx) => { html: { html: string } }) => decode(part(ctx).html.html);
const colorsOf = (of: string, n?: number) => {
  const P = decodePalette(of)!;
  return hexes(P, n ?? P.anchors.length);
};

const words = (more: Partial<NewsletterOptions> = {}): NewsletterOptions => ({
  origin,
  liked,
  subject: "Grabient: October",
  issue: "No. 1",
  title: "Rising in October",
  lede: "Picked by hand.",
  ahead: "Further down: collections.",
  picks: [
    { seed, name: "Sunset" },
    { seed: second, name: "Second" },
    { seed: third, name: "Third" }
  ],
  more: { label: "See all rising palettes", href: `${origin}/palettes/rising` },
  body: [
    section(
      "New",
      text([
        "Read ",
        link("the guide", `${origin}/about`),
        ", then ",
        strong("save"),
        " ",
        mono("#ffcc70"),
        "."
      ]),
      list("One", "Two"),
      button({ href: `${origin}/collections`, label: "Browse collections" })
    ),
    section(
      "Palettes",
      palettes([{ seed, name: "One", note: "12 likes" }, { seed, name: "Two" }, { seed }])
    ),
    section(
      "A collection",
      collection({
        title: "Warm evenings",
        href: `${origin}/warm-evenings`,
        tiles: [
          { seed },
          { seed: second },
          { seed, style: "radialSwatches", steps: 5, angle: 270 }
        ],
        note: "24 palettes",
        about: "Dusk in five colors."
      })
    ),
    section(
      null,
      snippet(".a {\n  color: red;\n}"),
      note(text("A note.")),
      image({
        src: `${origin}/shot.png`,
        alt: "The editor",
        width: 1200,
        height: 800,
        caption: "The editor."
      }),
      button({ href: `${origin}/about`, label: "About", quiet: true })
    )
  ],
  reason: "You get this because you signed up for Grabient.",
  unsubscribe: { label: "Unsubscribe", href: out },
  ...more
});
const link_ = signInLink({ origin, url });
const code_ = signInCode({ origin, code: "482913" });
const gone = confirmDeletion({ origin, url: `${origin}/settings?token=t` });
const news = newsletter(words());

describe("account emails", () => {
  test("the action is the one button in ink, and a code the one <strong>", () => {
    const action = (html: string) =>
      [...html.matchAll(/class="btn-label" href="([^"]+)"/g)].map(m => decode(m[1]));
    expect([action(link_.html), action(gone.html), action(code_.html)]).toEqual([
      [url],
      [`${origin}/settings?token=t`],
      []
    ]);
    expect(code_.html.match(/<strong>(\d{6})<\/strong>/g)).toEqual(["<strong>482913</strong>"]);
    expect(link_.html).not.toContain("<strong>");
    expect([link_.subject, code_.subject, gone.subject]).toEqual([
      "Sign in to Grabient",
      "Your Grabient sign-in code",
      "Confirm account deletion"
    ]);
    const heading = (html: string) => /<h1\b[^>]*>([^<]*)<\/h1>/.exec(html)?.[1] ?? null;
    expect([heading(link_.html), heading(code_.html), heading(gone.html)]).toEqual([
      null,
      "Sign in",
      "Confirm account deletion"
    ]);
    expect(link_.html.split(">Sign in<")).toHaveLength(2);
  });
  test("the head's link stands before the action", () => {
    const at = (html: string, needle: string) => html.indexOf(needle);
    expect(at(link_.html, 'data-part="head"')).toBeLessThan(at(link_.html, 'class="btn-label"'));
  });
  test("a code never stands in the preview line", () => {
    expect(code_.html.slice(0, code_.html.indexOf("<table"))).not.toContain("482913");
  });
  test("each is written in the reader's language and direction", () => {
    const arabic = signInLink({ origin, url, locale: "ar" });
    expect(arabic.html.startsWith('<!DOCTYPE html><html lang="ar" dir="rtl"')).toBe(true);
    expect(arabic.html).toMatch(/text-align:right;direction:rtl/);
    expect(arabic.subject).toBe(translate("ar", "Sign in to Grabient"));
    expect(arabic.subject).not.toBe("Sign in to Grabient");
    const japanese = confirmDeletion({ origin, url, locale: "ja" });
    for (const english of [
      "Confirm account deletion",
      "This permanently deletes your account and saved palettes.",
      "Confirm deletion",
      "Sign in to confirm. This link expires in 24 hours."
    ]) {
      expect(japanese.text).toContain(translate("ja", english));
    }
    const vietnamese = confirmDeletion({ origin, url, locale: "vi" });
    expect(vietnamese.html).not.toContain("@font-face");
    expect(vietnamese.html).not.toContain("font-family:Poppins");
    expect(signInCode({ origin, code: "222222", locale: "ar" }).html).toMatch(
      /<td class="fill ink" align="center" dir="ltr"/
    );
  });
  test("the foot and the head lead home in the reader's language", () => {
    expect(hrefs(confirmDeletion({ origin, url, locale: "ja" }).html)).toContain(`${origin}/ja`);
    expect(hrefs(link_.html)).toContain(origin);
  });
});

describe("plain text", () => {
  test("carries what the HTML does, with no markup", () => {
    for (const [letter, needle] of [
      [link_, url],
      [code_, "482913"],
      [gone, `${origin}/settings?token=t`],
      [news, out]
    ] as const) {
      expect(letter.text).toContain(needle);
      expect(letter.text.replace(url, "")).not.toMatch(/[<>]|&#\d+;|&nbsp;/);
      expect(letter.html.startsWith('<!DOCTYPE html><html lang="en" dir="ltr"')).toBe(true);
    }
  });
  test("an issue opens with its picks, then its title, then the rest", () => {
    expect(news.text).toMatch(
      /^Sunset\nhttps:\/\/grabient\.test\/kS7Q8Yy5S_SChv0\n#[0-9a-f]{6}( #[0-9a-f]{6}){2}\n\nNo\. 1\n\nRising in October\n\nPicked by hand\.\n\nFurther down: collections\.\n\nSecond\n[^\n]+\n\nThird\n[^\n]+\n\nSee all rising palettes: https:\/\/grabient\.test\/palettes\/rising\n\nNew\n/
    );
    expect(news.text).toMatch(
      /You get this because you signed up for Grabient\. Unsubscribe \(https:\/\/grabient\.test\/unsubscribe\/0{64}\)\n$/
    );
    expect(newsletter(words({ postal: "1 Example Street" })).text).toMatch(
      /0{64}\)\n\n1 Example Street\n$/
    );
  });
  test("an issue shows each pick once", () => {
    expect(() => newsletter(words({ picks: [{ seed }, { seed }] }))).toThrow(
      /each of its picked palettes once/
    );
  });
});

describe("words and addresses", () => {
  test("a caller's words never become markup, and an address stays whole", () => {
    const hostile = email({
      origin,
      subject: '<b>"hi"</b>',
      body: [
        text("a & b <i>c</i>"),
        button({ label: "<u>Go</u>", href: `${origin}/?q="><script>` })
      ]
    });
    expect(hostile.html).not.toMatch(/<i>c<\/i>|<u>Go|<b>"hi"/);
    expect(hrefs(hostile.html)).toContain(`${origin}/?q="><script>`);
  });
  test.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "/relative",
    "//host/x",
    " https://x.test"
  ])("only web and mail addresses are linked: %s", href => {
    expect(() => button({ href, label: "Go" })(ctx)).toThrow(/web or mail address/);
  });
  test("a bad origin or seed stops the email", () => {
    expect(() => signInLink({ origin: "grabient.test", url })).toThrow(/origin/);
    expect(() => palette({ seed: "not-a-seed" })(ctx)).toThrow(/Not a palette seed/);
    expect(() => signInLink({ origin, url, palette: { seed: "not-a-seed" } })).toThrow(
      /Not a palette seed/
    );
  });
});

describe("what mail apps accept", () => {
  const all = { link: link_, code: code_, deletion: gone, newsletter: news };
  test.each(Object.entries(all))("%s", (_, letter) => {
    expect(bytes(letter.html)).toBeLessThan(102 * 1024);
    for (const block of styleBlocks(letter.html)) expect(block.length).toBeLessThan(8192);
    expect(letter.html).not.toMatch(
      /<script|<link\b|<svg|\bon\w+=|position:|display:flex|display:grid|var\(|rgba?\([^)]*\//
    );
    for (const style of inlineStyles(letter.html)) {
      expect(style).not.toMatch(/background-image:/);
      expect(/(?:^|;)background:/.test(style) && /background-color:/.test(style)).toBe(false);
      for (const [, value] of style.matchAll(/(?:^|;)(?:color|background-color):([^;]+)/g)) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    for (const [, address] of letter.html.matchAll(/\b(?:src|href)="([^"]*)"/g)) {
      expect(decode(address).startsWith(origin)).toBe(true);
    }
    expect(letter.html).toMatch(
      /url\(https:\/\/grabient\.test\/fonts\/poppins-latin-500-normal\.woff2\)/
    );
    expect(bare(letter.html)).toEqual([]);
  });
  test("a picture given nowhere to lead opens itself", () => {
    expect(news.html).toContain(
      `<a href="${origin}/shot.png" style="display:block;text-decoration:none"><img class="line" src="${origin}/shot.png"`
    );
  });
  test("the site lets a mail app load its fonts", () => {
    const headers = readFileSync(
      new URL("../../../apps/web/public/_headers", import.meta.url),
      "utf8"
    );
    expect(headers).toMatch(/\/fonts\/\*\n(?: {2}.*\n)*? {2}Access-Control-Allow-Origin: \*/);
  });
});

describe("schemes", () => {
  test("the dark scheme recolors every class but the layout ones", () => {
    const dark = /@media \(prefers-color-scheme:dark\)\{([\s\S]*?\})\}/.exec(news.html)?.[1] ?? "";
    for (const name of classes(news.html)) {
      if (!["gutter", "pad", "sides", "title", "chip"].includes(name))
        expect(dark).toContain(`.${name}{`);
    }
    expect(news.html).toContain("[data-ogsc] .ink{");
    const fixed = signInLink({ origin, url, scheme: "dark" }).html;
    expect(fixed).not.toContain("prefers-color-scheme");
    expect(fixed).toContain(".ink{color:#ececea!important}");
  });
  test("a phone's smaller chips stand only inside the media and container queries", () => {
    const rule = ".chip{height:32px!important;line-height:32px!important;font-size:8px!important}";
    const inQuery = (styles: string, query: string) => {
      const from = styles.indexOf(query);
      return (
        from >= 0 && styles.indexOf(rule, from) > from && !styles.slice(0, from).includes(".chip{")
      );
    };
    expect(inQuery(styleBlocks(news.html).join(""), "@media (max-width:480px){")).toBe(true);
    expect(inQuery(insetStyles(SCHEME_VARS), "@container (max-width:480px){")).toBe(true);
  });
});
const SCHEME_VARS = {
  paper: "var(--p)",
  edge: "var(--g)",
  shadow: "var(--s)",
  ink: "var(--a)",
  ink2: "var(--b)",
  ink3: "var(--c)",
  line: "var(--d)",
  fill: "var(--e)",
  onInk: "var(--f)"
};

describe("palettes", () => {
  test("a palette is the site's picture in its view, over the same view in CSS", () => {
    const html = drawn(palette({ seed, name: "Sunset", chips: true }));
    const [w, h] = SIZE.pictures.lead;
    expect(srcs(html)).toEqual([
      `${origin}/${seed}.png?style=linearGradient&steps=7&angle=90&w=${w}&h=${h}`
    ]);
    expect(html).toMatch(
      new RegExp(
        `<img src="[^"]*" alt="Sunset" width="534" height="${Math.round((534 * h) / w)}" style="display:block;width:100%;height:auto;`
      )
    );
    expect(html).toContain(
      `<td bgcolor="${colorsOf(seed, 7)[3]}" style="background:linear-gradient(90deg, `
    );
    expect(html).toContain(`href="${origin}/${seed}"`);
  });
  test("chips name the keyframes, two to eight whatever the steps, and only when asked", () => {
    const chips = (html: string) => [...html.matchAll(/>(#[0-9a-f]{6})<\/td>/g)].map(m => m[1]);
    expect(chips(drawn(palette({ seed, chips: true })))).toEqual(colorsOf(seed));
    expect(
      chips(
        drawn(
          palette({ seed: second, style: "angularGradient", steps: 32, angle: 315, chips: true })
        )
      )
    ).toEqual(colorsOf(second));
    expect(chips(drawn(palette({ seed })))).toEqual([]);
  });
  test("a radial picture's address says the default angle; its page keeps the angle given", () => {
    const html = drawn(palette({ seed, style: "radialSwatches", steps: 5, angle: 270 }));
    expect(srcs(html)[0]).toContain("style=radialSwatches&steps=5&angle=90&");
    expect(html).toContain(`href="${origin}/${seed}?style=radialSwatches&steps=5&angle=270"`);
  });
  test("steps are never fewer than the keyframes, and a view the site would not read throws", () => {
    const eight = encodePalette({
      anchors: Array.from({ length: 8 }, (_, i) => ({ l: 0.2 + i * 0.1, c: 0.1, h: i * 20 }))
    });
    expect(srcs(drawn(palette({ seed: eight })))[0]).toContain("steps=8&");
    for (const bad of [
      { style: "spiral" },
      { steps: 6.5 },
      { steps: 101 },
      { angle: 361 },
      { angle: -1 }
    ]) {
      expect(() => palette({ seed, ...(bad as object) })(ctx)).toThrow(/styles|whole numbers/);
    }
  });
  test("a collection is three to six tiles, each leading to it", () => {
    const tiles = [{ seed }, { seed: second }, { seed: third }];
    const html = drawn(collection({ title: "T", href: `${origin}/t`, tiles }));
    expect(srcs(html).map(src => src.split("&w=")[1])).toEqual(Array(3).fill("300&h=300"));
    expect([...html.matchAll(new RegExp(`href="${origin}/t"`, "g"))]).toHaveLength(4);
    expect(() =>
      collection({ title: "T", href: `${origin}/t`, tiles: tiles.slice(0, 2) })(ctx)
    ).toThrow(/3 to 6/);
    expect(
      srcs(drawn(collection({ title: "T", href: `${origin}/t`, tiles: Array(8).fill({ seed }) })))
    ).toHaveLength(6);
  });
  test("a worn palette is the wash behind the sheet", () => {
    const wash = (html: string) => /\.wash\{background-image:([^}]+)\}/.exec(html)?.[1];
    expect(wash(signInLink({ origin, url, palette: { seed } }).html)).not.toBe(wash(link_.html));
  });
});

describe("the admins' likes", () => {
  const refused = /only palettes an admin liked/;
  test("an issue stops at a palette no admin liked, or one in a view not liked", () => {
    expect(() => newsletter(words({ liked: [] }))).toThrow(refused);
    expect(() => newsletter(words({ picks: [{ seed, style: "angularSwatches" }] }))).toThrow(
      refused
    );
    expect(() =>
      newsletter(words({ body: [section("More", palettes([{ seed: "kUVWLxQ8zCNfDRHtP8cA" }]))] }))
    ).toThrow(refused);
    expect(() =>
      newsletter(
        words({
          body: [
            collection({
              title: "T",
              href: `${origin}/t`,
              tiles: [{ seed }, { seed: second }, { seed: "kUVWLxQ8zCNfDRHtP8cA" }]
            })
          ]
        })
      )
    ).toThrow(refused);
    expect(() => newsletter(words({ liked: [{ seed: "not-a-seed" }] }))).toThrow(refused);
    expect(() =>
      blurb({ origin, size: "card", palette: { seed: "kUVWLxQ8zCNfDRHtP8cA" }, liked })
    ).toThrow(refused);
  });
  test("a radial like holds at any angle", () => {
    expect(
      newsletter(words({ picks: [{ seed, style: "radialSwatches", steps: 5, angle: 135 }] })).html
    ).toContain("style=radialSwatches");
  });
});

describe("heads", () => {
  const head = (html: string) =>
    /<img data-part="head" src="([^"]+)" width="(\d+)" height="(\d+)" alt="Grabient"/
      .exec(html)
      ?.slice(1)
      .map(decode);
  test("a palette's head is the share card without its chips, as wide as the sheet inside its edge", () => {
    const rings = { seed, style: "radialSwatches" as const, steps: 5, angle: 270 };
    expect(head(signInLink({ origin, url, palette: rings }).html)).toEqual([
      `${origin}/api/og?seed=${seed}&style=radialSwatches&steps=5&angle=90&head=800x200`,
      "398",
      "100"
    ]);
  });
  test("carried, it names the attachment and nothing of the site's", () => {
    for (const letter of [
      signInLink({ origin, url, palette: { seed }, carried: true }),
      signInCode({ origin, code: "482913", carried: true }),
      confirmDeletion({ origin, url, palette: { seed }, carried: true })
    ]) {
      expect(head(letter.html)?.[0]).toBe(`cid:${HEAD_CID}`);
      expect(letter.html).not.toMatch(/\/api\/og\?|\/email\/head-/);
      expect(bare(letter.html)).toEqual([]);
    }
    expect(() =>
      email({ origin, subject: "S", width: "letter", carried: true, body: [text("Words.")] })
    ).toThrow(/Only a sheet's head travels/);
  });
  test("with no palette it is the brand's file, drawn at the head's size", () => {
    expect(head(link_.html)?.[0]).toBe(`${origin}/${HEAD_FILES.sheet}`);
    expect(head(newsletter(words({ picks: [] })).html)?.[0]).toBe(`${origin}/${HEAD_FILES.letter}`);
    for (const root of ["../../../apps/web/public/", "../../../apps/design/public/"]) {
      for (const [kind, file] of Object.entries(HEAD_FILES)) {
        const png = readFileSync(new URL(root + file, import.meta.url));
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(
          SIZE.heads[kind as keyof typeof HEAD_FILES]
        );
      }
    }
  });
  test("a newsletter's lead is its whole preview, its name and chips under it, drawn once", () => {
    expect(head(news.html)).toEqual([
      `${origin}/api/og?seed=${seed}&style=linearGradient&steps=7&angle=90&head=1200x540`,
      "598",
      "269"
    ]);
    expect(news.html).toMatch(
      new RegExp(
        `<a href="${origin}/${seed}" tabindex="-1" aria-hidden="true" style="display:block;text-decoration:none"><img data-part="head"`
      )
    );
    expect(news.html.match(/data-part="chips"/g)).toHaveLength(1);
    expect(news.html).not.toContain(`w=${SIZE.pictures.lead[0]}&#38;h=`);
    const unnamed = newsletter(words({ picks: [{ seed }] })).html;
    expect(unnamed).toMatch(
      new RegExp(
        `<a href="${origin}/${seed}" style="display:block;text-decoration:none"><img data-part="head"`
      )
    );
  });
  test("a head is a strip: angular, gray, busy and faint views are passed over", () => {
    const gray = encodePalette({
      anchors: [
        { l: 0.2, c: 0, h: 0 },
        { l: 0.9, c: 0.01, h: 0 }
      ]
    });
    const zigzag = encodePalette({
      anchors: [260, 100, 260, 100, 260].map((h, i) => ({ l: i % 2 ? 0.9 : 0.3, c: 0.12, h }))
    });
    expect(headFault({ seed: "not-a-seed" })).toBe("unread");
    expect(headFault({ seed, steps: 2.5 })).toBe("unread");
    expect(headFault({ seed: gray })).toBe("gray");
    expect(headFault({ seed, style: "angularSwatches", steps: 5 })).toBe("angular");
    expect(headFault({ seed: zigzag, style: "radialGradient", steps: 32 })).toBe("busy");
    expect(headFault({ seed: zigzag, style: "linearSwatches", steps: 16 })).toBe("faint");
    expect(pickHead([{ seed: gray }, { seed, style: "angularSwatches" }])).toBeUndefined();
  });
});

describe("an issue on a page of the site", () => {
  /* the picture a section names is the one picture a page shows */
  const onPage = words({ body: words().body.slice(0, 3) });
  const page = issuePage(onPage);
  test("is its email's sheet, with no document, wash or picture asked of the site", () => {
    expect(page.html).not.toMatch(
      /<img\b|\.png\?|\/api\/og\?|<style|<html|<body|class="[^"]*\b(?:wash|bg|gutter)\b/
    );
    expect(
      page.html.startsWith(
        '<div class="inset" dir="ltr"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px"><tr><td class="sheet" bgcolor='
      )
    ).toBe(true);
    expect(page.text).toBe(newsletter(onPage).text);
    expect(hrefs(page.html).at(-1)).toBe(out);
  });
  test("stands every heading a level down", () => {
    expect([...page.html.matchAll(/<(h\d)\b[^>]*>([^<]*)</g)].map(m => `${m[1]} ${m[2]}`)).toEqual([
      "h2 Rising in October",
      "h3 New",
      "h3 Palettes",
      "h3 A collection"
    ]);
  });
  test("draws the lead's wordmark in the painter's place and ink, its bar the palette's colors", () => {
    const html = decode(page.html);
    const mark =
      /<svg viewBox="0 0 220 50" aria-hidden="true" style="position:absolute;left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%;height:auto"><defs><linearGradient id="bar">(.*?)<\/linearGradient><\/defs><path d="([^"]+)" fill="rgb\((\d+),\6,\6\)"><\/path><rect x="(\d+)" y="(\d+)"/.exec(
        html
      );
    expect(mark?.slice(1, 4)).toEqual(["2.667", "5.926", "23.833"]);
    expect([...(mark?.[4] ?? "").matchAll(/stop-color="(#[0-9a-f]{6})"/g)].map(m => m[1])).toEqual(
      colorsOf(seed, 7)
    );
    expect(mark?.[5]).toBe(LOGO_PATH);
    expect(["10", "250"]).toContain(mark?.[6]);
    expect([Number(mark?.[7]), Number(mark?.[8])]).toEqual([LOGO_BAR.x, LOGO_BAR.y]);
    expect(page.html.match(/data-part="chips"/g)).toHaveLength(1);
  });
  test("draws the brand's head with no pick, leading home", () => {
    const plain = decode(issuePage(words({ picks: [] })).html);
    expect(plain).toContain(`style="background:linear-gradient(90deg,${BRAND.join(",")});`);
    expect(plain).toMatch(
      new RegExp(
        `<a href="${origin}" style="display:block;text-decoration:none"><span data-part="head" role="img" aria-label="Grabient" style="display:block;position:relative;aspect-ratio:1200 / 300">`
      )
    );
  });
  test("draws each other palette as a block of its picture's shape", () => {
    expect(
      page.html.split('<span style="display:block;aspect-ratio:520 / 390"></span>')
    ).toHaveLength(6);
    expect(
      page.html.split('<span style="display:block;aspect-ratio:300 / 300"></span>')
    ).toHaveLength(4);
  });
  test("keeps to the likes and leads to the reader's language", () => {
    expect(() => issuePage(words({ liked: [] }))).toThrow(/only palettes an admin liked/);
    expect(hrefs(issuePage(words({ locale: "ja" })).html)).toContain(`${origin}/ja/${seed}`);
  });
  test("runs its own language's way, the foot's line the reader's", () => {
    const arabic = words({ locale: "ar", reason: "تصلك هذه الرسالة." });
    const own = '<div lang="ar" dir="rtl" style="text-align:right"><p class="ink3"';
    const onPage = issuePage(arabic).html;
    expect(onPage.startsWith('<div class="inset" dir="ltr">')).toBe(true);
    expect(onPage.split(own)).toHaveLength(2);
    expect(onPage.indexOf(own)).toBeGreaterThan(onPage.indexOf('data-part="foot"'));
    expect(newsletter(arabic).html.split(own)).toHaveLength(2);
    expect(page.html).not.toContain("lang=");
    expect(
      issuePage({ ...arabic, written: "ar" }).html.startsWith('<div class="inset" dir="rtl">')
    ).toBe(true);
  });
  test("has a rule for every class it carries", () => {
    const styles = insetStyles(SCHEME_VARS);
    for (const name of classes(page.html)) expect(styles).toContain(`.${name}{`);
  });
});

describe("the parts and the samples", () => {
  test("PARTS lists the parts the package exports, and the samples draw one of each", () => {
    const helpers = [
      "link",
      "strong",
      "mono",
      "subheading",
      "blurb",
      "newsletter",
      "issuePage",
      "insetStyles",
      "signInLink",
      "signInCode",
      "confirmDeletion",
      "specimen",
      "pickHead",
      "pick",
      "view",
      "shelf",
      "rising",
      "ways"
    ];
    const parts = Object.entries(api)
      .filter(([name, value]) => typeof value === "function" && !helpers.includes(name))
      .map(([name]) => name);
    const ids = PARTS.map(part => part.id);
    expect(parts.sort()).toEqual([...ids].sort());
    const samples = sampleParts(origin);
    expect(Object.keys(samples).sort()).toEqual([...ids].sort());
    for (const part of PARTS) {
      expect(part.use.length).toBeLessThanOrEqual(100);
      for (const scheme of ["light", "dark"] as const) {
        const drawn = specimen(samples[part.id], { origin, width: "letter", scheme });
        expect(drawn.startsWith("<!DOCTYPE html>")).toBe(true);
        expect(drawn).not.toMatch(/prefers-color-scheme|undefined/);
      }
    }
  });
  test("every sample is a whole email that keeps to the mail apps' bounds", () => {
    for (const letter of [
      sampleIssue({ origin }),
      sampleMcpIssue({ origin }),
      samplePartnerIssue({ origin }),
      ...Object.values(sampleAccount).map(draw => draw({ origin }))
    ]) {
      expect(letter.html).not.toContain("undefined");
      expect(bytes(letter.html)).toBeLessThan(102 * 1024);
      expect(bare(letter.html)).toEqual([]);
    }
  });
  test("a sample issue's last link is an unsubscribe address, and none says private or public", () => {
    for (const letter of [
      sampleIssue({ origin }),
      sampleMcpIssue({ origin }),
      samplePartnerIssue({ origin })
    ]) {
      expect(hrefs(letter.html).at(-1)).toMatch(
        /^https:\/\/grabient\.test\/unsubscribe\/[0-9a-f]{64}$/
      );
      expect(letter.text).not.toMatch(/\b(private|public)\b/i);
    }
  });
});

describe("partners", () => {
  const theirs = {
    label: "Partner",
    name: "Their <b>thing</b>",
    href: "https://example.com/x",
    about: "What it is.",
    action: "Visit them",
    terms: "We swapped mentions. No money changed hands."
  };
  test("a partner stands on a tile under its label, over what was exchanged, its press quiet", () => {
    const one = promo(theirs)(ctx);
    expect(one.html.html).toMatch(
      /^<table [^>]*data-part="promo"><tr><td class="fill" bgcolor="#[0-9a-f]{6}"/
    );
    expect(one.html.html).not.toContain("<b>thing");
    expect(one.text).toBe(
      "Partner\n\nTheir <b>thing</b>\n\nWhat it is.\n\nVisit them: https://example.com/x\n\nWe swapped mentions. No money changed hands."
    );
    expect(one.html.html).not.toMatch(/class="btn"/);
    expect(() => promo({ ...theirs, terms: " " })(ctx)).toThrow(/A partner's tile says/);
    expect(() => promo({ ...theirs, label: "" })(ctx)).toThrow(/A partner's tile says/);
    const pictured = decode(
      promo({
        ...theirs,
        picture: { src: "https://example.com/shot.png", alt: "Their app", width: 1200, height: 630 }
      })(ctx).html.html
    );
    expect(pictured).toMatch(
      /<a href="https:\/\/example\.com\/x"[^>]*><img class="line" src="https:\/\/example\.com\/shot\.png" alt="Their app" width="494" height="259"/
    );
  });
  test("mentions list several partners on one tile", () => {
    const several = mentions({
      label: "Partners",
      items: [
        { name: "One", href: "https://example.com/1", about: "First." },
        { name: "Two", href: "https://example.com/2", about: "Second." }
      ],
      terms: "Each mentions Grabient too."
    })(ctx);
    expect(hrefs(several.html.html)).toEqual(["https://example.com/1", "https://example.com/2"]);
    expect(several.text).toBe(
      "Partners\n\nOne (https://example.com/1) First.\n\nTwo (https://example.com/2) Second.\n\nEach mentions Grabient too."
    );
  });
  test("a blurb answers to no styles of a partner's and loads nothing of ours but its picture", () => {
    for (const piece of Object.values(sampleBlurbs(origin))) {
      expect(piece.html).not.toMatch(/\b(?:class|data-part)=|<style|<script|@media|url\(/);
      expect(hrefs(piece.html).every(href => href === origin)).toBe(true);
      for (const style of inlineStyles(piece.html)) expect(style).not.toContain("Poppins");
      expect(bare(piece.html)).toEqual([]);
    }
    expect(() => blurb({ origin, size: "card" })).toThrow(/palette an admin liked/);
    expect(
      blurb({ origin, size: "line", href: `${origin}/?ref=them` }).text.endsWith(
        `(${origin}/?ref=them)`
      )
    ).toBe(true);
  });
});
