import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { font, size, space } from "@grabient/ui/tokens.ts";
import { For } from "solid-js";
import { cardTools, sampleName } from "../../doc/cards.tsx";
import { Legend, Pin } from "../../doc/Pins.tsx";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import table from "../../doc/Table.module.css";
import { hexes, POPULAR } from "../../samples.ts";
import styles from "./Layout.module.css";

/* Where the layout changes, the widths it is built on as rulers to one scale, and the corners a picture keeps its
   tools in. */
const QUERIES = [
  ["@container page (max-width: 960px)", `the header tightens · wordmark ${size.logoPhone}`],
  ["@container page (max-width: 800px)", `the brand frame stacks · panes pad ${space.s6}`],
  ["@container page (max-width: 600px)", "tabs scroll sideways · words give way to glyphs"],
  ["@media (pointer: coarse)", `targets ${size.touch} · inputs ${font.fsTouch}`]
] as const;
const RULERS = [
  ["frame", "brand frame"],
  ["prose", "reading measure"],
  ["sheet", "sign-in sheet"],
  ["navCol", "navigation"],
  ["gutter", "gutter"]
] as const;
const HEIGHTS = [
  ["top", "header"],
  ["topBrand", "brand header"]
] as const;
const CARD = POPULAR[0];

export function Layout() {
  return (
    <Section
      id="layout"
      summary="One page scroller, one gutter, and breakpoints as container queries on the page."
    >
      <Pane variant="paper" padding="md">
        <table class={table.table}>
          <thead>
            <tr>
              <th class={table.head} scope="col">
                <Text variant="micro">Query</Text>
              </th>
              <th class={table.head} scope="col">
                <Text variant="micro">What changes</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            <For each={QUERIES}>
              {([query, change]) => (
                <tr>
                  <td class={table.cell}>
                    <Text variant="mono" strong>
                      {query}
                    </Text>
                  </td>
                  <td class={table.cell}>
                    <Text variant="ui">{change}</Text>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Pane>
      <div class={styles.pair}>
        <Pane variant="paper" padding="md">
          <div class={styles.rulers}>
            <For each={RULERS}>
              {([name, use]) => (
                <div class={styles.ruler}>
                  <Text variant="small">{use}</Text>
                  <span class={styles.track}>
                    <span
                      class={styles.span}
                      style={{ width: `${(size[name] / size.frame) * 100}%` }}
                    />
                    <Text variant="mono">{size[name]}</Text>
                  </span>
                </div>
              )}
            </For>
            <For each={HEIGHTS}>
              {([name, use]) => (
                <div class={styles.ruler}>
                  <Text variant="small">{`${use} height`}</Text>
                  <Text variant="mono">{size[name]}</Text>
                </div>
              )}
            </For>
          </div>
        </Pane>
        <div class={styles.corners}>
          <div class={styles.card}>
            <PaletteCard
              seed={CARD.seed}
              name={sampleName(CARD)}
              stops={hexes(CARD.seed, CARD.steps)}
              style={CARD.style}
              angle={CARD.angle}
              href={`/${CARD.seed}`}
              similar={{ href: `/palettes?q=${CARD.seed}` }}
              age="12 days"
              likes={CARD.likes}
              state="hover"
              tools={cardTools}
            />
            <Pin n={1} left="0%" top="0px" />
            <Pin n={2} left="100%" top="0px" />
            <Pin n={3} left="100%" top={`${size.card}px`} />
          </div>
          <Legend labels={["Edit, similar palettes", "Add to selection", "Copy, download, link"]} />
        </div>
      </div>
      <Block title="Rules">
        <Rules
          rules={[
            "Every breakpoint is a container query on page, so a frame lays out as a window would.",
            "Nothing spills past its box: names give way before icons, a wrap before a cut.",
            "A row of controls is one height: 40px on a page, 32px in a panel, 28px over a picture.",
            "A flow's next step changes the press at hand (Add, then Close, then Save); it never adds one beside it."
          ]}
        />
      </Block>
    </Section>
  );
}
