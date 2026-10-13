import { Label } from "@grabient/ui/Label.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { For } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { colorValue, type Paint, paintOf } from "../../doc/tokens.ts";
import styles from "./Color.module.css";

/* Every color token in both themes. The two boards hold the same names in the same places, so a token reads across
   from one theme to the other, and each board is its theme whatever the page's. */
type Group = "Ink" | "Paper" | "Edges" | "Accent and state" | "Over artwork" | "Shadow and light";
const GROUPS: readonly Group[] = [
  "Ink",
  "Paper",
  "Edges",
  "Accent and state",
  "Over artwork",
  "Shadow and light"
];
/* each paint's board and its job in a few words; a new color token does not compile until it is placed here */
const PAINTS: Record<Paint, readonly [Group, string]> = {
  ink: ["Ink", "text"],
  ink2: ["Ink", "reading"],
  ink3: ["Ink", "labels"],
  ink4: ["Ink", "placeholder"],
  inkHover: ["Ink", "primary hover"],
  onInk: ["Ink", "text on ink"],
  onInk2: ["Ink", "quieter, on ink"],
  bg: ["Paper", "page"],
  sheet: ["Paper", "solid sheet"],
  paper: ["Paper", "quietest surface"],
  paper2: ["Paper", "controls at rest"],
  paper3: ["Paper", "hover, current row"],
  paperSolid: ["Paper", "notes, figures"],
  frost: ["Paper", "sheet over water"],
  glass: ["Paper", "menus"],
  edge: ["Edges", "borders"],
  edge2: ["Edges", "input borders"],
  glassEdge: ["Edges", "menu edge"],
  sheen: ["Edges", "top highlight"],
  ring: ["Edges", "focus"],
  accent: ["Accent and state", "measurement"],
  danger: ["Accent and state", "destructive"],
  like: ["Accent and state", "liked heart"],
  star: ["Accent and state", "the code's stars"],
  art: ["Over artwork", "glass on art"],
  artHover: ["Over artwork", "glass, hovered"],
  artEdge: ["Over artwork", "glass edge"],
  onArt: ["Over artwork", "ink on glass"],
  onLight: ["Over artwork", "on a light chip"],
  onDark: ["Over artwork", "on a dark chip"],
  shadow: ["Shadow and light", "lifted frame"],
  shadowPop: ["Shadow and light", "menus"],
  shadowFrost: ["Shadow and light", "sheets"],
  rim: ["Shadow and light", "cut edge"],
  holeRim: ["Shadow and light", "open bar"],
  dashRule: ["Shadow and light", "the rule"]
};
const inGroup = (group: Group) =>
  (Object.keys(PAINTS) as Paint[]).filter(name => PAINTS[name][0] === group);

function Swatch(props: { name: Paint; theme: "dark" | "light" }) {
  return (
    <div class={styles.swatch}>
      <span class={styles.paint} style={paintOf(props.name)} />
      <Text variant="mono" strong>
        {props.name}
      </Text>
      <Text variant="small">{PAINTS[props.name][1]}</Text>
      <Text variant="mono" truncate>
        {colorValue(props.name, props.theme)}
      </Text>
    </div>
  );
}

export function Color() {
  return (
    <Section id="color" summary="Ink for text, paper for surfaces, edge for borders.">
      <div class={styles.boards}>
        <For each={["dark", "light"] as const}>
          {theme => (
            <div class={styles.board} data-theme={theme}>
              <Label>{theme === "dark" ? "Dark theme" : "Light theme"}</Label>
              <For each={GROUPS}>
                {group => (
                  <div class={styles.group}>
                    <Text variant="small">{group}</Text>
                    <div class={styles.swatches}>
                      <For each={inGroup(group)}>
                        {name => <Swatch name={name} theme={theme} />}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
      <Block title="Rules">
        <Rules
          rules={[
            "Color tokens only, never a hex, rgb or hsl literal.",
            "Accent marks measurement and danger marks destruction; neither fills a button."
          ]}
        />
      </Block>
    </Section>
  );
}
