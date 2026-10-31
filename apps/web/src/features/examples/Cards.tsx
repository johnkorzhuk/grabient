import { contrast } from "@grabient/engine/contrast.ts";
import { gradientCss } from "@grabient/engine/css.ts";
import type { Size } from "@grabient/engine/view.ts";
import { dir, formatDate, formatNumber, msg, rich, t } from "@grabient/i18n";
import { createDone } from "@grabient/ui/done.ts";
import { type Format, FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createSignal, type Element, onSettled, Show, untrack } from "solid-js";
import { toast } from "../../app/toast.ts";
import { paletteName } from "../../lib/page-meta.ts";
import { EffectArt } from "../editor/EffectArt.tsx";
import {
  copyFormat,
  copyLink,
  STRIP_EFFECT_COPY,
  saveFormat,
  type Taken
} from "../editor/formats.ts";
import styles from "./Cards.module.css";
import { Chip, Example, type ExampleProps } from "./Example.tsx";
import { inkThrough, MARK, type Press, pressPaper, standsOut, TEXT, TILE } from "./fit.ts";
import {
  colorsUnder,
  drawnColors,
  inkOn,
  mirrored,
  type Part,
  type Shown,
  type Theme
} from "./paint.ts";
import {
  drawnWords,
  type Form,
  formOf,
  formWords,
  gradientOf,
  inForm,
  solidBlob,
  takenOf
} from "./shared.ts";

/* Covers and cards: the palette as the media and the small things a designer makes with it, laid as a masonry of
   real shapes and sizes: a poster, an album's sleeve with its record, a video's thumbnail, a social post, an event's
   card, a ticket, a membership card, an app's icon, a business card and a pair of buttons. Each wears the palette as
   the address draws it (an effect's still, playing while the pointer is on its tile). A medium's tile holds the app's
   own strip in its corner, as a gallery card does, which copies, saves or links the palette at that medium's own
   size: a poster's PNG at 1200 by 1800. Words stand on the palette only where the checks let them (fit.ts): in the
   ink that reads on every color under them, else on a band of paper, which takes the theme on whose paper the
   palette gives a press. A blob with no ground of its own stands on its darkest or lightest color, as a picture can't
   be clear. Three tiles show what else the palette can do, in the forms the address doesn't name, which their names
   say to a reader who listens. */

/** Each medium's pixels, within a PNG's bounds (2400 a side, 3 million in all). */
const SIZES = {
  poster: { width: 1200, height: 1800 },
  album: { width: 1500, height: 1500 },
  thumbnail: { width: 1280, height: 720 },
  post: { width: 1080, height: 1350 },
  event: { width: 1120, height: 700 },
  ticket: { width: 600, height: 600 },
  member: { width: 1012, height: 638 },
  icon: { width: 1024, height: 1024 },
  business: { width: 1050, height: 600 },
  buttons: { width: 600, height: 150 }
} as const satisfies Record<string, Size>;
type Kind = keyof typeof SIZES;

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
  business: { col: "3 / span 1", row: "74 / span 12", aspect: 2 },
  buttons: { col: "4 / span 1", row: "74 / span 12", aspect: 2 }
};

const NAMES: Readonly<Record<Kind, string>> = {
  poster: msg("Poster"),
  album: msg("Album cover"),
  thumbnail: msg("Video thumbnail"),
  post: msg("Social post"),
  event: msg("Event card"),
  ticket: msg("Ticket"),
  member: msg("Membership card"),
  icon: msg("App icon"),
  business: msg("Business card"),
  buttons: msg("Buttons")
};

/** The day every card names, the same on the server and in the browser. */
const DAY = Date.UTC(2026, 10, 12, 19, 30);
/** The strip's formats, as a gallery card's; an effect's copies as the editor's strip gives them while it plays, its
    tags for a page and its layers for Figma among them. */
const COPY: readonly Format[] = ["url", "css", "svg", "png"];
const SAVE: readonly Format[] = ["css", "svg", "png"];

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

