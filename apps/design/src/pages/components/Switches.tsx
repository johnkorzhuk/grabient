import { t } from "@grabient/ui/i18n.ts";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Rule } from "@grabient/ui/Rule.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createSignal, createUniqueId, type Element, For } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import styles from "./Switches.module.css";

/* Switches as Settings sets them: a row's title, the one line that says what On allows, and the switch at its end.
   The first two are live; the third waits for its second press, as a switch that reaches every visitor does. */
const ROWS = [
  { title: t("Analytics"), line: t("Google Analytics measures how Grabient is used."), on: true },
  {
    title: t("Newsletter"),
    line: t("Rising palettes and new features, about once a month."),
    on: false
  }
];

function Row(props: { title: string; line: string; children: (id: string) => Element }) {
  const id = createUniqueId();
  return (
    <div class={styles.row}>
      <div class={styles.words}>
        <Text variant="ui" strong id={id}>
          {props.title}
        </Text>
        <Text variant="small">{props.line}</Text>
      </div>
      {props.children(id)}
    </div>
  );
}

export function Switches() {
  return (
    <Section id="switch" summary="A button that reads On or Off and applies at once.">
      <Pane variant="paper" padding="md">
        <div class={styles.rows}>
          <For each={ROWS}>
            {row => {
              const [on, setOn] = createSignal(row.on);
              return (
                <>
                  <Row title={row.title} line={row.line}>
                    {id => <Switch checked={on()} aria-labelledby={id} onChange={setOn} />}
                  </Row>
                  <Rule />
                </>
              );
            }}
          </For>
          <Row title={t("Search by meaning")} line={t("Press again to turn off for everyone.")}>
            {id => (
              <Switch checked armed={t("Turn off")} aria-labelledby={id} onChange={() => {}} />
            )}
          </Row>
        </div>
      </Pane>
      <Block title="Rules">
        <Rules
          rules={[
            "The word is the state: no track, no knob, no fill.",
            "One line under the row's title says what On allows.",
            "A switch that reaches every visitor confirms on itself: two presses within four seconds.",
            "A switch role with aria-checked, named by its row's title."
          ]}
        />
      </Block>
    </Section>
  );
}
