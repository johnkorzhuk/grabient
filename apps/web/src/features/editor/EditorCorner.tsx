import { gradientCss } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { t } from "@grabient/i18n";
import { AppearanceButton, styleLabel } from "@grabient/ui/Appearance.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Dynamic } from "@solidjs/web";
import { type Component, createSignal, onSettled, Show } from "solid-js";
import type { SeedPage } from "./address.ts";
import styles from "./Corner.module.css";

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

/* the panel's press and the appearance's button as Corner.tsx draws them at rest: the palette as saved, the side open */
function Still(props: { page: SeedPage }) {
  const swatch = () =>
    gradientCss(
      sampleStops(props.page.palette, props.page.view.steps).map(s => s.hex),
      props.page.view.style,
      props.page.view.angle
    );
  return (
    <span class={styles.still} inert>
      <span class={styles.desk}>
        <Button icon size="lg" aria-label={t("Hide panel")}>
          <Icon name="panel" size={15} />
        </Button>
      </span>
      <AppearanceButton
        swatch={swatch()}
        label={styleLabel("auto")}
        open={false}
        onToggle={() => {}}
      />
    </span>
  );
}
