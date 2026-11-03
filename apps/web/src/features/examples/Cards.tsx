import { contrast } from "@grabient/engine/contrast.ts";
import { gradientCss } from "@grabient/engine/css.ts";
import { EFFECTS } from "@grabient/engine/effect.ts";
import { dir, formatDate, formatNumber, msg, rich, t } from "@grabient/i18n";
import { announce } from "@grabient/ui/announce.ts";
import { createDone } from "@grabient/ui/done.ts";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createMemo, createSignal, type Element, For, Show, untrack } from "solid-js";
import styles from "./Cards.module.css";
import { Chip, Example, type ExampleProps, Painted } from "./Example.tsx";
import { inkThrough, MARK, type Press, pressPaper, standsOut, TEXT, TILE } from "./fit.ts";
import { frostOn } from "./frost.ts";
import { HeadlineTile, headlinesOf } from "./Headline.tsx";
import { createLit } from "./lit.ts";
import { inLook, LOOKS, type Look, lookOf, pickLook, type Taken } from "./looks.ts";
import {
  colorsUnder,
  drawnColors,
  inkOn,
  mirrored,
  type Part,
  type Shown,
  type Theme
} from "./paint.ts";
import { formWords, gradientOf, solidBlob } from "./shared.ts";

/* Covers and cards: the palette as the media and the small things a designer makes with it, laid as a masonry of real
   shapes and sizes: a poster, an album's sleeve, a video's thumbnail, a frosted widget, a social post, an event's
   card, a ticket, a membership card, an app's icon, a business card and a pair of buttons. Each wears the palette in a
   look of its own, which the seed picks of the looks the tile is a good fit for (looks.ts, and FITS here: its words
   read on the picture, its play button stands out), the tiles taking turns so the grid shows the palette's range; an
   effect shows its still, playing once the pointer rests on its tile or the keyboard's focus is in it, and a press on a
   tile turns it to its next look. Words stand on the palette only where the checks let them (fit.ts): in the ink that
   reads on every color under them, else on a band of paper, which takes the theme on whose paper the palette gives a
   press. A blob with no ground of its own stands on its darkest or lightest color, as a picture can't be clear. Each
   tile's name says its look to a reader who listens. */

/** The tiles of the masonry. */
type Kind =
  | "poster"
  | "album"
  | "thumbnail"
  | "post"
  | "event"
  | "ticket"
  | "widget"
  | "member"
  | "icon"
  | "business"
  | "buttons"
  | "letters"
  | "mark";

/** Where each tile stands on a wide stage: its columns of four and its rows, each row a hundredth of the stage's width,
    so the masonry keeps its shapes at any width; and its shape, which it keeps where the tiles stand in columns. */
const PLACES: Readonly<Record<Kind, { col: string; row: string; aspect: number }>> = {
  poster: { col: "1 / span 1", row: "1 / span 36", aspect: 2 / 3 },
  member: { col: "1 / span 1", row: "38 / span 16", aspect: 1.52 },
  album: { col: "2 / span 2", row: "1 / span 24", aspect: 2.06 },
  thumbnail: { col: "2 / span 2", row: "26 / span 28", aspect: 16 / 9 },
  post: { col: "4 / span 1", row: "1 / span 30", aspect: 4 / 5 },
  icon: { col: "4 / span 1", row: "32 / span 22", aspect: 1.1 },
  event: { col: "1 / span 2", row: "55 / span 31", aspect: 1.6 },
  ticket: { col: "3 / span 2", row: "55 / span 18", aspect: 2.75 },
  /* the widget under the ticket, as wide as a home screen's middle widget; the business card and the buttons under
     the event */
  widget: { col: "3 / span 2", row: "74 / span 25", aspect: 1.98 },
  business: { col: "1 / span 1", row: "87 / span 12", aspect: 2 },
  buttons: { col: "2 / span 1", row: "87 / span 12", aspect: 2 },
  /* the headlines under the rest, side by side at 3:2 where both suit the palette (HEADLINE_ALONE where one does) */
  letters: { col: "1 / span 2", row: "100 / span 33", aspect: 1.5 },
  mark: { col: "3 / span 2", row: "100 / span 33", aspect: 1.5 }
};
/** A headline alone under the rest: the stage's width at 12:5, as Headline.tsx lays a wide tile's words. */
const HEADLINE_ALONE = { col: "1 / span 4", row: "100 / span 42", aspect: 1.5 };

