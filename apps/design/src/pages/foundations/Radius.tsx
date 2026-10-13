import { Button } from "@grabient/ui/Button.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { radius } from "@grabient/ui/tokens.ts";
import { For } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Verdict, Verdicts } from "../../doc/Specimen.tsx";
import styles from "./Radius.module.css";

/* The three radii and the circle, each on a box, then the one shape the system never takes. */
const USE: Record<keyof typeof radius, string> = {
  tight: "tools over artwork",
  control: "controls",
  surface: "panes, cards, menus",
  circle: "round things only"
};

export function Radius() {
  return (
    <Section id="radius" summary="Three radii and a circle. Nothing is a pill.">
      <div class={styles.radii}>
        <For each={Object.keys(USE) as (keyof typeof radius)[]}>
          {name => (
            <div class={styles.radius}>
              <span
                class={styles.box}
                data-circle={name === "circle" ? "" : undefined}
                style={{ "border-radius": `var(--radius-${name})` }}
              />
              <Text variant="mono" strong>{`${name} · ${radius[name]}px`}</Text>
              <Text variant="small">{USE[name]}</Text>
            </div>
          )}
        </For>
      </div>
      <Block title="Rules">
        <Verdicts pair>
          <Verdict ok caption="The control radius.">
            <Button variant="primary" size="lg">
              Save
            </Button>
          </Verdict>
          <Verdict caption="A button rounded into a pill.">
            <span class={styles.pill}>
              <Button variant="primary" size="lg">
                Save
              </Button>
            </span>
          </Verdict>
        </Verdicts>
        <Rules rules={["A button and the field beside it share the control radius."]} />
      </Block>
    </Section>
  );
}
