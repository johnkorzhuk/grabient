import { STEPS_MAX, STYLE_LABELS, type Style, type StyleChoice } from "@grabient/engine/view.ts";
import { For, onSettled, Show } from "solid-js";
import styles from "./Appearance.module.css";
import { BarRim } from "./BarRim.tsx";
import { Button } from "./Button.tsx";
import { focusLeft, pressOutside, typingIn } from "./dismiss.ts";
import { Icon } from "./Icon.tsx";
import { msg, t } from "./i18n.ts";
import joined from "./joined.module.css";
import { placeMenu } from "./Menu.tsx";
import { Scrub } from "./Scrub.tsx";
import { Text } from "./Text.tsx";
import { tooltip } from "./Tooltip.tsx";

/* How the palette is drawn: style, steps and angle in one control. The button reads the current look over a swatch of
   it and opens a tile per style, painted with the palette at hand, then Steps and Angle. On a list route nothing is
   chosen by default: each palette keeps its own look, Steps and Angle read Auto a step under their floor, and a chosen
   tile chosen again lets it go. Once anything is chosen there, a reset joined to the button's end lets all of it go.
   A tile previews its style on hover wherever there is artwork to preview it on, and only a click commits; a finger,
   with no hover, commits with a tap. A tile's press is its whole cell, so the cells touch and the preview lets go only
   when the pointer leaves the tiles. */

/** The tiles in the menu's order: each style, then its bands, so the grid stands Linear, Radial and Angular across
    with their bands beneath, and the keyboard reads each style before its bands. */
export const APPEARANCE_OPTIONS: readonly Style[] = [
  "linearGradient",
  "linearSwatches",
  "radialGradient",
  "radialSwatches",
  "angularGradient",
  "angularSwatches"
];
/** A style's name in the reader's language; As saved where each palette keeps its own. */
export const styleLabel = (s: StyleChoice): string =>
  t(s === "auto" ? msg("As saved") : STYLE_LABELS[s]);

