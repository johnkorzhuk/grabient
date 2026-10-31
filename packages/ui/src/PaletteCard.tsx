import { gradientCss } from "@grabient/engine/css.ts";
import { isSwatchStyle, type Style } from "@grabient/engine/view.ts";
import { createSignal, type Element, onSettled, Show, untrack } from "solid-js";
import { BarRim } from "./BarRim.tsx";
import { Button } from "./Button.tsx";
import { glowOff, glowOn } from "./glow.ts";
import hidden from "./hidden.module.css";
import { Icon } from "./Icon.tsx";
import { msg, t } from "./i18n.ts";
import { Like } from "./Like.tsx";
import styles from "./PaletteCard.module.css";
import { tooltip } from "./Tooltip.tsx";

/* One idle-time queue for every card's hover tools, one card per idle callback and four per tick where there is no
   requestIdleCallback, so a long list never mounts its tools in one long task. */
const waiting = new Set<() => void>();
let draining = false;
function drain(deadline?: IdleDeadline) {
  draining = false;
  let left = deadline ? 1 : 4;
  for (const arm of waiting) {
    waiting.delete(arm);
    arm();
    if (--left <= 0) break;
  }
  if (waiting.size) schedule();
}
function schedule() {
  if (draining) return;
  draining = true;
  if (typeof requestIdleCallback === "function") requestIdleCallback(drain);
  else setTimeout(drain, 120);
}
function whenIdle(arm: () => void): () => void {
  waiting.add(arm);
  schedule();
  return () => waiting.delete(arm);
}

/* The one card a finger has opened: a tap on another card's picture moves it there, a press anywhere else closes it.
   A touch screen leaves its hover on whatever it tapped last, so a finger opens the corners by this mark alone. */
let opened: HTMLElement | null = null;
let listening = false;
function open(art: HTMLElement) {
  if (!listening) {
    listening = true;
    document.addEventListener(
      "pointerdown",
      e => {
        if (opened && !opened.contains(e.target as Node)) {
          delete opened.dataset.open;
          opened = null;
        }
      },
      true
    );
  }
  const again = opened === art;
  if (opened) delete opened.dataset.open;
  opened = again ? null : art;
  if (opened) opened.dataset.open = "";
}

export interface PaletteCardProps {
  seed: string;
  /** what the palette is called, in the reader's language: each card reads differently to a screen reader */
  name: string;
  /** the stops the list draws, already sampled at its steps */
  stops: readonly string[];
  style: Style;
  angle: number;
  /** where Edit leads: the palette's page, in the reader's language and the view the card draws */
  href: string;
  /** Edit's relation to its page: nofollow where the index keeps the palette's page out */
  rel?: string;
  /** how old, as the list says it */
  age: string;
  /** what the palette is called where it has a title: it takes the age's place under the pointer or the keyboard's
      focus, and while a finger has the card open */
  title?: string;
  /** under a title of other words, what the palette's colors call it in the reader's language: the title's tooltip
      says it first */
  called?: string;
  /** what is said of the palette: the title's tooltip, before the age */
  description?: string;
  /** who brought the palette to Grabient, by name ("Grabient", or a person's username): said after the age, where the
      title's tooltip says the age, and with no title after the age itself while the card is open */
  credit?: string;
  /** the card's owner names the palette here: the title's place offers the title to change, or a way to add one, and
      `onName` is called with the words kept, "" to take the title away */
  naming?: { max: number; onName: (title: string) => void };
  likes: number;
  liked?: boolean;
  onLike?: () => void;
  /** the like needs the server and there is none: signed out and offline */
  likeDisabled?: boolean;
  /** in the selection: the corner shows a check */
  selected?: boolean;
  onSelect?: () => void;
  /** the selection's own view: the toggle alone, always shown */
  selectable?: boolean;
  /** Edit was pressed, before the editor opens */
  onOpen?: (e: MouseEvent) => void;
  /** where Similar palettes leads, beside Edit: the palettes like this one, as a search of a list. It comes with the
      hover tools, so a list's markup and its links stay as the server sends them; `disabled` while that page needs a
      server there is none of */
  similar?: { href: string; rel?: string; disabled?: boolean };
  /** the pointer or the focus reached the card, or a finger's tap opened it: Edit shows, and a press may follow */
  onIntent?: () => void;
  /** presses beside Edit: an admin's curation, a collection owner's removal, or the Undo of one */
  lead?: Element;
  /** under the check once the palette is selected: Add to collection */
  collect?: Element;
  /** the copies, the downloads and the links: mounted with the hover tools */
  tools?: () => Element;
  /** before the heart: the reader's say on how the palette fits */
  fit?: Element;
  /** taken out of its collection a moment ago: it stands where it stood, faded, with only `lead` over it */
  removed?: boolean;
  /** a state held at rest, for the design document: lit, with its tools shown */
  state?: "hover";
  /** a picture over the gradient, in its place (the editor's sheet while its picture plays fluted glass or a blob),
      told whether the pointer or the keyboard's focus is in the card, so it may move only then */
  picture?: (active: () => boolean) => Element;
  /** what a screen reader calls that picture */
  pictureLabel?: string;
  /** the picture stands on the list with no ground of its own (a blob with none): no gradient under it, no glow */
  bare?: boolean;
}

