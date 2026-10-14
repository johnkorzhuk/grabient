import { CONTACT_EMAIL } from "@grabient/email/addresses.ts";
import { localHref, msg, rich, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import link from "@grabient/ui/link.module.css";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createSignal, For, Show } from "solid-js";
import { shownError } from "../../lib/query.ts";
import styles from "./Unsubscribe.module.css";
import { answerUnsubscribe } from "./writes.ts";

/* The page every issue links to: one sheet that ends the newsletter for the account its address names, with no sign-in.
   Opening it changes nothing, since mail scanners open links: the press does, and the same press then offers the way
   back. It asks the server nothing until the press, so it says nothing of the account. The page's frame (PageFrame
   `login`, the language menu kept) is the caller's. */

const LINES = {
  rest: msg("Stop the newsletter for this email."),
  ended: msg("You're unsubscribed. Emails you ask for, like sign-in links, still arrive."),
  back: msg("You're subscribed again.")
} as const;
type Stage = keyof typeof LINES;
const STAGES = Object.keys(LINES) as Stage[];
const UNSENT = msg("Something went wrong. Try again.");

export function UnsubscribePage(props: {
  /** the address's token, read once as the page starts; null where the address holds none */
  token: string | null;
  /** the browser has no connection: the press waits */
  offline?: boolean;
}) {
  const [stage, setStage] = createSignal<Stage>("rest");
  const [sending, setSending] = createSignal(false);
  const [failure, setFailure] = createSignal("");
  const subscribes = () => stage() === "ended";
  /* The button rests while a press is out and keeps the keyboard (`keep`), so the way back is one more press of the
     same key. */
  const press = async (token: string) => {
    if (sending()) return;
    setSending(true);
    setFailure("");
    try {
      setStage((await answerUnsubscribe(token, subscribes())) ? "back" : "ended");
    } catch (error) {
      setFailure(shownError(error, UNSENT));
    } finally {
      setSending(false);
    }
  };
  return (
    <Pane variant="frost" padding="lg">
      <div class={styles.sheet}>
        <Text variant="title">{t("Unsubscribe")}</Text>
        <Show
          when={props.token}
          fallback={
            <>
              <div class={styles.sub}>
                <Text variant="lede">
                  {rich(
                    "This link isn't valid. Turn the newsletter off in Settings or write to <email>{email}</email>.",
                    {
                      email: words => (
                        <a
                          class={[styles.link, link.inline]}
                          href={`mailto:${CONTACT_EMAIL}`}
                          dir="ltr"
                        >
                          {words}
                        </a>
                      )
                    },
                    { email: CONTACT_EMAIL }
                  )}
                </Text>
              </div>
              {/* Settings opens with no connection too */}
              <Button size="lg" full href={localHref("/settings")}>
                {t("Settings")}
              </Button>
            </>
          }
        >
          {token => (
            <>
              {/* every line the sheet can say, stacked in one cell: the tallest holds the place, so a press moves
                  nothing */}
              <div class={[styles.sub, styles.stack]}>
                <For each={STAGES} keyed={false}>
                  {key => (
                    <div class={[styles.cell, styles.unseen]} aria-hidden="true">
                      <Text variant="lede">{t(LINES[key()])}</Text>
                    </div>
                  )}
                </For>
                {/* read out once the reader has pressed: the first line is the page's own */}
                <div class={styles.cell} aria-live={stage() === "rest" ? undefined : "polite"}>
                  <Text variant="lede">{t(LINES[stage()])}</Text>
                </div>
              </div>
              <Button
                variant={subscribes() ? "secondary" : "primary"}
                size="lg"
                full
                disabled={sending() || props.offline}
                keep
                onClick={() => void press(token())}
              >
                <span class={[styles.stack, styles.labels]}>
                  <span
                    class={[styles.cell, { [styles.unseen]: subscribes() }]}
                    aria-hidden={subscribes() ? "true" : undefined}
                  >
                    {t("Unsubscribe")}
                  </span>
                  <span
                    class={[styles.cell, { [styles.unseen]: !subscribes() }]}
                    aria-hidden={subscribes() ? undefined : "true"}
                  >
                    {t("Subscribe again")}
                  </span>
                </span>
              </Button>
              <Status error={!!failure()}>{failure()}</Status>
            </>
          )}
        </Show>
      </div>
    </Pane>
  );
}
