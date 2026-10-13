import { Show } from "solid-js";
import styles from "./Avatar.module.css";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";

/** Who is signed in: the picture, else the name's first letter, else a person's outline, which says Signed out. In
    the header it stands as tall as the presses beside it; `lg` is the settings page's. */
export function Avatar(props: { size?: "sm" | "lg"; src?: string; name?: string }) {
  return (
    <span
      class={styles.avatar}
      data-size={props.size}
      role="img"
      aria-label={props.name ?? t("Signed out")}
    >
      <Show
        when={props.src}
        fallback={
          <Show
            when={props.name}
            fallback={
              <span class={styles.anon}>
                <Icon name="user" size={props.size === "lg" ? 24 : 15} />
              </span>
            }
          >
            {/* the first letter whole (an emoji is two code units), capitalized in the page's language by the CSS:
                a Turkish i is İ */}
            {name => <>{[...name()][0]}</>}
          </Show>
        }
      >
        {src => <img class={styles.picture} src={src()} alt="" referrerpolicy="no-referrer" />}
      </Show>
    </span>
  );
}