export function AppearanceButton(props: {
  /** the palette at hand drawn as it is set: the swatch */
  swatch: string;
  /** the style's name, or As saved */
  label: string;
  /** what is set apart from it: "8 steps · 45°"; empty for nothing */
  summary?: string;
  open: boolean;
  onToggle: () => void;
  /** a route with anything set: the menu's Reset, pressed from the button */
  onReset?: () => void;
}) {
  let button!: HTMLButtonElement;
  const tip = tooltip(() => t("Appearance"));
  const tipReset = tooltip(() => t("Reset"));
  return (
    <span class={styles.host}>
      <span class={joined.part}>
        <BarRim square={props.onReset ? "end" : undefined} />
        {/* on a phone the button is its swatch alone, so its name says what it opens, then what is set */}
        <button
          ref={el => {
            button = el;
            tip(el);
          }}
          type="button"
          class={styles.button}
          data-open={props.open ? "" : undefined}
          data-joined={props.onReset ? "" : undefined}
          aria-expanded={props.open ? "true" : "false"}
          aria-controls="appearance-menu"
          aria-label={t(
            props.summary ? msg("Appearance: {label}, {summary}") : msg("Appearance: {label}"),
            {
              label: props.label,
              summary: props.summary
            }
          )}
          onClick={() => props.onToggle()}
        >
          <span class={styles.swatch} style={{ background: props.swatch }} aria-hidden="true" />
          <span class={styles.summary}>
            <span>{props.label}</span>
            <Show when={props.summary}>
              <span class={styles.detail}>· {props.summary}</span>
            </Show>
          </span>
          <span class={styles.chevron} data-open={props.open ? "" : undefined}>
            <Icon name="chevron" size={14} />
          </span>
        </button>
      </span>
      <Show when={props.onReset}>
        <span class={[joined.part, styles.clear]}>
          <BarRim square="start" />
          <button
            ref={tipReset}
            type="button"
            class={joined.end}
            aria-label={t("Reset appearance")}
            onClick={e => {
              /* the press leaves once there is nothing to reset, so a keyboard goes back to the button */
              const keyboard = e.currentTarget.matches(":focus-visible");
              props.onReset?.();
              if (keyboard) button.focus({ preventScroll: true });
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </span>
      </Show>
    </span>
  );
}

export interface AppearanceProps {
  /** the tiles, in order */
  options: readonly Style[];
  /** the chosen style, or auto: each palette its own, no tile chosen */
  style: StyleChoice;
  /** a list route: Steps and Angle read Auto under their floor, and a chosen tile chosen again lets it go */
  auto?: boolean;
  steps: number | "auto";
  /** null where the style drawn takes no angle: the field steps aside */
  angle: number | "auto" | null;
  /** the fewest stops this route can ask for */
  stepsMin: number;
  /** a tile's paint: the palette at hand drawn that way */
  bg: (s: Style) => string;
  onStyle: (s: StyleChoice) => void;
  onSteps: (v: number | "auto") => void;
  onAngle: (v: number | "auto") => void;
  /** a preview while the pointer or the keyboard rests on a tile, where there is artwork to preview it on */
  onPeek?: (s: Style | null) => void;
  /** anything set: each palette back to its own look */
  onReset?: () => void;
  /** floating over the page: a press anywhere else puts it away */
  floating?: boolean;
  /** absent where the menu is part of its page: no Close, and the keys stay the page's */
  onClose?: () => void;
}

export function AppearanceMenu(props: AppearanceProps) {
  let root!: HTMLDivElement;
  const auto = () => !!props.auto;
  const off = () => props.onPeek?.(null);
  /* Escape and Close hand the keyboard back to the button that opened the menu; a press elsewhere, or the keyboard
     leaving it for the page, leaves it be */
  const button = () => document.querySelector('[aria-controls="appearance-menu"]');
  const closeBack = () => {
    const inside = root.contains(document.activeElement);
    props.onClose?.();
    if (inside)
      document
        .querySelector<HTMLElement>('[aria-controls="appearance-menu"]')
        ?.focus({ preventScroll: true });
  };
  /* Close is found by its name in the reader's language, when Reset leaves under the focus */
  const closeLabel = t("Close");
  onSettled(() => {
    if (props.floating) placeMenu(root);
    if (!props.onClose) return;
    root.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true });
    const onEscape = (e: KeyboardEvent) => {
      /* a number being typed takes Escape to put itself back first */
      if (e.key !== "Escape" || typingIn(root, e.target)) return;
      e.stopPropagation();
      closeBack();
    };
    document.addEventListener("keydown", onEscape, true);
    const away = props.floating
      ? pressOutside(
          () => [root, button()],
          () => props.onClose?.()
        )
      : () => {};
    return () => {
      document.removeEventListener("keydown", onEscape, true);
      away();
    };
  });
  const choose = (s: Style) => {
    off();
    props.onStyle(auto() && props.style === s ? "auto" : s);
  };
  const reset = () => {
    off();
    props.onReset?.();
    requestAnimationFrame(() =>
      root
        .querySelector<HTMLElement>(`button[aria-label="${CSS.escape(closeLabel)}"]`)
        ?.focus({ preventScroll: true })
    );
  };
  const stepsFloor = () => props.stepsMin - (auto() ? 1 : 0);
  const angleFloor = () => (auto() ? -1 : 0);
  return (
    <div
      ref={root}
      id={props.onClose ? "appearance-menu" : undefined}
      class={styles.menu}
      data-floating={props.floating ? "" : undefined}
      data-keys={props.floating ? "own" : undefined}
      onPointerLeave={off}
      onFocusOut={e => {
        if (props.floating && focusLeft(e, root, button())) props.onClose?.();
      }}
    >
      <div class={styles.head}>
        <Text variant="h3">{t("Appearance")}</Text>
        <span class={styles.tools}>
          <Show when={props.onReset}>
            <Button variant="ghost" size="sm" onClick={reset}>
              {t("Reset")}
            </Button>
          </Show>
          <Show when={props.onClose}>
            <Button
              icon
              variant="ghost"
              aria-label={closeLabel}
              tip={`${closeLabel} · Esc`}
              onClick={closeBack}
            >
              <Icon name="close" size={14} />
            </Button>
          </Show>
        </span>
      </div>
      {/* the preview lets go when the pointer leaves the tiles, never between two of them */}
      <div class={styles.tiles} onPointerLeave={off}>
        <For each={props.options} keyed={false}>
          {style => (
            <button
              type="button"
              class={styles.tile}
              aria-label={styleLabel(style())}
              aria-pressed={props.style === style() ? "true" : "false"}
              onPointerEnter={e => {
                if (e.pointerType !== "touch") props.onPeek?.(style());
              }}
              onFocus={() => props.onPeek?.(style())}
              onBlur={off}
              onClick={() => choose(style())}
            >
              <span
                class={styles.art}
                style={{ background: props.bg(style()) }}
                aria-hidden="true"
              />
              <span class={styles.name} aria-hidden="true">
                {styleLabel(style())}
              </span>
            </button>
          )}
        </For>
      </div>
      <div class={styles.pair}>
        <Scrub
          label={t("Steps")}
          min={stepsFloor()}
          max={STEPS_MAX}
          step={1}
          grain={1}
          def={7}
          fmt={v => (v < props.stepsMin ? t("Auto") : String(Math.round(v)))}
          value={props.steps === "auto" ? stepsFloor() : props.steps}
          onInput={v => props.onSteps(v < props.stepsMin ? "auto" : Math.round(v))}
        />
        <Show when={props.angle !== null}>
          <Scrub
            label={t("Angle")}
            min={angleFloor()}
            max={360}
            step={1}
            grain={1}
            def={90}
            fmt={v => (v < 0 ? t("Auto") : `${Math.round(v)}°`)}
            value={props.angle === "auto" ? angleFloor() : (props.angle ?? 0)}
            onInput={v => props.onAngle(v < 0 ? "auto" : Math.round(v))}
          />
        </Show>
      </div>
    </div>
  );
}

/** The control whole: the button, and its menu floating beneath while open, in the header's corner. */
export function Appearance(props: {
  swatch: string;
  label: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  menu: Omit<AppearanceProps, "floating">;
}) {
  return (
    <span class={styles.control}>
      <AppearanceButton
        swatch={props.swatch}
        label={props.label}
        summary={props.summary}
        open={props.open}
        onToggle={props.onToggle}
        onReset={props.menu.onReset}
      />
      <Show when={props.open}>
        <AppearanceMenu {...props.menu} floating />
      </Show>
    </span>
  );
}
