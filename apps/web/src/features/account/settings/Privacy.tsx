import { msg, t } from "@grabient/i18n";
import { Placeholder } from "@grabient/ui/Placeholder.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show, untrack } from "solid-js";
import { offline } from "../../../app/connection.ts";
import { createOptimisticWrites } from "../../../lib/optimistic.ts";
import { type ConsentCategory, consent, setConsentCategory } from "../../analytics/consent.ts";
import { choiceQuery } from "../../newsletter/queries.ts";
import { writeChoice } from "../../newsletter/writes.ts";
import { account, shownError } from "../session.ts";
import styles from "./Settings.module.css";

/* What this browser lets the site measure, signed in or not, and beside it, signed in, the account's newsletter, which
   the server keeps. */

const CONSENT: readonly [ConsentCategory, string, string][] = [
  ["analytics", msg("Analytics"), msg("Google Analytics measures how Grabient is used.")],
  ["marketing", msg("Marketing"), msg("Google Analytics links your visits to your account.")],
  ["sessionReplay", msg("Session replay"), msg("Records your visits, with all text hidden.")]
];

/** The account's newsletter: read once per account while online, and again when a lost connection returns. A press
    shows at once and its write goes behind it; why a read or a press failed takes the line's place, so the row never
    grows. Disabled with no connection. */
function NewsletterChoice() {
  const queryClient = useQueryClient();
  // the account to read for: none while offline, so a connection that returns reads again what failed
  const reachable = () => (offline() ? null : (account()?.id ?? null));
  const key = () => [...choiceQuery().queryKey, account()?.id ?? ""];
  const choice = useQuery(() => ({ ...choiceQuery(), queryKey: key(), enabled: !!reachable() }));
  const [pressed, setPressed] = createSignal<boolean | null>(null);
  const [pressFailure, setPressFailure] = createSignal("");
  // the account the switch was drawn for: an answer that comes back after a change of account draws nothing
  const id = untrack(() => account()?.id);
  const writes = createOptimisticWrites<boolean, boolean>({
    valueOf: held => held,
    show: (_, on) => setPressed(on),
    send: async (_, on) => {
      const held = await writeChoice(on);
      queryClient.setQueryData(key(), held);
      return held;
    },
    live: () => account()?.id === id
  });
  const shown = () => pressed() ?? (choice.isSuccess ? choice.data : null);
  const failure = () =>
    offline()
      ? ""
      : pressFailure() ||
        (choice.isError ? shownError(choice.error, msg("Something went wrong. Try again.")) : "");
  const press = (on: boolean) => {
    const held = shown();
    if (held === null) return;
    setPressFailure("");
    writes
      .set("newsletter", held, on)
      .catch(reason => setPressFailure(shownError(reason, msg("Couldn't save."))));
  };
  return (
    <div class={styles.choice}>
      <div class={styles.choiceText}>
        <Text variant="body" strong id="newsletter-label">
          {t("Newsletter")}
        </Text>
        <div class={styles.lines}>
          <div class={[styles.cell, { [styles.unseen]: !!failure() }]} id="newsletter-line">
            <Text variant="small" as="p">
              {t("Rising palettes and new features, about once a month, to {email}.", {
                email: account()?.email ?? ""
              })}
            </Text>
          </div>
          <div class={styles.cell}>
            <Status error={!!failure()}>{failure()}</Status>
          </div>
        </div>
      </div>
      <Show when={shown() !== null} fallback={<Placeholder width="56px" height="40px" />}>
        <Switch
          checked={shown() === true}
          aria-labelledby="newsletter-label"
          aria-describedby="newsletter-line"
          disabled={offline()}
          onChange={press}
        />
      </Show>
    </div>
  );
}

export function PrivacySection() {
  return (
    <section class={styles.section} id="privacy">
      <div class={styles.head}>
        <Text variant="h2">{t("Privacy", { $context: "settings" })}</Text>
        <Text variant="lede">{t("Choices for this browser.")}</Text>
      </div>
      <div class={styles.list}>
        <For each={CONSENT} keyed={false}>
          {entry => (
            <div class={styles.choice}>
              <div class={styles.choiceText}>
                <Text variant="body" strong id={`consent-${entry()[0]}-label`}>
                  {t(entry()[1])}
                </Text>
                <Text variant="small">{t(entry()[2])}</Text>
              </div>
              <Switch
                checked={consent().categories[entry()[0]]}
                aria-labelledby={`consent-${entry()[0]}-label`}
                onChange={on => setConsentCategory(entry()[0], on)}
              />
            </div>
          )}
        </For>
        <Show when={account()}>
          <NewsletterChoice />
        </Show>
      </div>
    </section>
  );
}
