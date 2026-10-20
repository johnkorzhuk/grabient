import type { ColorKind } from "@grabient/engine/css.ts";
import { t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import {
  deviceReducesMotion,
  type MotionChoice,
  motionChoice,
  setMotionChoice
} from "@grabient/ui/motion.ts";
import { Text } from "@grabient/ui/Text.tsx";
import {
  deviceTheme,
  setThemeChoice,
  type Theme,
  type ThemeChoice,
  themeChoice
} from "@grabient/ui/theme.ts";
import { createSignal, For } from "solid-js";
import { pageStarted } from "../../../app/connection.ts";
import { colorFormat, setColorFormat } from "../../../lib/color-format.ts";
import styles from "./Settings.module.css";

/* This browser's own choices, signed in or not: the theme, how much the site moves, and how the CSS a reader takes
   spells its colors. Each is one press that steps through its choices, and the line under the heading says what the
   choice in effect does. Every word the press can say and every line are stacked in one cell, so a press moves
   nothing; the line is read out once the reader has pressed. The server knows none of these choices: a document
   draws each row with its room held and its words unseen, until the page has started and read them. */

const THEMES: readonly ThemeChoice[] = ["system", "light", "dark"];
const themeWord = (c: ThemeChoice) =>
  c === "light" ? t("Light") : c === "dark" ? t("Dark") : t("System");
const themeLine = (c: ThemeChoice, device: Theme) =>
  c === "light"
    ? t("Always light.")
    : c === "dark"
      ? t("Always dark.")
      : device === "light"
        ? t("Follows your device: light.")
        : t("Follows your device: dark.");

const MOTIONS: readonly MotionChoice[] = ["system", "reduce", "full"];
const motionWord = (c: MotionChoice) =>
  c === "reduce" ? t("On") : c === "full" ? t("Off") : t("System");
const motionLine = (c: MotionChoice, device: boolean) =>
  c === "reduce"
    ? t("The background and animations stay still.")
    : c === "full"
      ? t("Animations always play.")
      : device
        ? t("Follows your device: on.")
        : t("Follows your device: off.");

const FORMATS: readonly ColorKind[] = ["oklch", "hex", "rgb", "hsl"];
// the formats' own names, the same in every language
const FORMAT_WORD: Record<ColorKind, string> = {
  oklch: "OKLCH",
  hex: "Hex",
  rgb: "RGB",
  hsl: "HSL"
};
const formatLine = (c: ColorKind) =>
  c === "oklch"
    ? t("Exported CSS is in OKLCH.")
    : c === "hex"
      ? t("Exported CSS is in hex.")
      : c === "rgb"
        ? t("Exported CSS is in RGB.")
        : t("Exported CSS is in HSL.");

const next = <T,>(steps: readonly T[], now: T) => steps[(steps.indexOf(now) + 1) % steps.length]!;

/** One setting: its heading, the lines it can say stacked with the one in effect on top, and the press. */
function Setting<T>(props: {
  id: string;
  heading: string;
  /** every line the setting can say, to hold the room */
  lines: readonly string[];
  line: string;
  steps: readonly T[];
  choice: T;
  word: (choice: T) => string;
  label: string;
  pressed: boolean;
  onPress: (e: MouseEvent) => void;
}) {
  return (
    <section class={styles.section} id={props.id}>
      <div class={styles.setting}>
        <div class={[styles.head, styles.settingText]}>
          <Text variant="h2">{props.heading}</Text>
          <div class={styles.lines}>
            <For each={props.lines} keyed={false}>
              {line => (
                <div class={[styles.cell, styles.unseen]} aria-hidden="true">
                  <Text variant="lede">{line()}</Text>
                </div>
              )}
            </For>
            <div
              class={[styles.cell, { [styles.unseen]: !pageStarted() }]}
              id={`${props.id}-line`}
              aria-live={props.pressed ? "polite" : undefined}
            >
              <Text variant="lede">{props.line}</Text>
            </div>
          </div>
        </div>
        <span class={styles.settingControl}>
          <Button
            size="lg"
            aria-label={props.label}
            aria-describedby={`${props.id}-line`}
            onClick={e => props.onPress(e)}
          >
            <span class={styles.words} aria-hidden="true">
              <For each={props.steps} keyed={false}>
                {step => (
                  <span
                    class={[
                      styles.cell,
                      { [styles.unseen]: step() !== props.choice || !pageStarted() }
                    ]}
                  >
                    {props.word(step())}
                  </span>
                )}
              </For>
            </span>
          </Button>
        </span>
      </div>
    </section>
  );
}

/** Light or dark: the device's own unless the reader says otherwise. The change arrives out of the press. */
export function ThemeSetting() {
  const [pressed, setPressed] = createSignal(false);
  return (
    <Setting
      id="theme"
      heading={t("Theme")}
      lines={[
        themeLine("system", "light"),
        themeLine("system", "dark"),
        themeLine("light", "dark"),
        themeLine("dark", "light")
      ]}
      line={themeLine(themeChoice(), deviceTheme())}
      steps={THEMES}
      choice={themeChoice()}
      word={themeWord}
      label={t("Theme: {state}", { state: themeWord(themeChoice()) })}
      pressed={pressed()}
      onPress={e => {
        if (setThemeChoice(next(THEMES, themeChoice()), e.currentTarget as HTMLElement))
          setPressed(true);
      }}
    />
  );
}

/** How much the site moves: the device's own setting unless the reader says otherwise. */
export function MotionSetting() {
  const [pressed, setPressed] = createSignal(false);
  return (
    <Setting
      id="motion"
      heading={t("Reduce motion")}
      lines={[
        motionLine("system", false),
        motionLine("system", true),
        motionLine("reduce", false),
        motionLine("full", false)
      ]}
      line={motionLine(motionChoice(), deviceReducesMotion())}
      steps={MOTIONS}
      choice={motionChoice()}
      word={motionWord}
      label={t("Reduce motion: {state}", { state: motionWord(motionChoice()) })}
      pressed={pressed()}
      onPress={() => {
        setPressed(true);
        const choice = next(MOTIONS, motionChoice());
        setMotionChoice(choice);
      }}
    />
  );
}

/** How the CSS a reader takes spells its colors. */
export function ColorFormatSetting() {
  const [pressed, setPressed] = createSignal(false);
  return (
    <Setting
      id="color-format"
      heading={t("Color format")}
      lines={FORMATS.map(formatLine)}
      line={formatLine(colorFormat())}
      steps={FORMATS}
      choice={colorFormat()}
      word={format => FORMAT_WORD[format]}
      label={t("Color format: {state}", { state: FORMAT_WORD[colorFormat()] })}
      pressed={pressed()}
      onPress={() => {
        setPressed(true);
        const choice = next(FORMATS, colorFormat());
        setColorFormat(choice);
      }}
    />
  );
}
