import { contrast } from "@grabient/engine/contrast.ts";
import { gradientCss } from "@grabient/engine/css.ts";
import type { EffectKind } from "@grabient/engine/effect.ts";
import { isSwatchStyle } from "@grabient/engine/view.ts";
import { dir, formatDate, formatNumber, msg, rich, t } from "@grabient/i18n";
import { announce } from "@grabient/ui/announce.ts";
import { createDone } from "@grabient/ui/done.ts";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createMemo, createSignal, type Element, For, Show, untrack } from "solid-js";
import styles from "./Cards.module.css";
import { Chip, Example, type ExampleProps, Painted } from "./Example.tsx";
import { inkThrough, MARK, type Press, pressPaper, standsOut, TEXT, TILE } from "./fit.ts";
import { frostOn } from "./frost.ts";
import { HeadlineTile, headlineShown, headlinesOf } from "./Headline.tsx";
import { createLit } from "./lit.ts";
import {
  colorsUnder,
  drawnColors,
  inkOn,
  mirrored,
  type Part,
  type Shown,
  type Theme
} from "./paint.ts";
import { drawnWords, formWords, gradientOf, inForm, solidBlob } from "./shared.ts";

/* Covers and cards: the palette as the media and the small things a designer makes with it, laid as a masonry of real
   shapes and sizes: a poster, an album's sleeve, a video's thumbnail, a frosted widget, a social post, an event's
   card, a ticket, a membership card, an app's icon, a business card and a pair of buttons. Each wears the palette as
   the address draws it (an effect's still, playing once the pointer rests on its tile or the keyboard's focus is in
   it), and a press on a tile turns it to its next look. Words stand on the palette only where the checks let them
   (fit.ts): in the ink that reads on every color under them, else on a band of paper, which takes the theme on whose
   paper the palette gives a press. A blob with no ground of its own stands on its darkest or lightest color, as a
   picture can't be clear. Three tiles show what else the palette can do, in the forms the address doesn't name, which
   their names say to a reader who listens. */

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
  /** the tile shows the palette in another form than the address names, which its name says */
  other?: boolean;
  /** where it stands, where not where its kind stands (PLACES) */
  place?: { col: string; row: string; aspect: number };
  /** a press on the tile, anywhere but its own presses and links, shows the palette in its next look */
  onTurn?: () => void;
  children: (lit: () => boolean) => Element;
}) {
  const lit = createLit();
  const place = () => props.place ?? PLACES[props.kind];
  const name = () => {
    const kind = t(NAMES[props.kind]);
    return props.other ? `${kind}, ${formWords(props.s)}` : kind;
  };
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
function Poster(props: TileProps) {
  const read = createMemo(() => placeWords(props.s, PLACES.poster.aspect, 0.44, POSTER_SPOTS));
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
function Thumbnail(props: TileProps) {
  const button = createMemo(() => {
    const read = inkOn(colorsUnder(props.s, PLAY, PLACES.thumbnail.aspect));
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
function Post(props: TileProps) {
  const read = createMemo(() => placeWords(props.s, PLACES.post.aspect, 0.6, POST_SPOTS));
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
function Event(props: TileProps) {
  const [saved, setSaved] = createSignal(false);
  const read = createMemo(
    () =>
      EVENT_COLUMNS.map(x1 => {
        const part = { x0: 0, y0: 0, x1, y1: 1 };
        const read = inkThrough(
          colorsUnder(props.s, dir() === "rtl" ? mirrored(part) : part, PLACES.event.aspect),
          TEXT
        );
        return read && { ...read, narrow: x1 < EVENT_COLUMNS[0] };
      }).find(Boolean) ?? null
  );
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
function Ticket(props: TileProps) {
  const stub = createMemo(() => inkThrough(colorsUnder(props.s, STUB, 1), TEXT));
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

/** A widget: the palette as its scene and a card of frosted glass on it, which holds an app's mark, what it counts
    and its amount, in the ink that reads on every color the glass can show there, veiled with the palette's own tint
    where that is enough (frost.ts). The card stands on the widget's start side where Cards.module.css's .glass lays
    it: 6% in from the start, 46% wide and 15% in from the top and the foot. */
const CARD: Part = { x0: 0.06, y0: 0.15, x1: 0.52, y1: 0.85 };
/** How far the glass's blur reaches, as a share of the widget's width: three of its standard deviations, 2.5cqi each
    (Cards.module.css's .glass). */
const FROST_REACH = 0.075;
function Widget(props: TileProps) {
  const frost = createMemo(() =>
    frostOn(props.s, dir() === "rtl" ? mirrored(CARD) : CARD, PLACES.widget.aspect, FROST_REACH)
  );
  const amount = () => formatNumber(0, { style: "currency", currency: "GBP" });
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
          <Icon name="anchor" size={24} />
        </span>
        <p class={styles.costName}>{t("Sunk cost")}</p>
        <p class={styles.amount} style={{ "--chars": String(amount().length) }}>
          {amount()}
        </p>
      </div>
    </div>
  );
}

/** A membership card: the palette as its face, its words in the ink that reads on every color under them, else on a
    strip of paper at its foot. */
const MEMBER: Part = { x0: 0.06, y0: 0.06, x1: 0.94, y1: 0.94 };
function Member(props: TileProps) {
  const read = createMemo(() =>
    inkThrough(colorsUnder(props.s, MEMBER, PLACES.member.aspect), TEXT)
  );
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
function AppIcon(props: TileProps) {
  const glyph = createMemo(() => {
    const read = inkOn(colorsUnder(props.s, GLYPH, 1));
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
function Buttons(props: TileProps) {
  const label = () => inkThrough(colorsUnder(props.s, LABEL, 3.4), TEXT);
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

/** What a tile shows the palette as: a gradient, bands across, bands swept round the middle (angular), rings out from
    it (radial), the fluted glass or the blob. */
type Look = "gradient" | "bands" | "sweep" | "rings" | EffectKind;
const SWATCH_STYLES = {
  bands: "linearSwatches",
  sweep: "angularSwatches",
  rings: "radialSwatches"
} as const;
const lookOf = (s: Shown): Look => {
  if (s.effect) return s.effect.kind;
  if (s.view.style === "linearSwatches") return "bands";
  if (s.view.style === "angularSwatches") return "sweep";
  if (s.view.style === "radialSwatches") return "rings";
  return "gradient";
};
/** The palette as a look: the address's own where it is that look; bands at the address's steps where it names bands,
    else a few; a gradient or an effect as the page's other forms are (shared.ts's inForm). */
function inLook(s: Shown, look: Look): Shown {
  if (lookOf(s) === look) return s;
  if (look === "gradient" || look === "glass" || look === "blob") return inForm(s, look);
  const bands = !s.effect && isSwatchStyle(s.view.style) ? s : inForm(s, "bands");
  return { ...bands, view: { ...bands.view, style: SWATCH_STYLES[look] } };
}
/* Now and then a palette's bands sweep round the middle or ring out from it rather than run across: by its seed, so its
   page shows the same each time. */
const BAND_LOOKS: readonly Look[] = ["bands", "sweep", "bands", "rings", "bands", "sweep"];
const bandsFor = (seed: string): Look => {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return BAND_LOOKS[h % BAND_LOOKS.length];
};
/** The tiles that show what else the palette can do, each in its first look the address doesn't name and no tile
    before it took: the album's sleeve as glass, the icon as the blob, the ticket's stub as a few bands (now and then
    swept or in rings), where the address names none of those. */
function looksOf(s: Shown): Partial<Record<Kind, Look>> {
  const taken = new Set<Look>([lookOf(s)]);
  const prefer: readonly (readonly [Kind, readonly Look[]])[] = [
    ["album", ["glass", "blob", "gradient", "bands"]],
    ["icon", ["blob", "glass", "gradient", "bands"]],
    ["ticket", [bandsFor(s.seed), "bands", "gradient", "glass", "blob"]]
  ];
  const looks: Partial<Record<Kind, Look>> = {};
  for (const [kind, order] of prefer) {
    const look = order.find(l => !taken.has(l)) ?? lookOf(s);
    taken.add(look);
    looks[kind] = look;
  }
  return looks;
}
/** The looks a press on a tile turns through, from the one it shows: the album's sleeve between the two effects, the
    rest through all six. The buttons and the headlines keep theirs. */
const TURN: readonly Look[] = ["gradient", "bands", "glass", "sweep", "blob", "rings"];
const TURNS: Partial<Record<Kind, readonly Look[]>> = { album: ["glass", "blob"] };
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

/** Whether the palette suits this example: every tile wears it, its words and presses as the checks let them. */
export const cardsFits = (_s: ExampleProps["s"]): boolean => true;

export function CardsExample(props: ExampleProps) {
  /* what every tile reads, worked out once for each palette */
  const s = createMemo(() => solidBlob(props.s));
  const paper = createMemo(() => pressPaper(drawnColors(props.s)));
  const looks = createMemo(() => looksOf(props.s));
  const headlines = createMemo(() => headlinesOf(props.s));
  /* the blob is shown on a ground its address doesn't name */
  const added = () => s() !== props.s;
  /* the looks pressed onto tiles, for the palette they were pressed on */
  const [picked, setPicked] = createSignal<{ seed: string; looks: Partial<Record<Kind, Look>> }>({
    seed: "",
    looks: {}
  });
  const lookFor = (kind: Kind): Look =>
    (picked().seed === props.s.seed ? picked().looks[kind] : undefined) ??
    looks()[kind] ??
    lookOf(props.s);
  const turn = (kind: Kind) => {
    const order = TURNS[kind] ?? TURN;
    const next = order[(order.indexOf(lookFor(kind)) + 1) % order.length];
    setPicked(p => ({
      seed: props.s.seed,
      looks: { ...(p.seed === props.s.seed ? p.looks : {}), [kind]: next }
    }));
    /* a reader who listens hears the look it turned to, which its name says from now on */
    announce(formWords(inLook(props.s, next)));
  };
  return (
    <Example
      id="cards"
      n={props.n}
      title={t("Covers and cards")}
      about={t("For posters, covers, posts and tickets.")}
      drawn={drawnWords(props.s)}
      differs={added()}
      notes={
        <Show when={added() && s().effect?.look.bg}>
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
          <For each={[...ORDER, ...headlines()]}>
            {kind => {
              const Shape = TILES[kind];
              const headline = kind === "letters" || kind === "mark";
              /* the palette as this tile shows it: the address's form, or another the tile shows off; a headline
                 draws it as it works there, a blob's letters on a ground of their own */
              const shown = createMemo(() => {
                if (headline) return props.s;
                const look = lookFor(kind);
                return look === lookOf(props.s) ? s() : solidBlob(inLook(props.s, look));
              });
              /* the form the tile's name says, where it is not the address's */
              const named = createMemo(() => (headline ? headlineShown(kind, props.s) : shown()));
              const other = () =>
                headline ? named() !== props.s : lookFor(kind) !== lookOf(props.s);
              return (
                <Tile
                  kind={kind}
                  s={named()}
                  other={other()}
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
