import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { t } from "@grabient/ui/i18n.ts";
import { Text } from "@grabient/ui/Text.tsx";
import { type Element, For } from "solid-js";
import { HeldTip } from "../../doc/HeldTip.tsx";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Verdict, Verdicts } from "../../doc/Specimen.tsx";
import styles from "./Voice.module.css";

/* Six pairs of the same words, as the site writes them and as it never does. */
const flip = (text: string) => (
  <HeldTip text={text}>
    <Button icon aria-label={t("Reverse")}>
      <Icon name="flip" />
    </Button>
  </HeldTip>
);
const PAIRS: readonly (readonly [() => Element, string, () => Element, string])[] = [
  [
    () => (
      <Button variant="primary" size="lg">
        Save
      </Button>
    ),
    "The verb says what happens.",
    () => (
      <Button variant="primary" size="lg">
        Submit
      </Button>
    ),
    "A verb about the form."
  ],
  [
    () => (
      <Button>
        <Icon name="check" size={14} />
        Copied
      </Button>
    ),
    "One word on the control.",
    () => (
      <Button wrap>
        <Icon name="check" size={14} />
        Successfully copied to clipboard!
      </Button>
    ),
    "A sentence that celebrates."
  ],
  [
    () => flip("Reverse · E"),
    "The name, then its key.",
    () => flip("Runs the palette the other way · E"),
    "A sentence about how it works."
  ],
  [
    () => (
      <Text variant="body" strong>
        Couldn't load palettes.
      </Text>
    ),
    "What failed, in a few words.",
    () => (
      <Text variant="body" strong>
        Palettes could not be loaded. Please try again.
      </Text>
    ),
    "A passive sentence that pleads."
  ],
  [
    () => (
      <Text variant="body" strong>
        color, gray, center
      </Text>
    ),
    "American spelling.",
    () => (
      <Text variant="body" strong>
        colour, grey, centre
      </Text>
    ),
    "British spelling."
  ],
  [
    () => <Button size="lg">Sign in</Button>,
    "Sentence case.",
    () => <Button size="lg">Sign In</Button>,
    "Title case."
  ]
];

export function Voice() {
  return (
    <Section
      id="voice"
      summary="The fewest plain words that say what a control does. Sentence case, American English."
    >
      <div class={styles.pairs}>
        <For each={PAIRS}>
          {([good, why, bad, whyNot]) => (
            <Verdicts pair>
              <Verdict ok compact caption={why}>
                {good()}
              </Verdict>
              <Verdict compact caption={whyNot}>
                {bad()}
              </Verdict>
            </Verdicts>
          )}
        </For>
      </div>
      <Block title="Rules">
        <Rules
          rules={[
            "Look at what a control does, then name it in the words designers know: Reverse, Invert, Copy link.",
            "A tooltip is the name of its press and its key: Reverse · E. The result shows what it does.",
            "A line says one thing: Saved. No results. Couldn't load palettes. No line explains what a reader can see.",
            "An error says what failed and, if it helps, what to do. No apology, no please, no em dashes."
          ]}
        />
      </Block>
    </Section>
  );
}
