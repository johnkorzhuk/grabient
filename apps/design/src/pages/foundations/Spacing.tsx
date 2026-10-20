import { Field } from "@grabient/ui/Field.tsx";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { space } from "@grabient/ui/tokens.ts";
import { createSignal, For, onSettled } from "solid-js";
import { type Mark, Redlines, watch } from "../../doc/Redlines.tsx";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import styles from "./Spacing.module.css";

/* The scale as bars, and a settings form with its spacing measured off it: the pane's padding, between fields, and
   between groups. */
const STEPS = Object.entries(space);

function Form() {
  let host!: HTMLDivElement;
  let form!: HTMLDivElement;
  let first!: HTMLDivElement;
  let second!: HTMLDivElement;
  const [marks, setMarks] = createSignal<Mark[]>([]);
  onSettled(() =>
    watch(host, () => {
      const o = host.getBoundingClientRect();
      const surface = (host.firstElementChild as HTMLElement).getBoundingClientRect();
      const inner = form.getBoundingClientRect();
      const fields = [...first.querySelectorAll<HTMLElement>(":scope > div")].map(el =>
        el.getBoundingClientRect()
      );
      const groupA = first.getBoundingClientRect();
      const groupB = second.getBoundingClientRect();
      const [a, b] = fields;
      if (!a || !b) return;
      const x = (v: number) => v - o.left;
      const y = (v: number) => v - o.top;
      const at = inner.left + inner.width * 0.62;
      setMarks([
        {
          x1: x(inner.left + inner.width / 2),
          y1: y(surface.top + 1),
          x2: x(inner.left + inner.width / 2),
          y2: y(inner.top),
          label: `${Math.round(inner.top - surface.top - 1)}`
        },
        {
          x1: x(surface.left + 1),
          y1: y(a.bottom - 20),
          x2: x(inner.left),
          y2: y(a.bottom - 20),
          label: `${Math.round(inner.left - surface.left - 1)}`
        },
        {
          x1: x(at),
          y1: y(a.bottom),
          x2: x(at),
          y2: y(b.top),
          label: `${Math.round(b.top - a.bottom)}`
        },
        {
          x1: x(at),
          y1: y(groupA.bottom),
          x2: x(at),
          y2: y(groupB.top),
          label: `${Math.round(groupB.top - groupA.bottom)}`
        }
      ]);
    })
  );
  return (
    <div ref={host} class={styles.host}>
      <Pane variant="paper" padding="lg">
        <div ref={form} class={styles.form}>
          <div ref={first} class={styles.group}>
            <Text variant="h3">Profile</Text>
            <Field label="Display name" name="spacing-username" value="ada" />
            <Field label="Email" name="spacing-email" type="email" value="ada@example.com" />
          </div>
          <div ref={second} class={styles.group}>
            <Text variant="h3">Privacy</Text>
            <div class={styles.setting}>
              <Text variant="ui">Analytics</Text>
              <Switch checked aria-label="Analytics" onChange={() => {}} />
            </div>
          </div>
        </div>
      </Pane>
      <Redlines marks={marks()} />
    </div>
  );
}

export function Spacing() {
  return (
    <Section id="spacing" summary="Ten steps on a 4px base, for gap and padding.">
      <div class={styles.pair}>
        <Pane variant="paper" padding="md">
          <div class={styles.bars}>
            <For each={STEPS}>
              {([name, px]) => (
                <div class={styles.step}>
                  <Text variant="mono" strong>
                    {name}
                  </Text>
                  <Text variant="mono">{`${px}px`}</Text>
                  <span class={styles.bar} style={{ width: `${px}px` }} />
                </div>
              )}
            </For>
          </div>
        </Pane>
        <Form />
      </div>
      <Block title="Rules">
        <Rules
          rules={[
            "Space siblings with gap, never margins: 16px between fields, 32px between sections."
          ]}
        />
      </Block>
    </Section>
  );
}
