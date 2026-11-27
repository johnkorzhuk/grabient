import type { ColorKind } from "@grabient/engine/css.ts";
import { colorCodes } from "@grabient/engine/named-colors.ts";
import { Show } from "solid-js";
import { announce } from "./announce.ts";
import styles from "./ColorCodes.module.css";
import chip from "./chip.module.css";
import { copyText } from "./copy.ts";
import { createDone } from "./done.ts";
import { t } from "./i18n.ts";

/** The one color a page is about, at the end of its heading's line, where a collection gives its byline: its code
    in the spelling the reader chose (hex until they choose), as a collection's hex codes show a code: a coin of the
    color, then the code, a press that copies it and says Copied over itself for a moment. */
export function ColorCodes(props: {
  hex: string;
  /** the spelling to show, hex when none is given */
  format?: ColorKind;
  /** on a title's own line, where a phone has room for the title alone */
  alone?: boolean;
}) {
  const code = () => colorCodes(props.hex)?.[props.format ?? "hex"];
  const [copied, mark] = createDone<string>(1100);
  const copy = async (text: string) => {
    if (await copyText(text)) {
      mark(text);
      announce(t("Copied"));
    } else announce(t("Couldn't copy. Select the text and copy it."));
  };
  return (
    <Show when={code()}>
      {text => (
        <span class={styles.codes} data-alone={props.alone ? "" : undefined}>
          <button
            type="button"
            class={chip.chip}
            style={{ "--c": props.hex }}
            data-said={copied() === text() ? t("Copied") : undefined}
            aria-label={t("Copy {hex}", { hex: text() })}
            onClick={() => void copy(text())}
          >
            {text()}
          </button>
        </span>
      )}
    </Show>
  );
}
