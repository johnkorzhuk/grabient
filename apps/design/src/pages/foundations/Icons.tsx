import { Button } from "@grabient/ui/Button.tsx";
import { ICONS, Icon, type IconName } from "@grabient/ui/Icon.tsx";
import { t } from "@grabient/ui/i18n.ts";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { ThemeIcon } from "@grabient/ui/ThemeIcon.tsx";
import { motion } from "@grabient/ui/tokens.ts";
import { createSignal, For } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Tokens } from "../../doc/Tokens.tsx";
import styles from "./Icons.module.css";

/* Every glyph in the set, and the theme button's own sun and moon, which turn over on a press. */
const NAMES = Object.keys(ICONS) as IconName[];

/* the glyph as the header draws it: a press turns it over as a change of theme does, and the page keeps its theme */
function ThemeTurn() {
  const [dark, setDark] = createSignal(true);
  const [moving, setMoving] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const turn = () => {
    setMoving(true);
    setDark(!dark());
    clearTimeout(timer);
    timer = setTimeout(() => setMoving(false), motion.base);
  };
  return (
    <div class={styles.turn}>
      <Button
        icon
        aria-label={dark() ? t("Light theme") : t("Dark theme")}
        tip="Press to turn it over"
        turns
        onClick={turn}
      >
        <ThemeIcon dark={dark()} moving={moving()} />
      </Button>
      <Text variant="mono">{`${dark() ? "dark · the sun" : "light · the moon"} · ${motion.base}ms`}</Text>
    </div>
  );
}

export function Icons() {
  return (
    <Section
      id="icons"
      summary="Line icons on a 24 unit grid, stroke 1.9, round caps, in the current ink."
    >
      <Pane variant="paper" padding="md">
        <ul class={styles.icons}>
          <For each={NAMES}>
            {name => (
              <li class={styles.icon}>
                <Icon name={name} size={20} />
                <Text variant="mono">{name}</Text>
              </li>
            )}
          </For>
        </ul>
      </Pane>
      <Pane variant="paper" padding="md">
        <ThemeTurn />
      </Pane>
      <Block title="Tokens">
        <Tokens paths={["size.icon", "size.iconSm"]} />
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Use Icon, and add a glyph to icons.data.ts before using it.",
            "An icon-only control carries an aria-label. No emoji in the interface."
          ]}
        />
      </Block>
    </Section>
  );
}
