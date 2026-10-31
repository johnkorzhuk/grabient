import { gradientCss } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { blobStillKey, EFFECT_PLAY } from "@grabient/engine/effect.ts";
import { glassColors, glassStillKey } from "@grabient/engine/glass-colors.ts";
import { t } from "@grabient/i18n";
import { AppearanceButton, styleLabel } from "@grabient/ui/Appearance.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Dynamic } from "@solidjs/web";
import { type Component, createSignal, onSettled, Show } from "solid-js";
import type { SeedPage } from "./address.ts";
import styles from "./Corner.module.css";
import { effectSummary } from "./effect-page.ts";

/* The header's corner on a palette's page, which the frame draws outside the page: the editor open now hands in its
   own corner while it is mounted, so the corner's code comes with the editor's. Written only in the browser. */
const [corner, setCorner] = createSignal<Component | null>(null);

/** The calling editor's corner is the header's from when it has settled until it unmounts. */
export function holdCorner(own: Component) {
  onSettled(() => {
    setCorner(() => own);
    return () => setCorner(null);
  });
}

/** The corner the route names for the frame: the open editor's, and before one is open the same presses over the
    address's palette, still, so the header is whole from the first paint and nothing in it moves as the editor takes
    them over. */
export function EditorCorner(props: { page?: SeedPage }) {
  return (
    <Show
      when={corner()}
      fallback={<Show when={props.page}>{page => <Still page={page()} />}</Show>}
    >
      {open => <Dynamic component={open()} />}
    </Show>
  );
}

/** Whether an editor is open: the page then pins its stops along the foot of the screen. */
export const editing = (): boolean => corner() !== null;

/* the panel's press and the appearance's button as Corner.tsx draws them at rest, the side open: the fluted glass or
   the blob where the address names it; the palette as saved where it names a gradient; and where it names no style,
   both, the one this browser chose showing (effects.ts marks <html> before the first paint) */
function Still(props: { page: SeedPage }) {
  const hexes = () => sampleStops(props.page.palette, props.page.view.steps).map(s => s.hex);
  const swatch = () => gradientCss(hexes(), props.page.view.style, props.page.view.angle);
  const glassButton = () => (
    <AppearanceButton
      swatch="transparent"
      swatchArt={
        /* the server's still, which the head's style paints into any holder that names it */
        <span
          class={styles.swatchStill}
          data-glass-still={glassStillKey(glassColors(props.page.palette), props.page.view.angle)}
        />
      }
      label={t("Fluted glass")}
      summary={effectSummary(props.page.effect ?? EFFECT_PLAY, null)}
      open={false}
      onToggle={() => {}}
    />
  );
  /* the blob's swatch is the server's still too (server/blob-still.ts), as the editor's swatch is (BlobArt.tsx) */
  const blobButton = (look: NonNullable<SeedPage["effect"]>["look"]) => (
    <AppearanceButton
      swatch="transparent"
      swatchArt={
        <span class={styles.swatchStill} data-blob-still={blobStillKey(props.page.seed, look)} />
      }
      label={t("Blob")}
      summary={effectSummary(props.page.effect ?? EFFECT_PLAY, null)}
      open={false}
      onToggle={() => {}}
    />
  );
  const named = () => {
    const effect = props.page.effect;
    return effect?.kind === "glass"
      ? glassButton()
      : effect?.kind === "blob"
        ? blobButton(effect.look)
        : savedButton();
  };
  const savedButton = () => (
    <AppearanceButton
      swatch={swatch()}
      label={styleLabel("auto")}
      open={false}
      onToggle={() => {}}
    />
  );
  return (
    <span class={styles.still} inert>
      <span class={styles.desk}>
        <Button icon size="lg" aria-label={t("Hide panel")}>
          <Icon name="panel" size={15} />
        </Button>
      </span>
      <Show when={!props.page.styled} fallback={named()}>
        <span class={styles.glassOn}>{glassButton()}</span>
        <span class={styles.glassOff}>{savedButton()}</span>
      </Show>
    </span>
  );
}
