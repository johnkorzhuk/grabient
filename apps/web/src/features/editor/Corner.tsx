import { gradientCss } from "@grabient/engine/css.ts";
import { msg, t } from "@grabient/i18n";
import { APPEARANCE_OPTIONS, Appearance, styleLabel } from "@grabient/ui/Appearance.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createSignal } from "solid-js";
import styles from "./Corner.module.css";
import type { PaletteEditor } from "./editor.ts";
import { keyOf } from "./keys.ts";

/** The side's panel: shown or put away. */
export interface Panel {
  open: () => boolean;
  toggle: () => void;
}

/** The header's corner on a palette's page: the press that puts the side away and brings it back, and how the palette
    is drawn. It reads As saved with no tile chosen and Steps and Angle on Auto until the reader sets one; a style,
    steps or an angle set here is the reader's, and goes for every palette the page draws. */
export function Corner(props: { editor: PaletteEditor; panel: Panel }) {
  const e = props.editor;
  const [open, setOpen] = createSignal(false);
  const paint = () => e.stops().map(s => s.paint ?? s.hex);
  const set = () => e.opened().set;
  const summary = () =>
    [
      ...(set().steps
        ? [t("{count, plural, one {# step} other {# steps}}", { count: e.steps() })]
        : []),
      ...(set().angle ? [`${e.angle()}°`] : [])
    ].join(" · ");
  const panelName = () => t(props.panel.open() ? msg("Hide panel") : msg("Show panel"));
  return (
    <>
      <span class={styles.desk}>
        <Button
          icon
          size="lg"
          turns
          aria-pressed={props.panel.open()}
          aria-label={panelName()}
          tip={`${panelName()} · ${keyOf("panel")}`}
          onClick={props.panel.toggle}
        >
          <Icon name="panel" size={15} />
        </Button>
      </span>
      <Appearance
        swatch={gradientCss(paint(), e.style(), e.angle())}
        label={styleLabel(set().style ? e.style() : "auto")}
        summary={summary()}
        open={open()}
        onToggle={() => {
          e.clearPeek();
          setOpen(!open());
        }}
        menu={{
          options: APPEARANCE_OPTIONS,
          auto: true,
          style: set().style ? e.style() : "auto",
          steps: set().steps ? e.steps() : "auto",
          angle: set().angle ? e.angle() : "auto",
          stepsMin: Math.max(3, e.K()),
          bg: style => gradientCss(paint(), style, e.angle()),
          onStyle: style => {
            e.clearPeek();
            if (style === "auto") e.letViewGo("style");
            else e.setStyle(style);
          },
          onSteps: v => (v === "auto" ? e.letViewGo("steps") : e.setSteps(v)),
          onAngle: v => (v === "auto" ? e.letViewGo("angle") : e.setAngle(v)),
          onPeek: style => e.peekStyle(style),
          onReset:
            set().style || set().steps || set().angle
              ? () => {
                  e.clearPeek();
                  e.letViewGo();
                }
              : undefined,
          onClose: () => {
            e.clearPeek();
            setOpen(false);
          }
        }}
      />
    </>
  );
}