const NAMES: Readonly<Record<Kind, string>> = {
  poster: msg("Poster"),
  album: msg("Album cover"),
  thumbnail: msg("Video thumbnail"),
  post: msg("Social post"),
  event: msg("Event card"),
  ticket: msg("Ticket"),
  widget: msg("Widget"),
  member: msg("Membership card"),
  icon: msg("App icon"),
  business: msg("Business card"),
  buttons: msg("Buttons"),
  letters: msg("Headline"),
  mark: msg("Highlighted headline")
};

/** The day every card names, the same on the server and in the browser. */
const DAY = Date.UTC(2026, 10, 12, 19, 30);

/** The tag a message marks a hex with: `rich("… <c>{color}</c>", HEX)`. */
const HEX = { c: (words: (string | Element)[]) => <span dir="ltr">{words}</span> };

/** Where a block of words stands on a picture: at its top or its foot, across it or on its start or end side. */
interface Spot {
  row: "top" | "foot";
  side: "across" | "start" | "end";
}
/** The part of a picture words standing at a spot cover: inside a margin, the upper or lower share of its height, its
    width or a side's share of it; drawn for a left-to-right page and read from the other side in a right-to-left one. */
function partAt(spot: Spot, high: number): Part {
  const [y0, y1] = spot.row === "top" ? [0.05, high] : [1 - high, 0.95];
  const [x0, x1] =
    spot.side === "start" ? [0.08, 0.6] : spot.side === "end" ? [0.4, 0.92] : [0.08, 0.92];
  const part = { x0, y0, x1, y1 };
  return dir() === "rtl" ? mirrored(part) : part;
}
/** The first spot, in the order given, where white or black reads as words must on every color under the words, with
    its ink; null where none, and the words stand on paper. */
function placeWords(s: Shown, aspect: number, high: number, spots: readonly Spot[]) {
  for (const spot of spots) {
    const read = inkThrough(colorsUnder(s, partAt(spot, high), aspect), TEXT);
    if (read) return { ...spot, ...read };
  }
  return null;
}
/** Across first, then on a side: a horizontal blend from dark to light keeps one ink on each half. */
const spotsFrom = (rows: readonly Spot["row"][]): Spot[] =>
  (["across", "start", "end"] as const).flatMap(side => rows.map(row => ({ row, side })));

/** The palette as a picture filling its holder, which the tile's name says to a reader who listens. */
function Picture(props: { s: Shown; lit: boolean; class?: string }) {
  return (
    <span class={`${styles.picture} ${props.class ?? ""}`} aria-hidden="true">
      <Painted s={props.s} lit={props.lit} />
    </span>
  );
}

/** A tile of the masonry: what it shows, lit once the pointer rests on it or while the keyboard's focus is in it. */
function Tile(props: {
  kind: Kind;
  s: Shown;
  /** where it stands, where not where its kind stands (PLACES) */
  place?: { col: string; row: string; aspect: number };
  /** a press on the tile, anywhere but its own presses and links, shows the palette in its next look */
  onTurn?: () => void;
  children: (lit: () => boolean) => Element;
}) {
  const lit = createLit();
  const place = () => props.place ?? PLACES[props.kind];
  /* the tile and the look it shows */
  const name = () => `${t(NAMES[props.kind])}, ${formWords(props.s)}`;
  const content = untrack(() => props.children(lit.on));
  return (
    /* biome-ignore lint/a11y/useSemanticElements: a picture, named for a reader who listens; a fieldset is for a form's
       controls */
    <div
      class={styles.tile}
      data-kind={props.kind}
      role="group"
      aria-label={name()}
      style={{ "--col": place().col, "--row": place().row, "--aspect": String(place().aspect) }}
      onPointerEnter={lit.enter}
      onPointerLeave={lit.leave}
      onFocusIn={lit.focus}
      onFocusOut={lit.blur}
      data-turns={props.onTurn ? "" : undefined}
      tabindex={props.onTurn ? 0 : undefined}
      onClick={e => {
        if (!props.onTurn || (e.target as HTMLElement).closest("button, a, input, label")) return;
        props.onTurn();
      }}
      onKeyDown={e => {
        if (!props.onTurn || e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " "))
          return;
        e.preventDefault();
        props.onTurn();
      }}
    >
      {content}
    </div>
  );
}

