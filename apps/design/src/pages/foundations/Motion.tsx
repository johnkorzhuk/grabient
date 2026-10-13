import { gradientCss } from "@grabient/engine/css.ts";
import { Button } from "@grabient/ui/Button.tsx";
import { t } from "@grabient/ui/i18n.ts";
import { Label } from "@grabient/ui/Label.tsx";
import { Logo } from "@grabient/ui/Logo.tsx";
import { reducesNow } from "@grabient/ui/motion.ts";
import { Text } from "@grabient/ui/Text.tsx";
import { ThemeIcon } from "@grabient/ui/ThemeIcon.tsx";
import { motion } from "@grabient/ui/tokens.ts";
import { createSignal, For, Show } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Tokens } from "../../doc/Tokens.tsx";
import { hexes, POPULAR } from "../../samples.ts";
import styles from "./Motion.module.css";

/* Each duration moves a dot across its card while the pointer rests on the card, and the change of theme plays on a
   small page from its own theme button. */
const DURATIONS = [
  ["fast", "hover and press"],
  ["base", "rows fold and slide"],
  ["slow", "the logo bar"],
  ["reveal", "the theme arriving"],
  ["dissolve", "the theme, reduced"]
] as const;
const STOPS = hexes(POPULAR[2].seed);

type Theme = "dark" | "light";
function MiniPage(props: { theme: Theme; moving: boolean; onPress?: (el: HTMLElement) => void }) {
  return (
    <>
      <div class={styles.bar}>
        <Logo stops={STOPS} height={22} />
        <Button
          icon
          aria-label={props.theme === "dark" ? t("Light theme") : t("Dark theme")}
          onClick={e => props.onPress?.(e.currentTarget as HTMLElement)}
        >
          <ThemeIcon dark={props.theme === "dark"} moving={props.moving} />
        </Button>
      </div>
      <div
        class={styles.art}
        style={{ "background-image": gradientCss(STOPS, "linearGradient", 90) }}
      />
    </>
  );
}

/* The site's change of theme on a small page: the other theme opens out of the pressed button over motion.reveal on
   the one ease, its edge a third of the way to the farthest corner, or dissolves over motion.dissolve with less
   motion. */
function ThemeChange() {
  let frame!: HTMLDivElement;
  let top: HTMLDivElement | undefined;
  const [under, setUnder] = createSignal<Theme>("dark");
  const [over, setOver] = createSignal<Theme | null>(null);
  const [moving, setMoving] = createSignal(false);
  const [place, setPlace] = createSignal({ x: 0, y: 0, soft: 0 });
  const play = (button: HTMLElement) => {
    if (over()) return;
    const box = frame.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const x = b.left + b.width / 2 - box.left;
    const y = b.top + b.height / 2 - box.top;
    const far = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y));
    const next: Theme = under() === "dark" ? "light" : "dark";
    const reduced = reducesNow();
    setPlace({ x, y, soft: far / 3 });
    setOver(next);
    setMoving(true);
    setTimeout(() => setMoving(false), motion.base);
    /* the arriving page is drawn by the next frame, masked shut until its animation opens it */
    requestAnimationFrame(() => {
      if (!top) return;
      const run = reduced
        ? top.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: motion.dissolve,
            fill: "forwards"
          })
        : top.animate([{ "--theme-r": "0px" }, { "--theme-r": `${far + far / 3}px` }], {
            duration: motion.reveal,
            easing: motion.ease,
            fill: "forwards"
          });
      const land = () => {
        setUnder(next);
        setOver(null);
      };
      run.finished.then(land, land);
    });
  };
  return (
    <div class={styles.card}>
      <div class={styles.head}>
        <Text variant="h3">theme</Text>
        <Text variant="mono">{`${motion.reveal}ms`}</Text>
      </div>
      <div ref={frame} class={styles.frame}>
        <div class={styles.page} data-theme={under()}>
          <MiniPage theme={under()} moving={moving()} onPress={play} />
        </div>
        <Show when={over()}>
          {theme => (
            <div
              ref={top}
              class={styles.page}
              data-theme={theme()}
              data-arriving={reducesNow() ? undefined : ""}
              style={{
                "--x": `${place().x}px`,
                "--y": `${place().y}px`,
                "--soft": `${place().soft}px`,
                opacity: reducesNow() ? 0 : undefined
              }}
              aria-hidden="true"
              inert
            >
              <MiniPage theme={theme()} moving={moving()} />
            </div>
          )}
        </Show>
      </div>
      <Text variant="small">Press its theme button.</Text>
    </div>
  );
}

export function Motion() {
  return (
    <Section id="motion" summary="Five durations and one ease, stilled by reduced motion.">
      <div class={styles.play}>
        <Label>Hover to play</Label>
        <div class={styles.cards}>
          <For each={DURATIONS}>
            {([name, use]) => (
              <div class={styles.card}>
                <div class={styles.head}>
                  <Text variant="h3">{name}</Text>
                  <Text variant="mono">{`${motion[name]}ms`}</Text>
                </div>
                <div class={styles.track}>
                  <span
                    class={styles.dot}
                    style={{ "transition-duration": `var(--motion-${name})` }}
                  />
                </div>
                <Text variant="small">{use}</Text>
              </div>
            )}
          </For>
          <ThemeChange />
        </div>
      </div>
      <Block title="Tokens">
        <Tokens paths={["motion.ease"]} />
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Pages paint at rest, and routes change without animation.",
            "Hover reveals fade in and travel a few pixels. Nothing springs or scales.",
            "Code that animates asks reducedMotion(), never the media query.",
            "A control's fill fades as --fill, which base.css registers, never as background-color, which Chrome can flash."
          ]}
        />
      </Block>
    </Section>
  );
}
