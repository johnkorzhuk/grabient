import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Rule } from "@grabient/ui/Rule.tsx";
import { Text, type TextVariant } from "@grabient/ui/Text.tsx";
import { createSignal, For, onSettled } from "solid-js";
import { type Mark, Redlines, watch } from "../../doc/Redlines.tsx";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { tokenValue } from "../../doc/tokens.ts";
import styles from "./Type.module.css";

/* The three families, every Text variant with the metrics the browser gives it, and the one alignment a row of
   controls relies on, measured off a real button. */
const FAMILIES = [
  {
    token: "font.sans",
    note: "loaded",
    variant: "body",
    sample: "Poppins sets everything written."
  },
  {
    token: "font.system",
    note: "system",
    variant: "lede",
    sample: "Manage your profile. 0123456789"
  },
  { token: "font.mono", note: "system", variant: "mono", sample: "#ffd25f kY4mpDazO color.ink" }
] as const;

const SAMPLES: Record<TextVariant, string> = {
  title: "Settings",
  h2: "Privacy",
  h3: "Profile",
  lede: "Profile, account and privacy.",
  body: "Grabient computes a gradient from keyframes: 2 to 8 colors with a smooth curve drawn through them.",
  ui: "Save your favorite palettes.",
  small: "JPG, PNG or WebP. Up to 5MB.",
  caption: "Top: 210° to 330°. Bottom: 210° to 690°.",
  micro: "Recent messages",
  num: "1440 × 900 · 256 × 256 · 16.7%",
  mono: "kY4mpDazO-mUuu_fuLqXU49dvVP6 · #ffd25f"
};
const VARIANTS = Object.keys(SAMPLES) as TextVariant[];
const INKS = ["ink", "ink2", "ink3", "ink4", "danger"] as const;

/* What the browser draws a sample with, in the tokens' own terms: family where it is not Poppins, size over line
   height, weight, tracking in em, case, figures, and the ink by its token's name. A variant that takes its line's
   ink follows a color set on its host for a moment; one with its own does not. */
function metrics(host: HTMLElement, inks: ReadonlyMap<string, string>): string {
  const sample = host.firstElementChild as HTMLElement;
  host.style.color = "rgb(1, 2, 3)";
  const s = getComputedStyle(sample);
  const inherits = s.color === "rgb(1, 2, 3)";
  host.style.removeProperty("color");
  const size = Number.parseFloat(s.fontSize);
  const family = /^"?Poppins/.test(s.fontFamily)
    ? null
    : s.fontFamily.startsWith("ui-monospace")
      ? "mono"
      : "system";
  const line = +(Number.parseFloat(s.lineHeight) / size).toFixed(2);
  const track = Number.parseFloat(s.letterSpacing);
  return [
    family,
    `${size} / ${line}`,
    s.fontWeight,
    track ? `${+(track / size).toFixed(3)}em` : null,
    s.textTransform === "none" ? null : s.textTransform,
    s.fontVariantNumeric === "normal" ? null : s.fontVariantNumeric,
    inherits ? "its line's ink" : inks.get(s.color)
  ]
    .filter(Boolean)
    .join(" · ");
}

function Variants() {
  let table!: HTMLDivElement;
  const [measured, setMeasured] = createSignal<Record<string, string>>({});
  onSettled(() => {
    const measure = () => {
      const probes = table.querySelectorAll<HTMLElement>("[data-ink]");
      const inks = new Map([...probes].map(p => [getComputedStyle(p).color, p.dataset.ink ?? ""]));
      const rows = table.querySelectorAll<HTMLElement>("[data-variant-sample]");
      setMeasured(
        Object.fromEntries(
          [...rows].map(row => [row.dataset.variantSample ?? "", metrics(row, inks)])
        )
      );
    };
    return watch(table, measure);
  });
  return (
    <Pane variant="paper" padding="md">
      <div ref={table} class={styles.rows}>
        <span class={styles.probes} aria-hidden="true">
          <For each={INKS}>
            {ink => <span data-ink={ink} style={{ color: `var(--color-${ink})` }} />}
          </For>
        </span>
        <For each={VARIANTS}>
          {(variant, i) => (
            <>
              {i() > 0 && <Rule />}
              <div class={styles.row}>
                <Text variant="mono" strong>
                  {variant}
                </Text>
                <span class={styles.sample} data-variant-sample={variant}>
                  <Text variant={variant} as="span">
                    {SAMPLES[variant]}
                  </Text>
                </span>
                <Text variant="mono">{measured()[variant] ?? ""}</Text>
              </div>
            </>
          )}
        </For>
      </div>
    </Pane>
  );
}

/* A label and its count on one control: the digits are trimmed to their cap height, so centering them centers the
   digits themselves, as Poppins at a line height of 1 centers its own capitals. The guides are measured off the
   count. */
function CapHeight() {
  let host!: HTMLDivElement;
  let count!: HTMLSpanElement;
  const [marks, setMarks] = createSignal<Mark[]>([]);
  onSettled(() =>
    watch(host, () => {
      const box = host.getBoundingClientRect();
      const digits = (count.firstElementChild ?? count).getBoundingClientRect();
      const end = box.width - 96;
      setMarks([
        {
          x1: 0,
          y1: digits.top - box.top,
          x2: end,
          y2: digits.top - box.top,
          label: "cap height",
          guide: true
        },
        {
          x1: 0,
          y1: digits.bottom - box.top,
          x2: end,
          y2: digits.bottom - box.top,
          label: "baseline",
          guide: true
        }
      ]);
    })
  );
  return (
    <div ref={host} class={styles.cap}>
      <span class={styles.zoom}>
        <Button variant="primary" size="lg">
          <Icon name="grid" size={14} />
          Selection
          <span ref={count} class={styles.count}>
            <Text variant="num">3</Text>
          </span>
        </Button>
      </span>
      <Redlines marks={marks()} />
    </div>
  );
}

export function Type() {
  return (
    <Section id="type" summary="Words in Poppins, values in the system stack, code in mono.">
      <Pane variant="paper" padding="md">
        <div class={styles.rows}>
          <For each={FAMILIES}>
            {(family, i) => (
              <>
                {i() > 0 && <Rule />}
                <div class={styles.family}>
                  <span class={styles.name}>
                    <Text variant="mono" strong>
                      {family.token}
                    </Text>
                    <Text variant="small">{family.note}</Text>
                  </span>
                  <Text variant={family.variant}>{family.sample}</Text>
                  <Text variant="mono">{tokenValue(family.token)}</Text>
                </div>
              </>
            )}
          </For>
        </div>
      </Pane>
      <Block title="Variants">
        <Variants />
      </Block>
      <Block title="One line of controls">
        <CapHeight />
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Every piece of type is a Text variant. Never set font properties on an element.",
            "Poppins loads in 500 and 700 only; a 600 renders as 700.",
            "Digits that carry a value are num; code, hex and seeds are mono."
          ]}
        />
      </Block>
    </Section>
  );
}
