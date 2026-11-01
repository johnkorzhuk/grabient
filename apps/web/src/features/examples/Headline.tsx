import { gradientCss } from "@grabient/engine/css.ts";
import { DEFAULT_STEPS, isSwatchStyle } from "@grabient/engine/view.ts";
import { locale, msg, rich } from "@grabient/i18n";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { paletteName } from "../../lib/page-meta.ts";
import { EffectArt } from "../editor/EffectArt.tsx";
import { inkThrough, LARGE, lettersTheme, TILE, tileFor } from "./fit.ts";
import styles from "./Headline.module.css";
import { LOOKS, pickFitting, type Taken } from "./looks.ts";
import { drawnColors, groundOn, type Shown, type Theme } from "./paint.ts";
import { gradientOf, inForm, PLAIN_ANGLES, plainAt } from "./shared.ts";

/* Headlines in the palette, as tiles of the cards' grid (Cards.tsx), each shown only where the palette works for it
   (fit.ts):
   - its name inside the letters (background-clip: text), on a page of the theme in which every one of its colors reads
     as large words (lettersTheme), whatever theme the reader's page is in; in a look the seed picks of those that work
     (looks.ts), else as its gradient at the first plain angle where one does;
   - words marked with the palette, which those words read on in white or black as large words (inkThrough at 3:1), on
     the paper the marker stands out from more, the palette running along the words as a gradient or bands, whichever
     the seed picks of those that read.
   The name's rows are balanced here for the tile's width, one set for a wide tile and one for a narrow one, at the size
   that fits them in the room they have, so the server's page shows the very rows the browser does. An effect shows its
   still at rest (EffectArt) and plays while the tile is lit, blended through the letters: the heading in white on black
   multiplied with the picture under it keeps the picture in the letters and black around them, which the page's dark
   paper lightens away (on a light page black on white, screened, and darkened onto its paper), as background-clip can
   clip no canvas. A blob with no ground of its own is given the palette's color that stands out most from the page. */

/** The marked heading: the tag around the words the palette marks. */
const MARKED = msg("Say it in <m>color</m>");
/** A tile's shape, its width over its height, as Headline.module.css lays its words: a wide one's from 600 px across. */
const ASPECT = { wide: 12 / 5, narrow: 3 / 2 } as const;
/** A tile's padding on every side, in hundredths of its width. */
const PAD = 6;
/** The widest a row of the name may be, in em, before it takes another, in a wide tile and a narrow one. */
const ROW_EM = { wide: 13, narrow: 8 } as const;
/** The most rows a heading takes. */
const MOST_ROWS = 4;
/** A heading's line height and its padding above and below, in em (Headline.module.css). */
const LINE = 1.04;
const LEAD = 0.2;

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

/** The room a heading has in a tile of a shape, in hundredths of its width: across and up and down inside its
    padding. */
const ACROSS = 100 - 2 * PAD;
const upDown = (aspect: number) => 100 / aspect - 2 * PAD;

/** The palette with a blob's ground set: the one its look names, else `ground`. */
function withGround(s: Shown, ground: string | null): Shown {
  const effect = s.effect;
  if (effect?.kind !== "blob" || effect.look.bg || !ground) return s;
  return { ...s, effect: { ...effect, look: { ...effect.look, bg: ground } } };
}

/** The palette inside the letters: the page's theme in which every color reads as large words, and the ground a blob
    with none is given there (the palette's color that stands out most from that page). Null where no theme's page holds
    them all. */
interface Letters {
  theme: Theme;
  ground: string | null;
}
function lettersOf(s: Shown): Letters | null {
  const colors = drawnColors(s);
  const effect = s.effect;
  const own = effect?.kind === "blob" ? effect.look.bg?.slice(0, 7) : undefined;
  const theme = lettersTheme(own ? [...colors, own] : colors);
  if (!theme) return null;
  const bare = effect?.kind === "blob" && !own;
  return { theme, ground: bare ? groundOn(TILE[theme], colors) : null };
}
/** The palette as the letters draw it: in the look given where they work there, else as its gradient at its angle,
    else at the first plain angle where they do; none where they work in none. */
const lettersShown = (s: Shown): Shown | undefined =>
  [s, inForm(s, "gradient"), ...PLAIN_ANGLES.map(angle => plainAt(s, angle))].find(
    form => lettersOf(form) !== null
  );

/** The palette along words, as a marker and a rule draw it: a gradient, or bands where the look is bands, from left to
    right (the look's own where it runs so); an effect's palette as its gradient. */
function alongWords(s: Shown): Shown {
  if (!s.effect && s.view.style.startsWith("linear") && s.view.angle === 90) return s;
  const bands = !s.effect && isSwatchStyle(s.view.style);
  return {
    seed: s.seed,
    palette: s.palette,
    effect: null,
    view: {
      style: bands ? "linearSwatches" : "linearGradient",
      steps: s.effect ? Math.max(DEFAULT_STEPS, s.palette.anchors.length) : s.view.steps,
      angle: 90
    }
  };
}
/** The paper a picture of the palette stands on with no words on it: the theme whose paper its colors stand out from
    more. */
const paperUnder = (colors: readonly string[]): Theme => tileFor(colors, 0) ?? "dark";