/** The palette as a picture filling its holder: the gradient, or the effect's still, playing while lit. */
function Picture(props: { s: Shown; lit: boolean; class?: string }) {
  return (
    <span class={`${styles.picture} ${props.class ?? ""}`} aria-hidden="true">
      <Show
        when={props.s.effect}
        fallback={<span class={styles.fill} style={{ background: gradientOf(props.s) }} />}
      >
        {effect => (
          <EffectArt
            kind={effect().kind}
            palette={props.s.palette}
            settings={effect()}
            angle={props.s.view.angle}
            active={props.lit}
          />
        )}
      </Show>
    </span>
  );
}

/** The media whose tiles hold the app's strip, which takes the palette at that medium's size: the ones the palette
    fills, the strip standing on the picture as on a gallery card (a poster's, a thumbnail's, a post's). The album's
    sleeve and the icon stand smaller than their tiles, and the cards and the buttons are things made with the
    palette, not its picture. */
const MEDIA: ReadonlySet<Kind> = new Set(["poster", "thumbnail", "post"]);

/** A tile of the masonry: what it shows, lit while the pointer or the focus is on it, and on a medium's tile the app's
    strip in its corner, which takes the palette at the tile's size. The strip comes once the page idles; a finger
    opens it by a tap. */
function Tile(props: {
  kind: Kind;
  s: Shown;
  /** the tile shows the palette in another form than the address names, which its name says */
  other?: boolean;
  open: Kind | null;
  onOpen: (kind: Kind) => void;
  children: (lit: () => boolean) => Element;
}) {
  const [lit, setLit] = createSignal(false);
  const [armed, setArmed] = createSignal(false);
  onSettled(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 200));
    idle(() => setArmed(true));
  });
  const size = () => SIZES[props.kind];
  const taken = (): Taken => ({
    ...takenOf(props.s, size()),
    size: size(),
    name: paletteName(props.s.palette, props.s.view)
  });
  const refused = (message: string) => () => {
    toast(message);
    return false;
  };
  const place = PLACES[props.kind];
  const content = untrack(() => props.children(lit));
  return (
    /* biome-ignore lint/a11y/useSemanticElements: a picture and its strip, named for a reader who listens; a fieldset
       is for a form's controls */
    <div
      class={styles.tile}
      data-kind={props.kind}
      data-open={props.open === props.kind ? "" : undefined}
      role="group"
      aria-label={
        props.other ? `${t(NAMES[props.kind])}, ${formWords(props.s)}` : t(NAMES[props.kind])
      }
      style={{ "--col": place.col, "--row": place.row, "--aspect": String(place.aspect) }}
      onPointerEnter={() => setLit(true)}
      onPointerLeave={() => setLit(false)}
      onFocusIn={() => setLit(true)}
      onFocusOut={() => setLit(false)}
      onPointerDown={e => {
        if (e.pointerType !== "mouse" && MEDIA.has(props.kind)) props.onOpen(props.kind);
      }}
    >
      {content}
      <Show when={armed() && MEDIA.has(props.kind)}>
        <div class={styles.tools}>
          <FormatStrip
            size="sm"
            copy={props.s.effect ? STRIP_EFFECT_COPY : COPY}
            download={SAVE}
            link={SAVE}
            swatches={SWATCH_CHIPS}
            onCopy={f =>
              copyFormat(f, taken()).then(() => true, refused(t("Couldn't copy the palette.")))
            }
            onDownload={f => {
              saveFormat(f, taken()).catch(refused(t("Couldn't download the file.")));
            }}
            onLink={f =>
              copyLink(f, taken()).then(() => true, refused(t("Couldn't copy the palette.")))
            }
          />
        </div>
      </Show>
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
  const read = () => placeWords(props.s, PLACES.poster.aspect, 0.44, POSTER_SPOTS);
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
  const button = () => {
    const read = inkOn(colorsUnder(props.s, PLAY, PLACES.thumbnail.aspect));
    if (read.ratio >= MARK)
      return { fill: read.ink, glyph: read.ink === "#ffffff" ? "#000000" : "#ffffff" };
    return props.press ? { fill: props.press.fill, glyph: props.press.label } : null;
  };
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
  const read = () => placeWords(props.s, PLACES.post.aspect, 0.6, POST_SPOTS);
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
  const column = () =>
    EVENT_COLUMNS.map(x1 => {
      const part = { x0: 0, y0: 0, x1, y1: 1 };
      const read = inkThrough(
        colorsUnder(props.s, dir() === "rtl" ? mirrored(part) : part, PLACES.event.aspect),
        TEXT
      );
      return read && { ...read, narrow: x1 < EVENT_COLUMNS[0] };
    }).find(Boolean) ?? null;
  const read = () => column();
  /* on the palette the press takes the words' ink and, as its label, the palette's color that reads best on it where
     one reads as words must, else the other ink; under the cover, the press the palette gives on the paper */
  const press = (): Press | null => {
    const on = read();
    if (!on) return props.press;
    const best = drawnColors(props.s).reduce((a, b) =>
      contrast(on.ink, b) > contrast(on.ink, a) ? b : a
    );
    const label =
      contrast(on.ink, best) >= TEXT ? best : on.ink === "#ffffff" ? "#000000" : "#ffffff";
    return { fill: on.ink, label, hover: on.ink };
  };
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
  const stub = () => inkThrough(colorsUnder(props.s, STUB, 1), TEXT);
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

/** A membership card: the palette as its face, its words in the ink that reads on every color under them, else on a
    strip of paper at its foot. */
const MEMBER: Part = { x0: 0.06, y0: 0.06, x1: 0.94, y1: 0.94 };
function Member(props: TileProps) {
  const read = () => inkThrough(colorsUnder(props.s, MEMBER, PLACES.member.aspect), TEXT);
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
  const glyph = () => {
    const read = inkOn(colorsUnder(props.s, GLYPH, 1));
    return read.ratio >= MARK ? read.ink : null;
  };
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
  member: Member,
  icon: AppIcon,
  business: Business,
  buttons: Buttons
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
  "business",
  "buttons"
];

/** The tiles that show what else the palette can do, each in its first form the address doesn't name and no tile
    before it took: the album's sleeve as glass, the icon as the blob, the ticket's stub as a few bands, where the
    address names none of those. */
const OTHERS: readonly (readonly [Kind, readonly Form[]])[] = [
  ["album", ["glass", "blob", "gradient", "bands"]],
  ["icon", ["blob", "glass", "gradient", "bands"]],
  ["ticket", ["bands", "gradient", "glass", "blob"]]
];
function formsOf(s: Shown): Partial<Record<Kind, Form>> {
  const taken = new Set<Form>([formOf(s)]);
  const forms: Partial<Record<Kind, Form>> = {};
  for (const [kind, prefer] of OTHERS) {
    const form = prefer.find(f => !taken.has(f)) ?? formOf(s);
    taken.add(form);
    forms[kind] = form;
  }
  return forms;
}

/** Whether the palette suits this example: every tile wears it, its words and presses as the checks let them. */
export const cardsFits = (_s: ExampleProps["s"]): boolean => true;

export function CardsExample(props: ExampleProps) {
  const s = () => solidBlob(props.s);
  /* the blob is shown on a ground its address doesn't name */
  const added = () => s() !== props.s;
  const paper = () => pressPaper(drawnColors(props.s));
  const [open, setOpen] = createSignal<Kind | null>(null);
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
          {ORDER.map(kind => {
            const Shape = TILES[kind];
            /* the palette as this tile shows it: the address's form, or another the tile shows off */
            const shown = () => {
              const form = formsOf(props.s)[kind];
              return form ? solidBlob(inForm(props.s, form)) : s();
            };
            return (
              <Tile
                kind={kind}
                s={shown()}
                other={formsOf(props.s)[kind] !== undefined}
                open={open()}
                onOpen={k => setOpen(open() === k ? null : k)}
              >
                {lit => <Shape s={shown()} lit={lit} theme={paper().theme} press={paper().press} />}
              </Tile>
            );
          })}
        </div>
      </div>
    </Example>
  );
}
