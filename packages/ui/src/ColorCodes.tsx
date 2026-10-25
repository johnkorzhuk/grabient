import { hexToSrgb } from "@grabient/engine/color.ts";
import { srgbName } from "@grabient/engine/colorname.ts";
import { colorCodes } from "@grabient/engine/named-colors.ts";
import { For, Show } from "solid-js";
import { announce } from "./announce.ts";
import styles from "./ColorCodes.module.css";
import { copyText } from "./copy.ts";
import { createDone } from "./done.ts";
import { t } from "./i18n.ts";
import { Text } from "./Text.tsx";
import { tooltip } from "./Tooltip.tsx";

/** The one color a page is about, as facts at the end of its heading's line, where a collection gives its byline: a
    coin of the color, then its codes as CSS writes them, set apart as a byline's facts are. Each code is a press that
    copies it and says Copied in its own place. A narrower page keeps fewer codes, the hex last of all. */
export function ColorCodes(props: {
  hex: string;
  /** what the page calls it; a hex alone is named by what its color is called */
  name?: string;
  /** on a title's own line, where a phone has room for the title alone */
  alone?: boolean;
}) {
  const codes = () => {
    const c = colorCodes(props.hex);
    return c ? [c.hex, c.rgb, c.hsl, c.oklch] : [];
  };
  const name = () => props.name ?? t(srgbName(hexToSrgb(props.hex) ?? [0, 0, 0]));
  const [copied, mark] = createDone<string>();
  const copy = async (code: string) => {
    if (await copyText(code)) {
      mark(code);
      announce(t("Copied"));
    } else announce(t("Couldn't copy. Select the text and copy it."));
  };
  const tip = tooltip(() => name());
  return (
    <Show when={codes().length}>
      <span class={styles.codes} data-alone={props.alone ? "" : undefined}>
        <span
          ref={tip}
          class={styles.coin}
          style={{ background: props.hex }}
          role="img"
          aria-label={name()}
        />
        <For each={codes()} keyed={false}>
          {(code, i) => {
            const press = tooltip(() => t("Copy"));
            const done = () => copied() === code();
            return (
              <span class={styles.item}>
                <Show when={i > 0}>
                  <span aria-hidden="true">
                    <Text variant="ui">·</Text>
                  </span>
                </Show>
                <button
                  ref={press}
                  type="button"
                  class={styles.code}
                  aria-label={t("Copy {hex}", { hex: code() })}
                  onClick={() => void copy(code())}
                >
                  <span class={styles.word} data-unseen={done() ? "" : undefined}>
                    <Text variant="ui">{code()}</Text>
                  </span>
                  <span
                    class={styles.word}
                    data-unseen={done() ? undefined : ""}
                    aria-hidden="true"
                  >
                    <Text variant="ui">{t("Copied")}</Text>
                  </span>
                </button>
              </span>
            );
          }}
        </For>
      </span>
    </Show>
  );
}
