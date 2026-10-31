import { contrast, luminance } from "@grabient/engine/contrast.ts";
import { gradientCss } from "@grabient/engine/css.ts";
import { dir, locale, rich, t } from "@grabient/i18n";
import type { CodeTab } from "@grabient/ui/CodeTabs.tsx";
import hidden from "@grabient/ui/hidden.module.css";
import { createMemo, createSignal, type Element, For, Show } from "solid-js";
import { paletteName } from "../../lib/page-meta.ts";
import { EffectArt } from "../editor/EffectArt.tsx";
import frame from "./Example.module.css";
import { Chip, contrastWords, Example, type ExampleProps } from "./Example.tsx";
import { inkThrough, LARGE, lettersTheme, TEXT, TILE } from "./fit.ts";
import styles from "./Headline.module.css";
import {
  colorsUnder,
  drawnColors,
  groundOn,
  inkOn,
  mirrored,
  type Part,
  type Shown,
  type Theme
} from "./paint.ts";
import {
  backgroundCode,
  cssRule,
  drawnWords,
  gradientOf,
  inForm,
  levelWords,
  PLAIN_ANGLES,
  pictureAddress,
  plainAt
} from "./shared.ts";

/* A landing page's heading in the palette, its words the palette's name in the reader's language, set two ways, each
   shown only where the palette works for it (fit.ts):
   - the palette inside the letters (background-clip: text), on a page of the theme in which every one of its colors
     reads as large words (lettersTheme), whatever theme the reader's page is in;
   - the palette as a banner behind the words, which take white or black, whichever reads on every color under them
     (inkThrough). A gradient's words stand across the banner's middle, else at its start or end, its top or foot, or
     in a corner: at the first of these where an ink reads at 4.5:1, as words must, else at the first where one reads
     at 3:1, as large words must, and among each kind where it reads best. So where the palette runs from dark to
     light, the words stand over the part where one ink reads. An effect's words stand across its middle and read on
     all its colors: the glass bends them across its ribs as its shape draws them, and a blob spreads them everywhere.
   Where neither works, the page leaves the example out. Both draw the palette as the address names it: a gradient at its
   angle, bands as hard stripes, the cone and the circle from the middle. Each heading's rows are balanced here for the
   panel's width, one set for a wide panel and one for a narrow one, at the size that fits them in the room they have,
   so the server's page shows the very rows the browser does. An effect shows its still at rest (the cards' EffectArt:
   the one the head's style paints where it is the hero's, a line of its colors standing in while another is drawn)
   and plays under the pointer, its player's first frame the still, so nothing jumps. Behind the banner's words it is
   the banner's picture. Inside the letters it is blended through them: the heading in white on black multiplied with
   the picture under it keeps the picture in the letters and black around them, which the page's dark paper lightens
   away (on a light page black on white, screened, and darkened onto its paper), as background-clip can clip no
   canvas. The code gives the still as a PNG, the cheapest picture to paint behind words. A blob with no ground of its
   own would leave its letters and its banner clear where no blob is: it is given the palette's color that stands out
   most from the letters' page, and on the banner the one the words read best on, which the tag's dashed edge and a
   chip say. */

/** The CSS that keeps a background to the letters. */
const CLIP = "background-clip: text";
/** The stills the code gives an effect: the letters' as wide as a heading is, the banner's in its shape, each within a
    PNG's 3 million pixels. */
const STILL = { letters: { width: 1600, height: 600 }, banner: { width: 1800, height: 750 } };
/** A panel's shape, its width over its height, as Headline.module.css draws it: a wide one's from 600 px across. */
const ASPECT = { wide: 12 / 5, narrow: 3 / 2 } as const;
/** A panel's padding on every side, in hundredths of its width. */
const PAD = 6;
/** The share of the panel's width inside its padding that words standing at its start or end take at most. */
const SIDE = 0.6;
/** The widest a row of a heading may be, in em, before it takes another: where the words take the panel's width and
    where they take a side, in a wide panel and in a narrow one. */