/* ---- the tiles ---- */

interface TileProps {
  s: Shown;
  lit: () => boolean;
  /** the paper's theme and the press the palette gives on it */
  theme: Theme;
  press: Press | null;
}

/** A press of the palette's color, or an outline where the palette gives none; for a moment after a press, a check. */
function PressOf(props: { press: Press | null; label: string; class?: string }) {
  const [done, mark] = createDone();
  return (
    <button
      type="button"
      class={`${styles.press} ${props.class ?? ""}`}
      data-outline={props.press ? undefined : ""}
      style={
        props.press
          ? {
              "--fill": props.press.fill,
              "--label": props.press.label,
              "--hover": props.press.hover
            }
          : undefined
      }
      onClick={() => mark(true)}
    >
      <Show when={done()}>
        <Icon name="check" size={14} />
      </Show>
      {props.label}
    </button>
  );
}

/** A poster: the palette full bleed, its words at its foot or its top, across it or on a side, in the ink that reads
    there; else on a band of paper under the picture. */
const POSTER_SPOTS = spotsFrom(["foot", "top"]);
const posterWords = (s: Shown) => placeWords(s, PLACES.poster.aspect, 0.44, POSTER_SPOTS);
function Poster(props: TileProps) {
  const read = createMemo(() => posterWords(props.s));
  const day = () => formatDate(DAY, { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div
      class={styles.poster}
      data-at={read()?.row ?? "under"}
      data-side={read()?.side}
      data-theme={read() ? undefined : props.theme}
      style={{ color: read()?.ink }}
    >
      <Picture s={props.s} lit={props.lit()} />
      <div class={styles.posterWords}>
        <p class={styles.kicker}>{`${t("Live")} · ${day()}`}</p>
        <p class={styles.posterTitle}>{t("Night Market")}</p>
        <p class={styles.venue}>{t("Harbor Hall")}</p>
      </div>
    </div>
  );
}

/** An album: its sleeve the palette, the record half out of it, the record's label the palette again; its title and
    band beside it on the page. */
function Album(props: TileProps) {
  return (
    <div class={styles.album}>
      <div class={styles.record}>
        <Picture s={props.s} lit={props.lit()} class={styles.label} />
      </div>
      <Picture s={props.s} lit={props.lit()} class={styles.sleeve} />
      <div class={styles.track}>
        <p class={styles.trackTitle}>{t("Low Tide")}</p>
        <p class={styles.trackBand}>{t("Glass Harbor")}</p>
      </div>
    </div>
  );
}

/** A video's thumbnail: the palette full bleed, a play button in the ink that stands out from the colors under it as
    a control must (else the press's color), and the video's length on a chip of its own. */
const PLAY: Part = { x0: 0.4, y0: 0.32, x1: 0.6, y1: 0.68 };
const playInk = (s: Shown) => inkOn(colorsUnder(s, PLAY, PLACES.thumbnail.aspect));
function Thumbnail(props: TileProps) {
  const button = createMemo(() => {
    const read = playInk(props.s);
    if (read.ratio >= MARK)
      return { fill: read.ink, glyph: read.ink === "#ffffff" ? "#000000" : "#ffffff" };
    return props.press ? { fill: props.press.fill, glyph: props.press.label } : null;
  });
  const length = () => `${formatNumber(12)}:${formatNumber(4, { minimumIntegerDigits: 2 })}`;
  return (
    <div class={styles.thumbnail}>
      <Picture s={props.s} lit={props.lit()} />
      <Show when={button()}>
        {b => (
          <span class={styles.play} style={{ background: b().fill, color: b().glyph }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
          </span>
        )}
      </Show>
      <span class={styles.length} dir="ltr">
        {length()}
      </span>
    </div>
  );
}

/** A social post: a quote set large on the palette in the ink that reads there, at its top or its foot, across it or
    on a side; else on a band of paper under it. */
const POST_SPOTS = spotsFrom(["top", "foot"]);
const postWords = (s: Shown) => placeWords(s, PLACES.post.aspect, 0.6, POST_SPOTS);
function Post(props: TileProps) {
  const read = createMemo(() => postWords(props.s));
  return (
    <div
      class={styles.post}
      data-at={read()?.row ?? "under"}
      data-side={read()?.side}
      data-theme={read() ? undefined : props.theme}
      style={{ color: read()?.ink }}
    >
      <Picture s={props.s} lit={props.lit()} />
      <div class={styles.postWords}>
        <p class={styles.quote}>{t("Make room for color.")}</p>
        <p class={styles.handle} dir="ltr">
          @mira
        </p>
      </div>
    </div>
  );
}

/** An event's card: its words on the palette along its start where an ink reads on every color under them, in a wide
    column or a narrow one, else under its cover on the paper; its one press works. */
const EVENT_COLUMNS = [0.74, 0.52];
const eventColumn = (s: Shown) =>
  EVENT_COLUMNS.map(x1 => {
    const part = { x0: 0, y0: 0, x1, y1: 1 };
    const read = inkThrough(
      colorsUnder(s, dir() === "rtl" ? mirrored(part) : part, PLACES.event.aspect),
      TEXT
    );
    return read && { ...read, narrow: x1 < EVENT_COLUMNS[0] };
  }).find(Boolean) ?? null;
function Event(props: TileProps) {
  const [saved, setSaved] = createSignal(false);
  const read = createMemo(() => eventColumn(props.s));
  /* on the palette the press takes the words' ink and, as its label, the palette's color that reads best on it where
     one reads as words must, else the other ink; under the cover, the press the palette gives on the paper */
  const press = createMemo((): Press | null => {
    const on = read();
    if (!on) return props.press;
    const best = drawnColors(props.s).reduce((a, b) =>
      contrast(on.ink, b) > contrast(on.ink, a) ? b : a
    );
    const label =
      contrast(on.ink, best) >= TEXT ? best : on.ink === "#ffffff" ? "#000000" : "#ffffff";
    return { fill: on.ink, label, hover: on.ink };
  });
  const date = () =>
    formatDate(DAY, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const time = () => formatDate(DAY, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  return (
    <article
      class={styles.event}
      data-layout={read() ? "on" : "under"}
      data-narrow={read()?.narrow ? "" : undefined}
      data-theme={read() ? undefined : props.theme}
      style={{ color: read()?.ink }}
    >
      <div class={styles.cover}>
        <Picture s={props.s} lit={props.lit()} />
      </div>
      <div class={styles.eventBody}>
        <p class={styles.kicker}>{t("Workshop")}</p>
        <p class={styles.eventTitle}>{t("Color in interfaces")}</p>
        <p class={styles.eventMeta}>
          {`${date()} · ${time()}`}
          <br />
          {t("Online")}
        </p>
        {/* the card's one action works: a seat saved and given back, both its words in one cell */}
        <button
          type="button"
          class={`${styles.press} ${styles.seat}`}
          data-outline={press() ? undefined : ""}
          style={
            press()
              ? { "--fill": press()?.fill, "--label": press()?.label, "--hover": press()?.hover }
              : undefined
          }
          onClick={() => setSaved(!saved())}
        >
          <span data-off={saved() ? "" : undefined}>{t("Save a seat")}</span>
          <span data-off={saved() ? undefined : ""}>
            <Icon name="check" size={14} />
            {t("Seat saved")}
          </span>
        </button>
      </div>
    </article>
  );
}

/** A ticket: its stub the palette, its words on the paper, a perforation between them; on the stub "Admit one" where
    an ink reads there. */
const STUB: Part = { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 };
const stubInk = (s: Shown) => inkThrough(colorsUnder(s, STUB, 1), TEXT);
function Ticket(props: TileProps) {
  const stub = createMemo(() => stubInk(props.s));
  const when = () =>
    formatDate(DAY, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC"
    });
  return (
    <div class={styles.ticket} data-theme={props.theme}>
      <div class={styles.stub} style={{ color: stub()?.ink }}>
        <Picture s={props.s} lit={props.lit()} />
        <Show when={stub()}>
          <span class={styles.admit}>{t("Admit one")}</span>
        </Show>
      </div>
      <div class={styles.ticketBody}>
        <p class={styles.ticketTitle}>{t("Night Market")}</p>
        <p class={styles.ticketLine}>{when()}</p>
        <p class={styles.ticketLine}>
          {t("Gate {gate} · Seat {seat}", { gate: "B", seat: formatNumber(14) })}
        </p>
        <span class={styles.barcode} />
      </div>
    </div>
  );
}

/** A widget: the palette as its scene and a card of frosted glass on it, a tide app's, which holds its mark and the
    day's high tide under the moon that turns it, in the ink that reads on every color the glass can show there, veiled with the palette's own tint
    where that is enough (frost.ts). The card stands on the widget's start side where Cards.module.css's .glass lays
    it: 6% in from the start, 46% wide and 15% in from the top and the foot. */
const CARD: Part = { x0: 0.06, y0: 0.15, x1: 0.52, y1: 0.85 };
/** How far the glass's blur reaches, as a share of the widget's width: three of its standard deviations, 2.5cqi each
    (Cards.module.css's .glass). */
const FROST_REACH = 0.075;
/** The high tide the widget tells, on the day every card names. */
const TIDE = Date.UTC(2026, 10, 12, 16, 12);
function Widget(props: TileProps) {
  const frost = createMemo(() =>
    frostOn(props.s, dir() === "rtl" ? mirrored(CARD) : CARD, PLACES.widget.aspect, FROST_REACH)
  );
  const time = () => formatDate(TIDE, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  return (
    <div class={styles.widget}>
      <Picture s={props.s} lit={props.lit()} />
      <div
        class={styles.glass}
        style={{
          "--ink": frost().ink,
          "--back": frost().ink === "#ffffff" ? "#000000" : "#ffffff",
          "--veil": frost().veil
        }}
      >
        <span class={styles.appMark}>
          <Icon name="moon" size={24} />
        </span>
        <p class={styles.widgetLabel}>{t("High tide")}</p>
        <p class={styles.widgetFigure} style={{ "--chars": String(time().length) }}>
          {time()}
        </p>
      </div>
    </div>
  );
}

/** A membership card: the palette as its face, its words in the ink that reads on every color under them, else on a
    strip of paper at its foot. */
const MEMBER: Part = { x0: 0.06, y0: 0.06, x1: 0.94, y1: 0.94 };
const memberInk = (s: Shown) => inkThrough(colorsUnder(s, MEMBER, PLACES.member.aspect), TEXT);
function Member(props: TileProps) {
  const read = createMemo(() => memberInk(props.s));
  return (
    <div class={styles.member} data-layout={read() ? "on" : "under"} style={{ color: read()?.ink }}>
      <Picture s={props.s} lit={props.lit()} />
      <div class={styles.memberTop}>
        <span class={styles.kicker}>{t("Member")}</span>
        <span class={styles.chipMark} />
      </div>
      <div class={styles.memberFoot} data-theme={read() ? undefined : props.theme}>
        <span class={styles.number} dir="ltr">
          •••• 4821
        </span>
        <span class={styles.holder}>{t("Mira")}</span>
      </div>
    </div>
  );
}

/** An app's icon: the palette in the icon's shape, its glyph in the ink that stands out from the colors under it as a
    control's part must, else none; its name under it on the page. */
const GLYPH: Part = { x0: 0.3, y0: 0.3, x1: 0.7, y1: 0.7 };
const glyphInk = (s: Shown) => inkOn(colorsUnder(s, GLYPH, 1));
function AppIcon(props: TileProps) {
  const glyph = createMemo(() => {
    const read = glyphInk(props.s);
    return read.ratio >= MARK ? read.ink : null;
  });
  return (
    <div class={styles.app}>
      <span class={styles.icon} style={{ color: glyph() ?? undefined }}>
        <Picture s={props.s} lit={props.lit()} />
        <Show when={glyph()}>
          <span class={styles.glyph}>
            <Icon name="sun" size={48} />
          </span>
        </Show>
      </span>
      <span class={styles.appName}>{t("Sunrise")}</span>
    </div>
  );
}

/** A business card: the paper's, the palette as a band along its start, the words on the paper. */
function Business(props: TileProps) {
  return (
    <div class={styles.business} data-theme={props.theme}>
      <Picture s={props.s} lit={props.lit()} class={styles.band} />
      <div class={styles.businessWords}>
        <p class={styles.businessName}>{t("Mira")}</p>
        <p class={styles.businessRole}>{t("Illustrator and type designer")}</p>
        <p class={styles.handle} dir="ltr">
          @mira
        </p>
      </div>
    </div>
  );
}

/** Two buttons on the paper: one filled with the palette where an ink reads on every color under its label (else with
    the press's color), one framed by it where every color stands out from the paper as a control's edge must (else by
    the press's color). Both press. */
const LABEL: Part = { x0: 0.12, y0: 0.2, x1: 0.88, y1: 0.8 };
const labelInk = (s: Shown) => inkThrough(colorsUnder(s, LABEL, 3.4), TEXT);
function Buttons(props: TileProps) {
  const label = () => labelInk(props.s);
  const framed = () => standsOut(drawnColors(props.s), TILE[props.theme], MARK);
  const [started, markStarted] = createDone();
  const [learned, markLearned] = createDone();
  return (
    <div class={styles.buttons} data-theme={props.theme}>
      <Show when={label()} fallback={<PressOf press={props.press} label={t("Get started")} />}>
        {read => (
          <button
            type="button"
            class={`${styles.press} ${styles.painted}`}
            style={{ color: read().ink }}
            onClick={() => markStarted(true)}
          >
            <Picture s={props.s} lit={props.lit()} />
            <span class={styles.pressWords}>
              {t("Get started")}
              <Icon name={started() ? "check" : "arrow"} size={14} />
            </span>
          </button>
        )}
      </Show>
      <button
        type="button"
        class={`${styles.press} ${styles.framed}`}
        style={{
          "--frame": framed()
            ? props.s.effect
              ? gradientCss(drawnColors(props.s), "linearGradient", props.s.view.angle)
              : gradientOf(props.s)
            : (props.press?.fill ?? "currentColor")
        }}
        onClick={() => markLearned(true)}
      >
        <Show when={learned()}>
          <Icon name="check" size={14} />
        </Show>
        {t("Learn more")}
      </button>
    </div>
  );
}

const TILES: Readonly<Record<Kind, (props: TileProps) => Element>> = {
  poster: Poster,
  album: Album,
  thumbnail: Thumbnail,
  post: Post,
  event: Event,
  ticket: Ticket,
  widget: Widget,
  member: Member,
  icon: AppIcon,
  business: Business,
  buttons: Buttons,
  letters: p => <HeadlineTile kind="letters" s={p.s} lit={p.lit} />,
  mark: p => <HeadlineTile kind="mark" s={p.s} lit={p.lit} />
};
const ORDER: readonly Kind[] = [
  "poster",
  "album",
  "post",
  "member",
  "thumbnail",
  "icon",
  "event",
  "ticket",
  "widget",
  "business",
  "buttons"
];

/** What makes a look a good fit for a tile: its words read on the picture, not on a band of paper under it; its play
    button or its glyph stands out as a control's part must; its painted button's label reads. The album's sleeve, the
    widget's glass and the business card's band hold no words on the picture, and every look fits them. */
const FITS: Partial<Record<Kind, (s: Shown) => boolean>> = {
  poster: s => posterWords(s) !== null,
  post: s => postWords(s) !== null,
  event: s => eventColumn(s) !== null,
  thumbnail: s => playInk(s).ratio >= MARK,
  ticket: s => stubInk(s) !== null,
  member: s => memberInk(s) !== null,
  icon: s => glyphInk(s).ratio >= MARK,
  buttons: s => labelInk(s) !== null
};
/** The looks a tile takes and a press on it turns through, from the one it shows: the album's sleeve through the
    effects, the rest through every look. The buttons and the headlines keep theirs. */
const TURNS: Partial<Record<Kind, readonly Look[]>> = { album: EFFECTS };
const TURNING: ReadonlySet<Kind> = new Set([
  "poster",
  "album",
  "thumbnail",
  "post",
  "event",
  "ticket",
  "widget",
  "member",
  "icon",
  "business"
]);

/** Each tile's look, worked out once for each palette and each set a reader turns the grid to (`turn`, 0 the page's
    own): the tiles in their order, each taking the seed's pick of the looks it is a good fit for, the ones the tiles
    before it took least first (looks.ts), a set past the first with its effects at an angle and in a shape of its own;
    then the headlines that work. A blob is read on the ground its tile gives it. */
function tileLooks(base: Shown, turn = 0) {
  const taken: Taken = new Map();
  const looks: Partial<Record<Kind, Shown>> = {};
  for (const kind of ORDER)
    looks[kind] = pickLook(
      base.seed,
      base.palette,
      turn ? `${kind}~${turn}` : kind,
      TURNS[kind] ?? LOOKS,
      s => FITS[kind]?.(solidBlob(s)) ?? true,
      taken,
      1,
      turn
    );
  return { looks, headlines: headlinesOf(base, taken) };
}

export function CardsExample(props: ExampleProps) {
  /* what every tile reads, worked out once for each palette */
  const paper = createMemo(() => pressPaper(drawnColors(props.s)));
  const seeded = createMemo(() => tileLooks(props.s, props.turn ?? 0));
  const headlines = () => seeded().headlines;
  /* the looks pressed onto tiles, for the palette and the set of looks they were pressed on */
  const [picked, setPicked] = createSignal<{ seed: string; looks: Partial<Record<Kind, Look>> }>({
    seed: "",
    looks: {}
  });
  const setOf = () => `${props.s.seed}~${props.turn ?? 0}`;
  /** The palette as a tile shows it: the look a press turned it to, else its own; a blob on a ground. */
  const shownBy = (kind: Kind): Shown => {
    const look = picked().seed === setOf() ? picked().looks[kind] : undefined;
    const headline = headlines().find(h => h.kind === kind)?.shown;
    if (headline) return headline;
    return solidBlob(
      look ? inLook(props.s.seed, props.s.palette, look, kind) : (seeded().looks[kind] ?? props.s)
    );
  };
  const turn = (kind: Kind) => {
    const order = TURNS[kind] ?? LOOKS;
    const next = order[(order.indexOf(lookOf(shownBy(kind))) + 1) % order.length];
    setPicked(p => ({
      seed: setOf(),
      looks: { ...(p.seed === setOf() ? p.looks : {}), [kind]: next }
    }));
    /* a reader who listens hears the look it turned to, which its name says from now on */
    announce(formWords(inLook(props.s.seed, props.s.palette, next, kind)));
  };
  const kinds = () => [...ORDER, ...headlines().map(h => h.kind)];
  /* the looks the grid shows, which its tag counts, and the ground a blob with none of its own stands on */
  const looks = createMemo(() => new Set(kinds().map(kind => lookOf(shownBy(kind)))).size);
  const ground = createMemo(
    () => ORDER.map(shownBy).find(s => s.effect?.kind === "blob")?.effect?.look.bg ?? null
  );
  return (
    <Example
      id="cards"
      n={props.n}
      onTurn={props.onTurn}
      title={t("Covers and cards")}
      about={t("For posters, covers, posts and tickets.")}
      drawn={t("{count, plural, one {# look} other {# looks}}", { count: looks() })}
      differs={ground() !== null}
      notes={
        <Show when={ground()}>
          {bg => (
            <Chip color={bg()}>
              <span>{rich("Background <c>{color}</c>", HEX, { color: bg() })}</span>
            </Chip>
          )}
        </Show>
      }
    >
      <div class={styles.wrap}>
        <div class={styles.grid}>
          <For each={kinds()}>
            {kind => {
              const Shape = TILES[kind];
              const headline = kind === "letters" || kind === "mark";
              const shown = createMemo(() => shownBy(kind));
              return (
                <Tile
                  kind={kind}
                  s={shown()}
                  place={headline && headlines().length === 1 ? HEADLINE_ALONE : undefined}
                  onTurn={TURNING.has(kind) ? () => turn(kind) : undefined}
                >
                  {lit => (
                    <Shape s={shown()} lit={lit} theme={paper().theme} press={paper().press} />
                  )}
                </Tile>
              );
            }}
          </For>
        </div>
      </div>
    </Example>
  );
}
