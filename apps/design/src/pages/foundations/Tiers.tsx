import { Icon } from "@grabient/ui/Icon.tsx";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { For, Match, Switch } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import table from "../../doc/Table.module.css";
import styles from "./Tiers.module.css";

/* Who can use what: a check where the tier has it, sign in where the press leads there, and a dash where the feature
   is absent. */
type Has = "yes" | "sign in" | "no";
const TIERS = ["signed out", "signed in", "admin"] as const;
const FEATURES: readonly (readonly [string, Has, Has, Has])[] = [
  ["Browse and search", "yes", "yes", "yes"],
  ["Editor and export", "yes", "yes", "yes"],
  ["Like", "sign in", "yes", "yes"],
  ["Saved", "sign in", "yes", "yes"],
  ["Save to collection", "sign in", "yes", "yes"],
  ["Profile and account", "sign in", "yes", "yes"],
  ["Publish to everyone", "no", "no", "yes"],
  ["Make public", "no", "no", "yes"]
];

export function Tiers() {
  return (
    <Section
      id="tiers"
      summary="Signed out sees the public site, signed in adds its own things, admin adds publishing."
    >
      <Pane variant="paper" padding="md">
        <table class={[table.table, styles.tiers]}>
          <thead>
            <tr>
              <th class={table.head} scope="col">
                <Text variant="micro">Feature</Text>
              </th>
              <For each={TIERS}>
                {tier => (
                  <th class={[table.head, table.center]} scope="col">
                    <Text variant="mono">{tier}</Text>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={FEATURES}>
              {([feature, ...has]) => (
                <tr>
                  <th class={table.cell} scope="row">
                    <Text variant="ui" strong>
                      {feature}
                    </Text>
                  </th>
                  <For each={has} keyed={false}>
                    {value => (
                      <td class={[table.cell, table.center]}>
                        <Switch>
                          <Match when={value() === "yes"}>
                            <span class={styles.yes} role="img" aria-label="Yes">
                              <Icon name="check" size={16} />
                            </span>
                          </Match>
                          <Match when={value() === "sign in"}>
                            <Text variant="mono">sign in</Text>
                          </Match>
                          <Match when={value() === "no"}>
                            <span class={styles.no} role="img" aria-label="Not shown">
                              <Icon name="minus" size={16} />
                            </span>
                          </Match>
                        </Switch>
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Pane>
      <Block title="Rules">
        <Rules
          rules={[
            "A feature past the viewer's tier is absent or leads to sign in, never a lock, a badge or a disabled control."
          ]}
        />
      </Block>
    </Section>
  );
}
