import { msg, t } from "@grabient/i18n";
import { Placeholder } from "@grabient/ui/Placeholder.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, Show, untrack } from "solid-js";
import { offline } from "../../../app/connection.ts";
import { createOptimisticWrites } from "../../../lib/optimistic.ts";
import { shownError } from "../../../lib/query.ts";
import { choiceQuery } from "../../newsletter/queries.ts";
import { writeChoice } from "../../newsletter/writes.ts";
import { creditKey, creditQuery, writeCredit } from "../credit.ts";
import { account } from "../session.ts";
import styles from "./Settings.module.css";

/* The account's own privacy choices, which the server keeps: its newsletter, and its username on the palettes it liked
   first. Drawn once the account is known. */

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

/** The account's username on the palettes it liked first, which anyone reads there: read and pressed as the newsletter
    is. Off until the account turns it on. An account with no username has nothing to show: its switch stands off and
    its line says where to add one, in the place the line holds for everyone. */
function CreditChoice() {
  const queryClient = useQueryClient();
  const reachable = () => (offline() ? null : (account()?.id ?? null));
  const key = () => creditKey(account()?.id ?? "");
  const choice = useQuery(() => ({ ...creditQuery(), queryKey: key(), enabled: !!reachable() }));
  const [pressed, setPressed] = createSignal<boolean | null>(null);
  const [pressFailure, setPressFailure] = createSignal("");
  const id = untrack(() => account()?.id);
  const writes = createOptimisticWrites<boolean, boolean>({
    valueOf: held => held,
    show: (_, on) => setPressed(on),
    send: async (_, on) => {
      const held = await writeCredit(on);
      queryClient.setQueryData(key(), held);
      return held;
    },
    live: () => account()?.id === id
  });
  const named = () => !!account()?.username;
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
      .set("credit", held, on)
      .catch(reason => setPressFailure(shownError(reason, msg("Couldn't save."))));
  };
  return (
    <div class={styles.choice}>
      <div class={styles.choiceText}>
        <Text variant="body" strong id="credit-label">
          {t("Your name on palettes")}
        </Text>
        <div class={styles.lines}>
          <div class={[styles.cell, { [styles.unseen]: !!failure() || !named() }]} id="credit-line">
            <Text variant="small" as="p">
              {t("Shows your username on the palettes you liked first. Anyone can see it.")}
            </Text>
          </div>
          <div
            class={[styles.cell, { [styles.unseen]: !!failure() || named() }]}
            id="credit-unnamed"
          >
            <Text variant="small" as="p">
              {t("Add a username in Profile to turn this on.")}
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
          aria-labelledby="credit-label"
          aria-describedby={named() ? "credit-line" : "credit-unnamed"}
          disabled={offline() || (!named() && shown() !== true)}
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
        <Text variant="h2">{t("Privacy")}</Text>
      </div>
      <div class={styles.list}>
        <NewsletterChoice />
        <CreditChoice />
      </div>
    </section>
  );
}
