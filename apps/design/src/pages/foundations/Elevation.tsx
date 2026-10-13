import { gradientCss } from "@grabient/engine/css.ts";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { size } from "@grabient/ui/tokens.ts";
import { For } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Tokens } from "../../doc/Tokens.tsx";
import { hexes, POPULAR } from "../../samples.ts";
import styles from "./Elevation.module.css";

/* The three surfaces, each the real Pane, over a palette in hard bands dimmed toward the page, as the water is, so the
   frost's and the glass's blur can be seen at their edges. */
const SURFACES = [
  {
    variant: "frost",
    use: "Sheets over the water",
    paint: `frost · shadowFrost · blur ${size.blurFrost}`
  },
  { variant: "paper", use: "Figures and notes", paint: "paperSolid · edge" },
  {
    variant: "glass",
    use: "Menus and popovers",
    paint: `glass · glassEdge · shadowPop · blur ${size.blurGlass}`
  }
] as const;
const BANDS = gradientCss(hexes(POPULAR[1].seed, 9), "linearSwatches", 90);

export function Elevation() {
  return (
    <Section
      id="elevation"
      summary="Three surfaces: frost, paper and glass. Shadows are deep and soft."
    >
      <div class={styles.stage} style={{ "--bands": BANDS }}>
        <For each={SURFACES}>
          {surface => (
            <Pane variant={surface.variant} padding="md">
              <div class={styles.words}>
                <Text variant="h3">{surface.variant}</Text>
                <Text variant="small">{surface.use}</Text>
                <Text variant="mono">{surface.paint}</Text>
              </div>
            </Pane>
          )}
        </For>
      </div>
      <Block title="Tokens">
        <Tokens
          paths={[
            "color.frost",
            "color.paperSolid",
            "color.glass",
            "color.edge",
            "color.glassEdge",
            "color.shadowFrost",
            "color.shadowPop",
            "size.blurFrost",
            "size.blurGlass"
          ]}
        />
      </Block>
      <Block title="Rules">
        <Rules rules={["Frost has no border; paper and glass carry a 1px edge."]} />
      </Block>
    </Section>
  );
}
