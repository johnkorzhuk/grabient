import { announce } from "./announce.ts";
import styles from "./CopyButton.module.css";
import { copyText } from "./copy.ts";
import { createDone } from "./done.ts";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";

/** The one Copy, wherever text is taken: the glyph and the word on no surface, at a tab's size and type, so it stands
    in a code block's bar as one of its row and at the end of a line to copy. It confirms on itself: for a moment the
    glyph is a check and the word Copied, both words in one cell so nothing beside it moves. A copy the browser refuses
    shows no check; a reader who listens hears either result. */
export function CopyButton(props: {
  /** what a press copies */
  text: string;
  /** its name at rest, saying what it copies */
  "aria-label"?: string;
  /** a press happened, before the browser answers */
  onCopy?: (text: string) => void;
  /** the browser refused: select the text on the page, for a reader to copy by hand */
  onRefused?: () => void;
  /** on a phone the word gives way and the glyph stays */
  compact?: boolean;
  /** a specimen's state, held: Copied */
  state?: "copied";
}) {
  const [copied, mark] = createDone();
  const done = () => props.state === "copied" || copied() !== null;
  const label = () => (done() ? t("Copied") : (props["aria-label"] ?? t("Copy")));
  const copy = async () => {
    const text = props.text;
    props.onCopy?.(text);
    if (await copyText(text)) {
      mark(true);
      announce(t("Copied"));
    } else if (props.onRefused) {
      props.onRefused();
      announce(t("Couldn't copy. The code is selected."));
    } else announce(t("Couldn't copy. Select the text and copy it."));
  };
  return (
    <button type="button" class={styles.press} aria-label={label()} onClick={() => void copy()}>
      <Icon name={done() ? "check" : "copy"} size={14} />
      <span class={styles.words} data-compact={props.compact ? "" : undefined} aria-hidden="true">
        <span class={styles.word} data-unseen={done() ? "" : undefined}>
          {t("Copy")}
        </span>
        <span class={styles.word} data-unseen={done() ? undefined : ""}>
          {t("Copied")}
        </span>
      </span>
    </button>
  );
}
