import { t } from "@grabient/ui/i18n.ts";
import { Segmented, type SegmentedOption } from "@grabient/ui/Segmented.tsx";
import { createSignal, untrack } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells } from "../../doc/Specimen.tsx";
import styles from "./Segments.module.css";

/* A choice of two at the field height, the same in a row of tools, a choice that says what it is set to, and one with
   glyphs. Each is live. */
function Live(props: {
  options: readonly SegmentedOption[];
  value: string;
  label: string;
  size?: "sm";
}) {
  const [value, setValue] = createSignal(untrack(() => props.value));
  return (
    <span class={styles.fill} data-size={props.size}>
      <Segmented
        options={props.options}
        value={value()}
        size={props.size}
        aria-label={props.label}
        onChange={setValue}
      />
    </span>
  );
}

export function Segments() {
  return (
    <Section
      id="segmented"
      summary="A few choices that are one setting, all in view, the chosen one in ink."
    >
      <Block title="Variants">
        <Cells min={260}>
          <Cell caption="two choices">
            <Live
              label={t("What to export")}
              value="selection"
              options={[
                { value: "palette", label: t("This palette") },
                { value: "selection", label: t("Selection") }
              ]}
            />
          </Cell>
          <Cell caption="sm · in a row of tools">
            <Live
              size="sm"
              label="Where"
              value="everywhere"
              options={[
                { value: "everywhere", label: t("Everywhere") },
                { value: "gallery", label: t("Gallery only") }
              ]}
            />
          </Cell>
          <Cell caption="detail · what a choice is set to">
            <Live
              label="Order"
              value="rising"
              options={[
                { value: "popular", label: t("Popular", { $context: "order" }) },
                {
                  value: "rising",
                  label: t("Rising", { $context: "order" }),
                  detail: t("1w", { $context: "frame" }),
                  forms: ["1w", "3m", "1y"].map(form => t(form, { $context: "frame" })),
                  name: t("Rising, 1 week")
                },
                { value: "saved", label: t("Saved", { $context: "order" }) }
              ]}
            />
          </Cell>
          <Cell caption="icon · a glyph before the word">
            <Live
              label={t("Theme")}
              value="system"
              options={[
                { value: "system", label: t("System"), icon: "monitor" },
                { value: "light", label: t("Light"), icon: "sun" },
                { value: "dark", label: t("Dark"), icon: "moon" }
              ]}
            />
          </Cell>
        </Cells>
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Four choices at most; more, or a choice that need not stay in view, is a Select.",
            "Choices that are pages render as links, as the header of this document does.",
            "A choice may say what it is set to after its name: short, at its size, lighter and quieter.",
            "A radio group: one Tab stop, walked by the arrows."
          ]}
        />
      </Block>
    </Section>
  );
}
