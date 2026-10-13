import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import styles from "./Like.module.css";
import { tooltip } from "./Tooltip.tsx";

/** The heart and its count in one press: `plain` in a card's line, `art` as glass over a picture. Signed out it looks
    the same and the page turns the press into sign-in; it is disabled only when the press can lead nowhere (offline and
    signed out). A liked heart counts at least the reader's own like, even before the count arrives. */
export function Like(props: {
  count: number;
  liked?: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  variant?: "plain" | "art";
  /** over a picture: sm over a card's, lg on the stage */
  size?: "sm" | "lg";
}) {
  const shown = () => Math.max(props.count, props.liked ? 1 : 0);
  const art = () => props.variant === "art";
  const tip = tooltip(() => (props.liked ? t("Unlike") : t("Like")), { turns: true });
  return (
    <button
      ref={tip}
      type="button"
      class={styles.like}
      data-variant={art() ? "art" : "plain"}
      data-size={art() ? (props.size ?? "sm") : undefined}
      data-liked={props.liked ? "" : undefined}
      disabled={props.disabled}
      aria-pressed={props.liked ? "true" : "false"}
      /* the name keeps its words: aria-pressed says whether it is liked */
      aria-label={t("{count, plural, one {Like, #} other {Like, #}}", { count: shown() })}
      onClick={() => props.onToggle?.()}
    >
      <span class={styles.heart}>
        <Icon name="heart" size={art() ? (props.size === "lg" ? 20 : 13) : 22} fill={props.liked} />
      </span>
      <span class={styles.count}>{shown()}</span>
    </button>
  );
}
