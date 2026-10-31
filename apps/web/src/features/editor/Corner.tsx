import { gradientCss } from "@grabient/engine/css.ts";
import { blobStillKey } from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import { msg, t } from "@grabient/i18n";
import {
  APPEARANCE_OPTIONS,
  Appearance,
  type ExtraTile,
  styleLabel
} from "@grabient/ui/Appearance.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createSignal, Loading, lazy, Show } from "solid-js";
import styles from "./Corner.module.css";
import type { PaletteEditor } from "./editor.ts";
import { effectLabel, effectSummary } from "./effect-page.ts";
import { shapeOf } from "./effects.ts";
import { GlassArt } from "./GlassArt.tsx";
import { loadStill } from "./glass-draw.ts";
import { keyOf } from "./keys.ts";

/** The side's panel: shown or put away. */
export interface Panel {
  open: () => boolean;
  toggle: () => void;
}

/** The header's corner on a palette's page: the press that puts the side away and brings it back, named for what it
    does now, and how the palette is drawn. While an effect plays it reads the effect's name, its tile chosen and its
    fields in Steps and Angle's place (the glass keeps Angle); otherwise As saved with no tile chosen and Steps and
    Angle on Auto until the reader sets one. A style, steps, an angle or an effect set here is the reader's, and goes
    for every palette the page draws; each keeps its settings while another shows, and Reset gives the page back as it
    opened. */
/* the effects' fields and the blob's picture come with the menu or the blob, never with the editor's first load */
const BlobArt = lazy(() => import("./BlobArt.tsx").then(m => ({ default: m.BlobArt })));
const BlobFields = lazy(() => import("./BlobControls.tsx").then(m => ({ default: m.BlobFields })));
const EffectFields = lazy(() =>
  import("./GlassControls.tsx").then(m => ({ default: m.EffectFields }))
);

export function Corner(props: { editor: PaletteEditor; panel: Panel }) {
  const e = props.editor;
  const fx = e.effects;
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
  /* the button's name and what it adds: the effect playing, otherwise the style */
  const label = () => {
    const kind = fx.kind();
    return kind ? effectLabel(kind) : styleLabel(set().style ? e.style() : "auto");
  };
  const said = () => {
    const kind = fx.kind();
    return kind ? effectSummary(fx.settings(kind), set().angle ? e.angle() : null) : summary();
  };
  const colors = () => glassColors(e.palette());
  /* the blob as it would play: its shape the palette's own suggestion until one is set */
  const blob = () => {
    const s = fx.settings("blob");
    return s.look.shape === null ? { ...s, look: { ...s.look, shape: shapeOf(e.seed()) } } : s;
  };
  /* the effects' pictures, made once: the swatches and the menu's tiles */
  const glassSwatch = <GlassArt colors={colors()} angle={e.angle()} />;
  /* while the blob's picture loads, the server's still stands in its place, as on the first screen (EditorCorner.tsx) */
  const blobHeld = () => (
    <span class={styles.swatchStill} data-blob-still={blobStillKey(e.seed(), blob().look)} />
  );
  const blobSwatch = (
    <Loading fallback={blobHeld()}>
      <BlobArt palette={e.palette()} settings={blob()} />
    </Loading>
  );
  const extras: readonly ExtraTile[] = [
    {
      key: "glass",
      label: t("Fluted glass"),
      art: <GlassArt colors={colors()} angle={e.angle()} />,
      get chosen() {
        return fx.kind() === "glass";
      },
      onChoose: () => {
        e.clearPeek();
        fx.choose("glass");
      }
    },
    {
      key: "blob",
      label: t("Blob"),
      art: (
        <Loading>
          <BlobArt palette={e.palette()} settings={blob()} />
        </Loading>
      ),
      get chosen() {
        return fx.kind() === "blob";
      },
      onChoose: () => {
        e.clearPeek();
        fx.choose("blob");
      }
    }
  ];
  const fields = (
    <Loading>
      <Show when={fx.kind() === "blob"} fallback={<EffectFields editor={e} kind="glass" />}>
        <BlobFields editor={e} />
      </Show>
    </Loading>
  );
  const panelName = () => t(props.panel.open() ? msg("Hide panel") : msg("Show panel"));
  return (
    <>
      <span class={styles.desk}>
        <Button
          icon
          size="lg"
          turns
          aria-label={panelName()}
          tip={`${panelName()} · ${keyOf("panel")}`}
          onClick={props.panel.toggle}
        >
          <Icon name="panel" size={15} />
        </Button>
      </span>
      <Appearance
        swatch={fx.kind() ? "transparent" : gradientCss(paint(), e.style(), e.angle())}
        swatchArt={
          fx.kind() === "glass" ? glassSwatch : fx.kind() === "blob" ? blobSwatch : undefined
        }
        label={label()}
        summary={said()}
        open={open()}
        onToggle={() => {
          e.clearPeek();
          /* an effect's tile may be pressed: its still's code comes first, and the effects' fields */
          void loadStill();
          void import("./blob-draw.ts").then(m => m.loadBlob());
          void EffectFields.preload();
          setOpen(!open());
        }}
        menu={{
          options: APPEARANCE_OPTIONS,
          auto: true,
          style: fx.kind() ? "auto" : set().style ? e.style() : "auto",
          steps: set().steps ? e.steps() : "auto",
          angle: set().angle ? e.angle() : "auto",
          stepsMin: Math.max(3, e.K()),
          bg: style => gradientCss(paint(), style, e.angle()),
          onStyle: style => {
            e.clearPeek();
            fx.choose(null);
            if (style === "auto") e.letViewGo("style");
            else e.setStyle(style);
          },
          onSteps: v => (v === "auto" ? e.letViewGo("steps") : e.setSteps(v)),
          onAngle: v => (v === "auto" ? e.letViewGo("angle") : e.setAngle(v)),
          onPeek: style => e.peekStyle(style),
          onReset:
            set().style || set().steps || set().angle || fx.changed()
              ? () => {
                  e.clearPeek();
                  e.letViewGo();
                }
              : undefined,
          extras,
          extraFields: fields,
          onClose: () => {
            e.clearPeek();
            setOpen(false);
          }
        }}
      />
    </>
  );
}
