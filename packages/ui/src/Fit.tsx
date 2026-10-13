import styles from "./Fit.module.css";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import { tooltip } from "./Tooltip.tsx";

export type FitVote = "up" | "down";

/** Whether a palette fits what it is shown for: two presses in a card's line, up and down. One vote per account, the
    pressed thumb filled, pressed again to take the vote back. No counts show: the crowd's count is the seeding agents',
    and a number would invite piling on. For an admin on one of Grabient's collections the down slates the palette for
    removal, so its thumb turns to danger and it says Remove from collection. Each press is named for what the vote is
    on: a collection's title, or the words of the search the palette answers. Offline both stay, disabled. */
export function Fit(props: {
  /** the account's own vote */
  value?: FitVote | null;
  /** up, down, or null to take the vote back */
  onVote?: (vote: FitVote | null) => void;
  /** an admin on one of Grabient's collections: the down slates the palette */
  admin?: boolean;
  /** the words of the search the palette answers, when the vote is on its fit for them */
  query?: string;
  /** the title of the collection the palette is in: the vote is on its fit there */
  collection?: string;
  disabled?: boolean;
}) {
  const press = (vote: FitVote) => props.onVote?.(props.value === vote ? null : vote);
  /* a press is named by its vote and says whether it is cast by its pressed state; its tip says what a press does now */
  const upName = () =>
    props.query
      ? t("Good fit for {query}", { query: props.query })
      : props.collection
        ? t("Good fit for {title}", { title: props.collection })
        : t("Good fit");
  const downName = () =>
    props.admin
      ? t("Remove from collection")
      : props.query
        ? t("Bad fit for {query}", { query: props.query })
        : props.collection
          ? t("Bad fit for {title}", { title: props.collection })
          : t("Bad fit");
  const thumb = (vote: FitVote, name: () => string) => (
    <button
      type="button"
      class={styles.press}
      data-on={props.value === vote ? "" : undefined}
      data-ruling={vote === "down" && props.admin ? "" : undefined}
      aria-pressed={props.value === vote ? "true" : "false"}
      aria-label={name()}
      ref={tooltip(() => (props.value === vote ? t("Undo") : name()), { turns: true })}
      disabled={props.disabled}
      onClick={() => press(vote)}
    >
      <Icon name={vote === "up" ? "thumbUp" : "thumbDown"} size={17} fill={props.value === vote} />
    </button>
  );
  return (
    <fieldset class={styles.row} aria-label={t("Fit")}>
      {thumb("up", upName)}
      {thumb("down", downName)}
    </fieldset>
  );
}
