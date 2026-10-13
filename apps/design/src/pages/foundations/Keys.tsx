import { t } from "@grabient/ui/i18n.ts";
import { KEYMAP } from "@grabient/ui/keymap.ts";
import { showKeys } from "@grabient/ui/keys.ts";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { For } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import table from "../../doc/Table.module.css";

/* The key map as @grabient/ui holds it: the ? list and the Shortcuts page read the same rows, each key as this
   computer shows it. */
export function Keys() {
  return (
    <Section
      id="keys"
      summary="Bare keys, the same on every route. ? lists the keys that work here."
    >
      <Pane variant="paper" padding="md">
        <table class={table.table}>
          <thead>
            <tr>
              <th class={table.head} scope="col">
                <Text variant="micro">Key</Text>
              </th>
              <th class={table.head} scope="col">
                <Text variant="micro">Action</Text>
              </th>
              <th class={table.head} scope="col">
                <Text variant="micro">Where</Text>
              </th>
            </tr>
          </thead>
          <tbody>
            <For each={KEYMAP}>
              {row => (
                <tr>
                  <td class={table.cell}>
                    <Text variant="mono" strong>
                      {showKeys(row.keys)}
                    </Text>
                  </td>
                  <td class={table.cell}>
                    <Text variant="ui">{t(row.label)}</Text>
                  </td>
                  <td class={table.cell}>
                    <Text variant="ui">{row.admin ? `${row.scope}, for admins` : row.scope}</Text>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Pane>
      <Block title="Rules">
        <Rules
          rules={[
            "Never while typing: a field keeps every key.",
            "Every key but ? and Escape can be changed on the Shortcuts page."
          ]}
        />
      </Block>
    </Section>
  );
}
