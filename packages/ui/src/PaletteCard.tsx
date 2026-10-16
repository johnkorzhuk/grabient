import { gradientCss } from "@grabient/engine/css.ts";
import { isSwatchStyle, type Style } from "@grabient/engine/view.ts";
import { createSignal, type Element, onSettled, Show, untrack } from "solid-js";
import { Button } from "./Button.tsx";
import { glowOff, glowOn } from "./glow.ts";
import { Icon } from "./Icon.tsx";
import { msg, t } from "./i18n.ts";
import { Like } from "./Like.tsx";
import styles from "./PaletteCard.module.css";

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
}

/** One palette in a list: its picture, then its age and its like. Hover or focus inside the picture lights a blurred
    copy of it under the card, which the water behind the page takes in, and shows the tools on glass; nothing moves.
    On touch a tap on the picture shows Edit and the plus, one card at a time, and nothing is lit: a finger's hover
    stays where it last tapped. The picture is no link: Edit opens the editor. The hover tools stay out of the
    server's markup and hydration, where they would be most of a list's weight, and mount in idle time or as soon as
    the pointer or focus reaches the card. */
export function PaletteCard(props: PaletteCardProps) {
  const [armed, setArmed] = createSignal(untrack(() => props.state === "hover"));
  const arm = () => setArmed(true);
  onSettled(() => (armed() ? undefined : whenIdle(arm)));
  const art = () => gradientCss(props.stops, props.style, props.angle);
  /* the water takes the glow in while a mouse or a pen is in the picture or the keyboard's focus is within it */
  let over = false;
  let within = false;
  /* read as the event finds them: a focus that leaves as a route takes the card away runs inside Solid's commit */
  const shine = (picture: HTMLElement) =>
    untrack(() => {
      if ((over || within) && !props.removed) {
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
        <Show when={armed() && !props.removed}>
          <span class={styles.glow} style={{ background: art() }} aria-hidden="true" />
        </Show>
        <div
          class={styles.paint}
          style={{ background: art() }}
          role="img"
          aria-label={t(
            isSwatchStyle(props.style) ? msg("{name} swatches") : msg("{name} gradient"),
            {
              name: props.name
            }
          )}
        />
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
              </Button>
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
      <div class={styles.meta} data-removed={props.removed ? "" : undefined} inert={props.removed}>
        <span class={styles.age}>{props.age}</span>
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