const ROW_EM = { whole: { wide: 13, narrow: 8 }, side: { wide: 8, narrow: 5 } } as const;
/** The most rows a heading takes. */
const MOST_ROWS = 4;
/** A heading's line height and its padding above and below, in em (Headline.module.css). */
const LINE = 1.04;
const LEAD = 0.2;

/** The tag a message marks a hex with: `rich("… <c>{color}</c>", MONO)`. */
const MONO = {
  c: (words: (string | Element)[]) => (
    <span class={styles.mono} dir="ltr">
      {words}
    </span>
  )
};

/* The kinds of characters a row's width is told by, in em of the heading's face (Poppins bold, its letters drawn a
   little closer): marks and format characters take none; an ideograph, a kana, a hangul syllable or their punctuation
   a whole em; the letters of scripts Poppins has none of are set in the system's face, wider. Near enough to fit the
   rows to the panel; a row that comes out wider wraps. */
const NONE = /[\p{M}\p{Cf}]/u;
const NARROW = /[.,:;'’!|()[\]·ijlrtfI]/u;
const FULL =
  /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}]/u;
const SYSTEM = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Arabic}\p{Script=Thai}]/u;
const WIDE = /[mwMW]/u;
const SPACE = 0.27;
/** The languages whose pages set every word in the system's face (base.css), wider than Poppins. */
const SYSTEM_FACE = new Set(["vi"]);
/** A row's width in em. */
function widthOf(text: string): number {
  let em = 0;
  for (const c of text) {
    if (NONE.test(c)) continue;
    const upper = c !== c.toLowerCase();
    em +=
      c === " "
        ? SPACE
        : NARROW.test(c)
          ? 0.33
          : FULL.test(c)
            ? 1
            : SYSTEM.test(c)
              ? upper
                ? 0.8
                : 0.7
              : WIDE.test(c)
                ? 0.9
                : upper
                  ? 0.68
                  : 0.58;
  }
  return SYSTEM_FACE.has(locale()) ? em * 1.18 : em;
}

/** A heading's words in pieces, each ending where the next row may start: after a space, an ideographic comma or a
    middle dot. */
const piecesOf = (name: string): string[] => name.split(/(?<=[ 、·])/u).filter(Boolean);

/** A heading's rows where none may be wider than `most` em: the pieces they start at, how many they are, and the widest
    one in em, padded for the size that fits it to its room. The fewest rows that keep under `most`, at most MOST_ROWS,
    cut where the widest is least wide. */
interface Rows {
  at: number[];
  rows: number;
  em: number;
}
function rowsOf(pieces: readonly string[], most: number): Rows {
  /* the width of the pieces before each, and a row's from it, less the space a row ending there leaves out */
  const before = [0];
  for (const piece of pieces) before.push(before[before.length - 1] + widthOf(piece));
  const rowEm = (from: number, to: number) =>
    before[to] - before[from] - (pieces[to - 1]?.endsWith(" ") ? SPACE : 0);
  /* the cuts into `count` rows that keep the widest least wide */
  const cut = (count: number) => {
    let best = { at: [] as number[], em: Number.POSITIVE_INFINITY };
    const walk = (from: number, left: number, at: number[], widest: number) => {
      if (left === 1) {
        const em = Math.max(widest, rowEm(from, pieces.length));
        if (em < best.em) best = { at, em };
        return;
      }
      for (let next = from + 1; next <= pieces.length - left + 1; next++)
        walk(next, left - 1, [...at, next], Math.max(widest, rowEm(from, next)));
    };
    walk(0, count, [], 0);
    return best;
  };
  let rows = cut(1);
  for (let count = 2; rows.em > most && count <= Math.min(MOST_ROWS, pieces.length); count++) {
    const next = cut(count);
    if (next.em < rows.em) rows = next;
  }
  return {
    at: rows.at,
    rows: rows.at.length + 1,
    em: Math.round((rows.em * 1.08 + 0.2) * 100) / 100
  };
}

/** Where words stand in a panel, along each of its axes. */
type Place = "start" | "center" | "end";
/** The banner's places for its words, [block, inline], in the order they are tried: its middle; its start or end; its
    top or foot; its corners. */