/** One palette in a list: its picture, then its age and its like. Hover or focus inside the picture lights a blurred
    copy of it under the card, which the water behind the page takes in, and shows the tools on glass; nothing moves.
    Under the pointer, the keyboard's focus or a finger's tap, a palette's title stands where its age stood, and its
    owner may write one there.
    On touch a tap on the picture shows Edit, Similar palettes and the plus, one card at a time, and nothing is lit: a
    finger's hover stays where it last tapped. The picture is no link: Edit opens the editor. The hover tools, Similar
    palettes among them, stay out of the server's markup and hydration, where they would be most of a list's weight,
    and mount in idle time or as soon as the pointer or focus reaches the card. */
export function PaletteCard(props: PaletteCardProps) {
  const [armed, setArmed] = createSignal(untrack(() => props.state === "hover"));
  const arm = () => setArmed(true);
  onSettled(() => (armed() ? undefined : whenIdle(arm)));
  const art = () => gradientCss(props.stops, props.style, props.angle);
  /* the water takes the glow in while a mouse or a pen is in the picture or the keyboard's focus is within it */
  let over = false;
  let within = false;
  /* the same, for a picture that moves only while the card is lit */
  const [active, setActive] = createSignal(false);
  /* read as the event finds them: a focus that leaves as a route takes the card away runs inside Solid's commit */
  const shine = (picture: HTMLElement) =>
    untrack(() => {
      setActive((over || within) && !props.removed);
      if ((over || within) && !props.removed && !props.bare) {
        glowOn(
          picture,
          [{ stops: props.stops, style: props.style, angle: props.angle }],
          () => !props.removed
        );
      } else glowOff(picture);
    });
  const inside = (e: PointerEvent | FocusEvent) =>
    (e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null);
  let finger = false;
  const tap = (e: MouseEvent) => {
    if (!finger || (e.target as HTMLElement).closest("a, button")) return;
    open(e.currentTarget as HTMLElement);
    props.onIntent?.();
  };
  /* when and by whom, the age first: the title's tooltip says it on its quieter line, under what the palette's colors
     call it and what is said of it. With no title, the age says who itself while the card is open, and a description
     is the age's own tooltip */
  const whenBy = () => [props.age, props.credit].filter(Boolean).join(" · ");
  const said = () => ({
    text: [props.called, props.description].filter(Boolean).join("\n"),
    quiet: whenBy()
  });
  const untitled = () => !props.title && !props.naming;
  const aside = () =>
    untitled() && props.description ? { text: props.description, quiet: whenBy() } : null;
  const renameLabel = () => (props.title ? t("Rename {title}", { title: props.title }) : undefined);
  /* the owner's field in the title's place: Enter or leaving it keeps what it holds, Escape lets it go */
  const [naming, setNaming] = createSignal(false);
  let field: HTMLInputElement | undefined;
  let press: HTMLButtonElement | undefined;
  const named = (keep: boolean, back: boolean) => {
    if (!naming()) return;
    const words = field?.value.trim() ?? "";
    setNaming(false);
    if (keep && words !== (props.title ?? "")) props.naming?.onName(words);
    if (back) queueMicrotask(() => press?.focus());
  };
  return (
    <article
      class={styles.card}
      aria-label={t(props.removed ? msg("{name} palette, removed") : msg("{name} palette"), {
        name: props.name
      })}
      onFocusIn={() => {
        arm();
        props.onIntent?.();
      }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: a finger's tap opens
          the corners that hover opens for a mouse; the keyboard reaches the same presses by Tab, and focus shows them */}
      <div
        class={styles.art}
        data-open={props.state === "hover" ? "" : undefined}
        data-removed={props.removed ? "" : undefined}
        onPointerOver={e => {
          arm();
          if (e.pointerType === "touch") return;
          if (!over) props.onIntent?.();
          over = true;
          shine(e.currentTarget);
        }}
        onPointerOut={e => {
          over &&= inside(e);
          shine(e.currentTarget);
        }}
        onFocusIn={e => {
          within = e.target instanceof Element && e.target.matches(":focus-visible");
          shine(e.currentTarget);
        }}
        onFocusOut={e => {
          within &&= inside(e);
          shine(e.currentTarget);
        }}
        onPointerDown={e => {
          finger = e.pointerType === "touch";
        }}
        onClick={tap}
      >
        <Show when={armed() && !props.removed && !props.bare}>
          <span class={styles.glow} style={{ background: art() }} aria-hidden="true" />
        </Show>
        <div
          class={styles.paint}
          style={{ background: props.bare ? undefined : art() }}
          role="img"
          aria-label={
            props.pictureLabel ??
            t(isSwatchStyle(props.style) ? msg("{name} swatches") : msg("{name} gradient"), {
              name: props.name
            })
          }
        >
          <Show when={props.picture}>{picture => picture()(active)}</Show>
        </div>
        <Show
          when={!props.removed}
          fallback={
            <span class={styles.lead} data-kept="">
              {props.lead}
            </span>
          }
        >
          <Show
            when={!props.selectable}
            fallback={
              <span class={styles.pick} data-kept="">
                {pick(props)}
              </span>
            }
          >
            <span class={styles.lead}>
              <Button
                variant="art"
                icon
                size="sm"
                href={props.href}
                rel={props.rel}
                aria-label={t("Edit {name}", { name: props.name })}
                tip={t("Edit")}
                onClick={e => props.onOpen?.(e)}
              >
                <Icon name="edit" size={13} />
                {/* the link's words for whoever reads them, a crawler among them */}
                <span class={hidden.text}>{t("Edit {name}", { name: props.name })}</span>
              </Button>
              <Show when={armed() && props.similar}>
                {similar => (
                  <Button
                    variant="art"
                    icon
                    size="sm"
                    href={similar().href}
                    rel={similar().rel}
                    disabled={similar().disabled}
                    aria-label={t("Palettes like {name}", { name: props.name })}
                    tip={t("Similar palettes")}
                  >
                    <Icon name="search" size={13} />
                  </Button>
                )}
              </Show>
              {props.lead}
            </span>
            <span class={styles.pick} data-kept={props.selected ? "" : undefined}>
              {pick(props)}
              <Show when={props.selected}>{props.collect}</Show>
            </span>
            <Show when={armed() && props.tools}>
              <span class={styles.tools}>{props.tools?.()}</span>
            </Show>
          </Show>
        </Show>
      </div>
      {/* a removed palette's line fades with its picture and takes no press: Undo is the one thing left to do */}
      <div
        class={styles.meta}
        data-removed={props.removed ? "" : undefined}
        data-named={props.title || props.naming ? "" : undefined}
        inert={props.removed}
      >
        <span class={styles.when}>
          {/* words to read where there is more to say, as a title's are; who brought the palette stands in its place
              unseen until the card opens, so nothing moves as it shows */}
          <span class={styles.age} ref={tooltip(aside)} tabindex={aside() ? 0 : undefined}>
            {props.age}
            <Show when={untitled() && props.credit}>
              <span class={styles.by}>{` · ${props.credit}`}</span>
            </Show>
          </span>
          <Show
            when={props.naming}
            fallback={
              <Show when={props.title}>
                {/* words to read, which take the keyboard's focus: their tooltip says the age they stand over */}
                <span class={styles.named} dir="auto" ref={tooltip(said)} tabindex={0}>
                  {props.title}
                </span>
              </Show>
            }
          >
            <Show
              when={naming()}
              fallback={
                <button
                  ref={el => {
                    press = el;
                    tooltip(said)(el);
                  }}
                  type="button"
                  class={styles.named}
                  data-empty={props.title ? undefined : ""}
                  dir={props.title ? "auto" : undefined}
                  aria-label={renameLabel()}
                  onClick={() => setNaming(true)}
                >
                  {props.title || t("Add a title")}
                </button>
              }
            >
              <span class={styles.field}>
                <BarRim />
                <input
                  ref={el => {
                    field = el;
                    // in the document once this turn of rendering ends
                    queueMicrotask(() => {
                      el.focus();
                      el.select();
                    });
                  }}
                  class={styles.input}
                  dir="auto"
                  value={props.title ?? ""}
                  maxlength={props.naming?.max}
                  placeholder={t("Add a title")}
                  aria-label={t("Palette title")}
                  enterkeyhint="done"
                  spellcheck="false"
                  onKeyDown={e => {
                    if (e.key !== "Enter" && e.key !== "Escape") return;
                    // the key ends here: its keypress would press the title the focus goes back to
                    e.preventDefault();
                    e.stopPropagation();
                    named(e.key === "Enter", true);
                  }}
                  onBlur={() => named(true, false)}
                />
              </span>
            </Show>
          </Show>
        </span>
        <span class={styles.judge}>
          {props.fit}
          <Like
            count={props.likes}
            liked={props.liked}
            onToggle={props.onLike}
            disabled={props.likeDisabled}
          />
        </span>
      </div>
    </article>
  );
}

/** The corner toggle: a plus to add, a check in ink once added. Its name says what a press does now, so no pressed
    state stands beside it. */
function pick(props: PaletteCardProps) {
  return (
    <Button
      variant={props.selected ? "primary" : "art"}
      icon
      size="sm"
      aria-label={t(props.selected ? msg("Remove from selection") : msg("Add to selection"))}
      tip={t(props.selected ? msg("Remove from selection") : msg("Add to selection"))}
      onClick={() => props.onSelect?.()}
    >
      <Icon name={props.selected ? "check" : "plus"} size={14} />
    </Button>
  );
}
