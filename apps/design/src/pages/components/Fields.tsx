import { STYLE_LABELS, STYLES } from "@grabient/engine/view.ts";
import { Field } from "@grabient/ui/Field.tsx";
import { t } from "@grabient/ui/i18n.ts";
import { Select } from "@grabient/ui/Select.tsx";
import { Textarea } from "@grabient/ui/Textarea.tsx";
import { createSignal } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells } from "../../doc/Specimen.tsx";
import styles from "./Fields.module.css";

/* The text field in each of its states, its many-line form, and the select that stands among fields. */
const STYLE_OPTIONS = STYLES.map(style => ({ value: style, label: t(STYLE_LABELS[style]) }));

export function Fields() {
  const [style, setStyle] = createSignal("linearGradient");
  return (
    <Section id="field" summary="A labeled 40px text input with a reserved help line.">
      <Block title="States">
        <Cells min={260}>
          <Cell caption="empty" column>
            <span class={styles.fill}>
              <Field
                label={t("Email")}
                name="field-empty"
                type="email"
                placeholder={t("name@example.com")}
              />
            </span>
          </Cell>
          <Cell caption="help" column>
            <span class={styles.fill}>
              <Field
                label={t("Display name")}
                name="field-help"
                value="ada"
                help={t("Letters, numbers, underscores and hyphens.")}
              />
            </span>
          </Cell>
          <Cell caption="invalid" column>
            <span class={styles.fill}>
              <Field
                label={t("Display name")}
                name="field-invalid"
                value="ada!"
                invalid
                help={t("Use letters, numbers, underscores and hyphens.")}
              />
            </span>
          </Cell>
          <Cell caption="disabled" column>
            <span class={styles.fill}>
              <Field label={t("Display name")} name="field-disabled" value="ada" disabled />
            </span>
          </Cell>
        </Cells>
      </Block>
      <Block title="Kin">
        <Cells min={320}>
          <Cell caption="Textarea" column>
            <span class={styles.fill}>
              <Textarea
                label={t("Message")}
                name="field-message"
                placeholder={t("What happened")}
                rows={4}
              />
            </span>
          </Cell>
          <Cell caption="Select · press to open" column>
            <span class={styles.fill}>
              <Select
                label={t("Style")}
                value={style()}
                options={STYLE_OPTIONS}
                size="lg"
                onChange={setStyle}
              />
            </span>
          </Cell>
        </Cells>
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "The help line is the one place for validation; never add a second line.",
            "Labels are nouns: Email, Display name. Inputs are 16px on a coarse pointer.",
            "The rim takes the wordmark bar's colors, so a field and the bar agree.",
            "The label names the input; the help line describes it, read aloud as it changes."
          ]}
        />
      </Block>
    </Section>
  );
}