const PLACES: readonly (readonly (readonly [Place, Place])[])[] = [
  [["center", "center"]],
  [
    ["center", "start"],
    ["center", "end"]
  ],
  [
    ["start", "center"],
    ["end", "center"]
  ],
  [
    ["start", "start"],
    ["start", "end"],
    ["end", "start"],
    ["end", "end"]
  ]
];

/** The part of a panel words placed so may cover: inside its padding across, a side's share of it at its start or
    end; its whole height, or the half at its top or foot. A right-to-left page starts at the right. */
function partOf(block: Place, inline: Place): Part {
  const pad = PAD / 100;
  const side = pad + SIDE * (1 - 2 * pad);
  const [x0, x1] =
    inline === "start" ? [pad, side] : inline === "end" ? [1 - side, 1 - pad] : [pad, 1 - pad];
  const [y0, y1] = block === "start" ? [0, 0.5] : block === "end" ? [0.5, 1] : [0, 1];
  const part = { x0, y0, x1, y1 };
  return dir() === "rtl" ? mirrored(part) : part;
}

/** The room a heading has in a panel of a shape, in hundredths of the panel's width: across, inside its padding or a
    side's share of that; up and down, its height inside its padding or the half it stands in. */
const across = (inline: Place) => (inline === "center" ? 1 : SIDE) * (100 - 2 * PAD);
const upDown = (aspect: number, block: Place) =>
  block === "center" ? 100 / aspect - 2 * PAD : 50 / aspect - PAD;

/** The palette with a blob's ground set: the one its address names, else `ground`. */
function withGround(s: Shown, ground: string | null): Shown {
  const effect = s.effect;
  if (effect?.kind !== "blob" || effect.look.bg || !ground) return s;
  return { ...s, effect: { ...effect, look: { ...effect.look, bg: ground } } };
}

/** The palette inside the letters: the page's theme in which every color reads as large words, the ground a blob with
    none is given there (the palette's color that stands out most from that page), and the faintest color with the
    contrast it has there. Null where no theme's page holds them all. */
interface Letters {
  theme: Theme;
  ground: string | null;
  faint: { color: string; ratio: number };
}
function lettersOf(s: Shown): Letters | null {
  const colors = drawnColors(s);
  const effect = s.effect;
  const own = effect?.kind === "blob" ? effect.look.bg?.slice(0, 7) : undefined;
  const inside = own ? [...colors, own] : colors;
  const theme = lettersTheme(inside);
  if (!theme) return null;
  const paper = TILE[theme];
  const faint = inside.reduce(
    (least, color) => {
      const ratio = contrast(color, paper);
      return ratio < least.ratio ? { color, ratio } : least;
    },
    { color: paper, ratio: Number.POSITIVE_INFINITY }
  );
  const bare = effect?.kind === "blob" && !own;
  return { theme, ground: bare ? groundOn(paper, colors) : null, faint };
}

/** The palette as a banner behind the words: where they stand, their ink and the least contrast it has on the colors
    under them, read for a wide panel's shape and a narrow one's alike, and the ground a blob with none is given there
    (the palette's darkest color under white words, its lightest under black). Null where no place holds one ink. */
interface Banner {
  block: Place;
  inline: Place;
  ink: string;
  ratio: number;
  ground: string | null;
}
function bannerOf(s: Shown): Banner | null {
  const effect = s.effect;
  if (effect) {
    /* An effect has no part that holds only some of its colors: the glass bends them across its ribs as its shape
       draws them, wherever a line of them would put them, and a blob spreads them all over its ground. Its words
       stand across its middle, and read on every one of its colors, its ground among them. */
    const colors = drawnColors(s);
    const own = effect.kind === "blob" ? effect.look.bg?.slice(0, 7) : undefined;
    const read = inkThrough(own ? [...colors, own] : colors, LARGE);
    if (!read) return null;
    const byLight = [...colors].sort((a, b) => luminance(a) - luminance(b));
    const bare = effect.kind === "blob" && !own;
    const ground = read.ink === "#ffffff" ? byLight[0] : byLight[byLight.length - 1];
    return { block: "center", inline: "center", ...read, ground: bare ? ground : null };
  }
  /* each place's ink on the colors under it, in both shapes of panel */
  const reads = PLACES.map(places =>
    places.map(([block, inline]) => {
      const part = partOf(block, inline);
      const under = new Set([ASPECT.wide, ASPECT.narrow].flatMap(a => colorsUnder(s, part, a)));
      return { block, inline, ...inkOn([...under]), ground: null };
    })
  );
  /* the first kind of place where the ink reads as words must, else as large words must; there, where it reads best */
  for (const need of [TEXT, LARGE])
    for (const places of reads) {
      const best = places.reduce<Banner | null>(
        (best, read) => (read.ratio >= need && read.ratio > (best?.ratio ?? 0) ? read : best),
        null
      );
      if (best) return best;
    }
  return null;
}

