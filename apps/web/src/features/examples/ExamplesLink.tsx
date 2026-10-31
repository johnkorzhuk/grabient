import { localHref, t } from "@grabient/i18n";
import { Icon } from "@grabient/ui/Icon.tsx";
import styles from "./ExamplesLink.module.css";

/** The way from a palette's page to its examples (ExamplesPage.tsx): a row across the sheet under its figures, the
    same whatever the picture shows, which names the style the examples open in. */
export function ExamplesLink(props: { href: string }) {
  return (
    <a class={styles.link} href={localHref(props.href)}>
      <span class={styles.mark} aria-hidden="true">
        <Icon name="grid" size={16} />
      </span>
      <span class={styles.words}>
        <span class={styles.title}>{t("Examples")}</span>
        <span class={styles.line}>
          {t("Ways to use this palette, each with the code that does it.")}
        </span>
      </span>
      <span class={styles.go} aria-hidden="true">
        <Icon name="arrow" size={16} />
      </span>
    </a>
  );
}
