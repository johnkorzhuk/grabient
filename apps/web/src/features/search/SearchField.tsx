import { localHref } from "@grabient/i18n";
import { useNavigate } from "@tanstack/solid-router";
import { listWords } from "../../lib/words.ts";
import styles from "./SearchField.module.css";

/* Stands in for the search area's field (U07 M) until it lands: a form that searches where `to` says, and works
   without scripts. */
export function SearchField(props: {
  surface: "home" | "palettes";
  words: string;
  placeholder: string;
  disabled?: boolean;
  /** the address a search for these words opens */
  to: (words: string) => string;
}) {
  const navigate = useNavigate();
  return (
    <form
      class={styles.form}
      action={localHref(props.to("").split("?")[0] || "/")}
      onSubmit={e => {
        e.preventDefault();
        const field = (e.currentTarget as HTMLFormElement).elements.namedItem(
          "q"
        ) as HTMLInputElement;
        void navigate({ href: props.to(listWords(field.value)) });
      }}
    >
      <input
        class={styles.field}
        type="search"
        name="q"
        aria-label={props.placeholder}
        placeholder={props.placeholder}
        value={props.words}
        disabled={props.disabled}
        autocomplete="off"
        spellcheck={false}
        enterkeyhint="search"
        maxlength={2048}
      />
    </form>
  );
}
