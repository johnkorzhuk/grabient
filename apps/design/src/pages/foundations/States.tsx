import { Button } from "@grabient/ui/Button.tsx";
import { Field } from "@grabient/ui/Field.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { t } from "@grabient/ui/i18n.ts";
import { SkipLink } from "@grabient/ui/SkipLink.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Tags } from "@grabient/ui/Tags.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import type { Element } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Matrix } from "../../doc/Specimen.tsx";
import { Tokens } from "../../doc/Tokens.tsx";
import { hexes, POPULAR } from "../../samples.ts";
import styles from "./States.module.css";

/* Every interactive control in every state, each cell the real component held in that state, then Skip to content,
   the keyboard's first stop on every page. */
const STATES = ["rest", "hover", "focus-visible", "pressed", "disabled"] as const;
type State = (typeof STATES)[number];
const ROWS = ["button", "button · primary", "button · icon", "field", "switch", "tag"] as const;
type Row = (typeof ROWS)[number];

/* the state a component holds at rest for the document; rest and disabled are its own */
const held = (s: State) =>
  s === "hover"
    ? "hover"
    : s === "focus-visible"
      ? "focus"
      : s === "pressed"
        ? "pressed"
        : undefined;
const TAG = { label: "sunset", colors: hexes(POPULAR[0].seed, 3) };

function cell(row: Row, s: State): Element {
  const disabled = s === "disabled";
  switch (row) {
    case "button":
      return (
        <Button state={held(s)} disabled={disabled}>
          Save
        </Button>
      );
    case "button · primary":
      return (
        <Button variant="primary" state={held(s)} disabled={disabled}>
          Send link
        </Button>
      );
    case "button · icon":
      return (
        <Button icon aria-label={t("Light theme")} state={held(s)} disabled={disabled}>
          <Icon name="sun" />
        </Button>
      );
    case "field":
      return s === "pressed" ? (
        <span class={styles.none} role="img" aria-label="No such state">
          <Icon name="minus" />
        </span>
      ) : (
        <span class={styles.wide}>
          <Field
            label="Name"
            name={`state-${s}`}
            value="Ada"
            state={s === "hover" ? "hover" : s === "focus-visible" ? "focus" : undefined}
            disabled={disabled}
          />
        </span>
      );
    case "switch":
      return (
        <Switch
          checked
          aria-label="Analytics"
          state={held(s)}
          disabled={disabled}
          onChange={() => {}}
        />
      );
    case "tag":
      return (
        <span class={styles.bed}>
          <Tags tags={[{ ...TAG, disabled }]} state={held(s)} />
        </span>
      );
  }
}

export function States() {
  return (
    <Section
      id="states"
      summary="Quiet: hover lifts a control one step of paper, and keyboard focus draws a ring."
    >
      <Matrix rows={ROWS} cols={STATES} cell={cell} />
      <Block title="Skip to content">
        <div class={styles.skip} inert>
          <SkipLink state="focus" />
          <Button icon aria-label={t("Light theme")}>
            <Icon name="sun" />
          </Button>
        </div>
        <Text variant="small">
          The first Tab stop on every page, seen only while it has the keyboard.
        </Text>
      </Block>
      <Block title="Tokens">
        <Tokens
          paths={["color.paper2", "color.paper3", "color.inkHover", "color.ring", "color.edge2"]}
        />
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Nothing scales, shifts, glows or changes its border on hover or press. Disabled is 40% opacity.",
            "Keyboard focus is a 1px ring 2px out; pointer focus shows nothing. A field shows its rim on any focus.",
            "A group of choices is one Tab stop; a menu gives the keyboard back to its button.",
            "No toasts. The control that acted shows a check; a lasting message is a Status."
          ]}
        />
      </Block>
    </Section>
  );
}
