import hidden from "./hidden.module.css";
import { Icon } from "./Icon.tsx";
import { formatNumber, t } from "./i18n.ts";
import styles from "./Stars.module.css";

/** The stars the code has on GitHub, beside the link to it: a filled star and the count as GitHub writes it (2k) for
    a reader who looks, the whole count in words for one who listens. */
export function Stars(props: { count: number }) {
  /* thousands in the reader's short form, a decimal kept where it says something: 2k, 2.6k, 12.3k, the kilo small */
  const shown = () =>
    formatNumber(props.count, { notation: "compact", maximumFractionDigits: 1 }).replace("K", "k");
  return (
    <>
      <span class={styles.stars} aria-hidden="true">
        <span class={styles.star}>
          <Icon name="star" size={12} fill />
        </span>
        <span class={styles.count}>{shown()}</span>
      </span>
      <span class={hidden.text}>
        {t("{count, plural, one {# star} other {# stars}}", { count: props.count })}
      </span>
    </>
  );
}
