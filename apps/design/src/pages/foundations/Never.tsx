import { Button } from "@grabient/ui/Button.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { For } from "solid-js";
import { Section } from "../../doc/Section.tsx";
import { Verdict, Verdicts } from "../../doc/Specimen.tsx";
import styles from "./Never.module.css";

/* What the system never draws, each drawn once so it is known on sight. The system has no way to draw most of them,
   so the document draws those by hand. */
const LINES = ["sunset", "dark academia", "pastel", "warm", "summer", "ocean", "retro", "neon"];

export function Never() {
  return (
    <Section
      id="never"
      summary="What the system never draws, each drawn once so it is known on sight."
    >
      <Verdicts columns={3}>
        <Verdict caption="A border on frost.">
          <div class={styles.frosted}>
            <Text variant="h3">Sign in</Text>
            <Text variant="small">A frosted sheet</Text>
          </div>
        </Verdict>
        <Verdict caption="A solid rule.">
          <div class={styles.stack}>
            <Text variant="ui">Profile</Text>
            <span class={styles.solid} />
            <Text variant="ui">Privacy</Text>
          </div>
        </Verdict>
        <Verdict caption="A pill.">
          <span class={styles.pill}>
            <Button size="lg">Save</Button>
          </span>
        </Verdict>
        <Verdict caption="An inner scroll region.">
          <div class={styles.scroller}>
            <For each={LINES}>{line => <Text variant="ui">{line}</Text>}</For>
          </div>
        </Verdict>
        <Verdict caption="Helper copy under a control.">
          <div class={styles.helped}>
            <Switch checked aria-label="Analytics" onChange={() => {}} />
            <Text variant="small">Click the button to turn this setting on or off.</Text>
          </div>
        </Verdict>
        <Verdict caption="Title case.">
          <Button size="lg">Save Your Changes</Button>
        </Verdict>
      </Verdicts>
    </Section>
  );
}