/** Whether a heading works on the palette in a form: inside the letters, or behind words in white or black. */
const works = (s: Shown): boolean => lettersOf(s) !== null || bannerOf(s) !== null;
/** Whether the palette suits this example, decided on its plain gradient at the angles a part tries, so its page holds
    the headline in every style; where it suits none, the page leaves the example out. */
export const headlineFits = (s: ExampleProps["s"]): boolean =>
  PLAIN_ANGLES.some(angle => works(plainAt(s, angle)));
/** The palette as the headings draw it: in the address's form where one of them works there, else as its gradient at
    the address's angle, else at the first plain angle where one works. */
const headlineShown = (s: Shown): Shown =>
  [s, inForm(s, "gradient"), ...PLAIN_ANGLES.map(angle => plainAt(s, angle))].find(works) ?? s;

/** A heading's rows for where it stands: its pieces, each marked where a row of the wide layout or the narrow one
    starts (the other layout's breaks hidden, Headline.module.css), and the custom properties its size is told by: its
    room across and up and down in each shape of panel, and each layout's rows and widest row. Data only: the heading
    draws its breaks itself, once, so the server's markup and the browser's hold the same elements. */
function headingOf(name: string, block: Place, inline: Place) {
  const pieces = piecesOf(name);
  const most = inline === "center" ? ROW_EM.whole : ROW_EM.side;
  const wide = rowsOf(pieces, most.wide);
  const narrow = rowsOf(pieces, most.narrow);
  return {
    style: {
      "--across": String(across(inline)),
      "--high-wide": String(Math.round(upDown(ASPECT.wide, block) * 100) / 100),
      "--high-narrow": String(Math.round(upDown(ASPECT.narrow, block) * 100) / 100),
      "--em-wide": String(wide.em),
      "--rows-wide": String(wide.rows * LINE + LEAD),
      "--em-narrow": String(narrow.em),
      "--rows-narrow": String(narrow.rows * LINE + LEAD)
    },
    pieces: pieces.map((text, i) => ({
      text,
      wide: wide.at.includes(i),
      narrow: narrow.at.includes(i)
    }))
  };
}

/** A heading's words, a break before each piece that starts a row of either layout. */
function Rows(props: { pieces: { text: string; wide: boolean; narrow: boolean }[] }) {
  return (
    <For each={props.pieces} keyed={false}>
      {piece => (
        <>
          <Show when={piece().wide || piece().narrow}>
            <br
              data-wide={piece().wide ? "" : undefined}
              data-narrow={piece().narrow ? "" : undefined}
            />
          </Show>
          {piece().text}
        </>
      )}
    </For>
  );
}

/** A contrast the stage measures, as a chip: a coin of the color it is told by, the ratio and WCAG's level, said whole
    to a reader who listens. */
function Reach(props: { color: string; ratio: number; words: string }) {
  return (
    <Chip color={props.color}>
      <span class={frame.ratio} aria-hidden="true" dir="ltr">
        {contrastWords(props.ratio)}
      </span>
      <span aria-hidden="true">{levelWords(props.ratio)}</span>
      <span class={hidden.text}>{props.words}</span>
    </Chip>
  );
}

const escaped = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
/** A CSS value as one of Tailwind's arbitrary values writes it: no spaces after commas, the rest as underscores. */
const arbitrary = (value: string) => value.replace(/,\s+/g, ",").replace(/\s+/g, "_");

