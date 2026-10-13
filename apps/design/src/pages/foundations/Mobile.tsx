import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { t } from "@grabient/ui/i18n.ts";
import { Segmented } from "@grabient/ui/Segmented.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { size } from "@grabient/ui/tokens.ts";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Tokens } from "../../doc/Tokens.tsx";
import styles from "./Mobile.module.css";

/* What a thumb needs, drawn on real controls: the target each grows to on a coarse pointer, and the reach of a thumb
   holding the phone, where the page's main press waits. */
export function Mobile() {
  return (
    <Section id="mobile" summary="On a phone the page's task comes first, within the first screen.">
      <div class={styles.pair}>
        <figure class={styles.figure}>
          <div class={styles.stage}>
            <div class={styles.targets}>
              <span class={styles.target}>
                <Button icon aria-label={t("Light theme")}>
                  <Icon name="sun" />
                </Button>
              </span>
              <span class={styles.target}>
                <Button size="sm">sunset</Button>
              </span>
              <span class={styles.target}>
                <Segmented
                  size="sm"
                  aria-label="Order"
                  value="popular"
                  options={[
                    { value: "popular", label: "Popular" },
                    { value: "rising", label: "Rising" }
                  ]}
                  onChange={() => {}}
                />
              </span>
            </div>
          </div>
          <figcaption>
            <Text variant="small">{`Each target grows to ${size.touch}px both ways under a finger, whatever the control draws.`}</Text>
          </figcaption>
        </figure>
        <figure class={styles.figure}>
          <div class={styles.stage}>
            <div class={styles.phone}>
              <span class={styles.reach} aria-hidden="true" />
              <span class={styles.press}>
                <Button variant="primary" size="lg">
                  <Icon name="grid" size={14} />
                  Selection
                  <Text variant="num">3</Text>
                </Button>
              </span>
            </div>
          </div>
          <figcaption>
            <Text variant="small">
              The page's main press waits at the bottom, in the reach of a thumb.
            </Text>
          </figcaption>
        </figure>
      </div>
      <Block title="Tokens">
        <Tokens paths={["size.touch", "font.fsTouch", "size.thumbTouch", "size.stripShort"]} />
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Every target is 44px both ways on a coarse pointer. Nothing hides behind a hover.",
            "Primary actions sit within reach of a thumb, at the bottom of a sheet or the page.",
            "A finger moving up or down scrolls the page; controls wait for a move along them."
          ]}
        />
      </Block>
    </Section>
  );
}
