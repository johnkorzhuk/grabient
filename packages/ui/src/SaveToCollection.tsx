import { onSettled, Show } from "solid-js";
import { Button } from "./Button.tsx";
import { type CollectChoice, CollectList } from "./CollectList.tsx";
import { t } from "./i18n.ts";
import { Label } from "./Label.tsx";
import styles from "./SaveToCollection.module.css";
import { Text } from "./Text.tsx";

/** The export column's Save side: the selection into the account's collections, the same checklist a card's Add to
    collection offers, so one palette and many are kept the same way. A section of the column under the dashed rule.
    Signed out, its one action leads to sign in while the selection waits. */
export function SaveToCollection(props: {
  /** signed out: where the action leads */
  signIn?: string;
  /** the account's collections, each saying whether it holds the selection; null while they are read */
  own?: readonly CollectChoice[] | null;
  /** read them: once the side is drawn, and again after each write */
  onOwn?: () => void;
  onToggle: (slug: string, on: boolean) => Promise<void>;
  onNew: (title: string) => Promise<void>;
  /** the side needs the server and there is none */
  disabled?: boolean;
}) {
  onSettled(() => {
    props.onOwn?.();
  });
  return (
    <fieldset class={styles.view} aria-label={t("Save to")}>
      <Label>{t("Save to")}</Label>
      <Show
        when={!props.signIn}
        fallback={
          <>
            <Text variant="ui">{t("Sign in to save collections.")}</Text>
            <Button variant="primary" size="lg" full href={props.signIn} disabled={props.disabled}>
              {t("Sign in")}
            </Button>
          </>
        }
      >
        <CollectList
          own={props.own ?? null}
          onToggle={props.onToggle}
          onNew={props.onNew}
          onChanged={props.onOwn}
          disabled={props.disabled}
        />
      </Show>
    </fieldset>
  );
}