/** One heading's code: its rule, its markup and the same in Tailwind's classes. */
interface Code {
  css: string;
  html: string;
  tailwind: string;
}

export function HeadlineExample(props: ExampleProps) {
  /* the palette as the headings draw it; its name the address's */
  const shown = createMemo(() => headlineShown(props.s));
  const s = () => shown();
  const name = () => paletteName(props.s.palette, props.s.view);
  /* the checks, each read by the stage, its chips and its code */
  const letters = createMemo(() => lettersOf(s()));
  const banner = createMemo(() => bannerOf(s()));
  /* the grounds a blob with none is given, each named once */
  const grounds = () => [
    ...new Set([letters()?.ground, banner()?.ground].filter((g): g is string => Boolean(g)))
  ];

  /* the caption's chips, made once: the frame reads its notes twice, and markup made a second time would find no
     server markup to take over */
  const notes = (
    <>
      <Show when={letters()}>
        {l => (
          <Reach
            color={l().faint.color}
            ratio={l().faint.ratio}
            words={t("The letters' least contrast with their page: {ratio}, {level}.", {
              ratio: contrastWords(l().faint.ratio),
              level: levelWords(l().faint.ratio)
            })}
          />
        )}
      </Show>
      <Show when={banner()}>
        {b => (
          <Reach
            color={b().ink}
            ratio={b().ratio}
            words={t("The words' least contrast with the banner: {ratio}, {level}.", {
              ratio: contrastWords(b().ratio),
              level: levelWords(b().ratio)
            })}
          />
        )}
      </Show>
      <For each={grounds()}>
        {ground => (
          <Chip color={ground}>
            <span>{rich("Background <c>{color}</c>", MONO, { color: ground })}</span>
          </Chip>
        )}
      </For>
    </>
  );

  /* each heading plays its effect while the pointer is on it */
  const [litLetters, setLitLetters] = createSignal(false);
  const [litBanner, setLitBanner] = createSignal(false);
  /* a line of the effect's colors, standing in while its still is drawn */
  const rest = () => gradientCss(drawnColors(s()), "linearGradient", s().view.angle);
  /* an effect's picture filling its holder: its still, playing while lit */
  const art = (shown: Shown, lit: () => boolean) => (
    <Show when={shown.effect}>
      {effect => (
        <span class={styles.art} style={{ "--rest": rest() }} aria-hidden="true">
          <EffectArt
            kind={effect().kind}
            palette={shown.palette}
            settings={effect()}
            angle={shown.view.angle}
            active={lit()}
          />
        </span>
      )}
    </Show>
  );

  /* the code, the stage's own: the gradient, or the effect's still as a PNG on the ground a blob is given there (its
     address names that ground, so the picture is the heading's own) */
  const background = (shown: Shown, size: { width: number; height: number }) => {
    const address = shown.effect && pictureAddress(shown, props.origin, "png", size);
    const css = address
      ? `background: url("${address}") 50% 50% / cover no-repeat;`
      : backgroundCode(shown, props.origin);
    const classes = address
      ? [`bg-[url('${address}')]`, "bg-cover", "bg-center", "bg-no-repeat"]
      : [`bg-[${arbitrary(css.replace(/^background: /, "").replace(/;$/, ""))}]`];
    return { css, classes: classes.join(" ") };
  };
  const lettersCode = (l: Letters): Code => {
    const paint = background(withGround(s(), l.ground), STILL.letters);
    return {
      css: cssRule(".headline", [
        "width: fit-content;",
        paint.css,
        "-webkit-background-clip: text;",
        `${CLIP};`,
        "color: transparent;"
      ]),
      html: `<h1 class="headline">${escaped(name())}</h1>`,
      tailwind: `<h1 class="w-fit ${paint.classes} bg-clip-text text-transparent">${escaped(name())}</h1>`
    };
  };
  const bannerCode = (b: Banner): Code => {
    const paint = background(withGround(s(), b.ground), STILL.banner);
    const side = b.inline !== "center";
    const place =
      b.block === b.inline
        ? `place-items-${b.block}`
        : `items-${b.block} justify-items-${b.inline}`;
    return {
      css: [
        cssRule(".banner", [
          "display: grid;",
          `place-items: ${b.block === b.inline ? b.block : `${b.block} ${b.inline}`};`,
          "aspect-ratio: 12 / 5;",
          `padding: ${PAD}%;`,
          paint.css,
          `color: ${b.ink};`
        ]),
        cssRule(".banner h1", [
          ...(side ? [`max-width: ${SIDE * 100}%;`] : []),
          `text-align: ${b.inline};`
        ])
      ].join("\n"),
      html: ['<header class="banner">', `  <h1>${escaped(name())}</h1>`, "</header>"].join("\n"),
      tailwind: [
        `<header class="grid aspect-[12/5] ${place} p-[${PAD}%] ${paint.classes} ${b.ink === "#ffffff" ? "text-white" : "text-black"}">`,
        `  <h1 class="${side ? `max-w-[${SIDE * 100}%] ` : ""}text-${b.inline}">${escaped(name())}</h1>`,
        "</header>"
      ].join("\n")
    };
  };
  const code = (): CodeTab[] => {
    const l = letters();
    const b = banner();
    const parts = [...(l ? [lettersCode(l)] : []), ...(b ? [bannerCode(b)] : [])];
    return [
      { label: "CSS", code: parts.map(p => p.css).join("\n\n") },
      { label: "HTML", code: parts.map(p => p.html).join("\n\n") },
      { label: "Tailwind", code: parts.map(p => p.tailwind).join("\n\n") }
    ];
  };

  return (
    <Example
      id="headline"
      n={props.n}
      title={t("Headlines")}
      about={t("For landing pages, slides and posters.")}
      drawn={drawnWords(s())}
      differs={s() !== props.s || grounds().length > 0}
      notes={notes}
      code={code()}
      codeLabel={t("The headline's code")}
    >
      <div class={styles.stage}>
        <Show when={letters()}>
          {l => {
            const heading = () => headingOf(name(), "center", "center");
            return (
              <div class={styles.slot}>
                {/* a page of the theme the letters' colors read in, whatever the reader's */}
                <div
                  class={`${styles.panel} ${styles.page}`}
                  data-theme={l().theme}
                  onPointerEnter={() => setLitLetters(true)}
                  onPointerLeave={() => setLitLetters(false)}
                >
                  <Show
                    when={s().effect}
                    fallback={
                      /* the clip inline, as a gradient's text clip is written */
                      <h3
                        class={`${styles.name} ${styles.letters}`}
                        style={{
                          "-webkit-background-clip": "text",
                          "background-clip": "text",
                          "--paint": gradientOf(s()),
                          ...heading().style
                        }}
                      >
                        <Rows pieces={heading().pieces} />
                      </h3>
                    }
                  >
                    {/* the effect's picture under the heading, which cuts it to the letters */}
                    <div class={styles.blend}>
                      {art(withGround(s(), l().ground), litLetters)}
                      <h3 class={`${styles.name} ${styles.cut}`} style={heading().style}>
                        <Rows pieces={heading().pieces} />
                      </h3>
                    </div>
                  </Show>
                </div>
              </div>
            );
          }}
        </Show>
        <Show when={banner()}>
          {b => {
            const heading = () => headingOf(name(), b().block, b().inline);
            return (
              <div class={styles.slot}>
                <div
                  class={`${styles.panel} ${styles.banner}`}
                  style={{
                    "--paint": s().effect ? undefined : gradientOf(s()),
                    color: b().ink,
                    "place-items": `${b().block} ${b().inline}`,
                    "text-align": b().inline
                  }}
                  onPointerEnter={() => setLitBanner(true)}
                  onPointerLeave={() => setLitBanner(false)}
                >
                  {art(withGround(s(), b().ground), litBanner)}
                  <h3 class={styles.name} style={heading().style}>
                    <Rows pieces={heading().pieces} />
                  </h3>
                </div>
              </div>
            );
          }}
        </Show>
      </div>
    </Example>
  );
}