/** Words marked with the palette: the ink that reads on every one of its colors as large words, with the least contrast
    it has there, on the paper the marker stands out from more. Null where neither white nor black reads. */
interface Mark {
  theme: Theme;
  ink: string;
  ratio: number;
}
function markOf(s: Shown): Mark | null {
  const colors = drawnColors(s);
  const read = inkThrough(colors, LARGE);
  return read && { theme: paperUnder(colors), ...read };
}

/** The headlines a palette's tiles show, each with the palette as it draws it: the letters in a look the seed picks of
    those they work in, else as the palette's gradient at the first plain angle where they do; the words marked along a
    gradient or bands, whichever the seed picks of those the words read on; none where it works in none. The looks they
    take count in `taken`. */
export type HeadlineKind = "letters" | "mark";
export function headlinesOf(base: Shown, taken: Taken): { kind: HeadlineKind; shown: Shown }[] {
  const { seed, palette } = base;
  const letters =
    pickFitting(seed, palette, "letters", LOOKS, s => lettersOf(s) !== null, taken) ??
    PLAIN_ANGLES.map(angle => plainAt(base, angle)).find(s => lettersOf(s) !== null);
  const mark = pickFitting(
    seed,
    palette,
    "mark",
    ["gradient", "bands"],
    s => markOf(alongWords(s)) !== null,
    taken
  );
  return [
    ...(letters ? [{ kind: "letters" as const, shown: letters }] : []),
    ...(mark ? [{ kind: "mark" as const, shown: alongWords(mark) }] : [])
  ];
}

/** The name's rows: its pieces, each marked where a row of the wide layout or the narrow one starts (the other
    layout's breaks hidden, Headline.module.css), and the custom properties its size is told by: its room across and up
    and down in each shape of tile, and each layout's rows and widest row. Data only: the heading draws its breaks
    itself, once, so the server's markup and the browser's hold the same elements. */
function headingOf(name: string) {
  const pieces = piecesOf(name);
  const wide = rowsOf(pieces, ROW_EM.wide);
  const narrow = rowsOf(pieces, ROW_EM.narrow);
  return {
    style: {
      "--across": String(ACROSS),
      "--high-wide": String(Math.round(upDown(ASPECT.wide) * 100) / 100),
      "--high-narrow": String(Math.round(upDown(ASPECT.narrow) * 100) / 100),
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

/** A headline as a tile of the cards' grid, filling it: the palette's name inside its letters, or words marked with
    the palette. An effect plays in the letters while the tile is lit. */
export function HeadlineTile(props: { kind: HeadlineKind; s: Shown; lit: () => boolean }) {
  /* the palette's own name, as the page's title and its hero say it, whatever look the letters show */
  const name = () => paletteName(props.s.palette);
  return (
    <Switch>
      <Match when={props.kind === "letters" && lettersShown(props.s)}>
        {shown => (
          <Show when={lettersOf(shown())}>
            {l => {
              const heading = createMemo(() => headingOf(name()));
              /* a line of the effect's colors, standing in while its still is drawn */
              const rest = () =>
                gradientCss(drawnColors(shown()), "linearGradient", shown().view.angle);
              return (
                /* a page of the theme the letters' colors read in, whatever the reader's */
                <div class={`${styles.panel} ${styles.page}`} data-theme={l().theme}>
                  <Show
                    when={shown().effect}
                    fallback={
                      /* the clip inline, as a gradient's text clip is written */
                      <h3
                        class={`${styles.name} ${styles.letters}`}
                        style={{
                          "-webkit-background-clip": "text",
                          "background-clip": "text",
                          "--paint": gradientOf(shown()),
                          ...heading().style
                        }}
                      >
                        <Rows pieces={heading().pieces} />
                      </h3>
                    }
                  >
                    {effect => {
                      const ground = () => withGround(shown(), l().ground);
                      return (
                        /* the effect's picture under the heading, which cuts it to the letters */
                        <div class={styles.blend}>
                          <span class={styles.art} style={{ "--rest": rest() }} aria-hidden="true">
                            <EffectArt
                              kind={effect().kind}
                              palette={ground().palette}
                              settings={ground().effect ?? effect()}
                              angle={ground().view.angle}
                              active={props.lit()}
                            />
                          </span>
                          <h3 class={`${styles.name} ${styles.cut}`} style={heading().style}>
                            <Rows pieces={heading().pieces} />
                          </h3>
                        </div>
                      );
                    }}
                  </Show>
                </div>
              );
            }}
          </Show>
        )}
      </Match>
      <Match when={props.kind === "mark" && markOf(alongWords(props.s))}>
        {m => (
          /* words in the page's ink, the palette marking some of them in the ink that reads on it */
          <div class={`${styles.panel} ${styles.page}`} data-theme={m().theme}>
            <h3 class={styles.marked}>
              {rich(MARKED, {
                m: words => (
                  <mark
                    class={styles.marker}
                    style={{ background: gradientOf(alongWords(props.s)), color: m().ink }}
                  >
                    {words}
                  </mark>
                )
              })}
            </h3>
          </div>
        )}
      </Match>
    </Switch>
  );
}
