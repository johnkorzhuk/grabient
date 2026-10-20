import { msg, t } from "@grabient/i18n";
import { Placeholder } from "@grabient/ui/Placeholder.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, Show } from "solid-js";
import { offline } from "../../../app/connection.ts";
import { createOptimisticWrites } from "../../../lib/optimistic.ts";
import { shownError } from "../../../lib/query.ts";
import { choiceQuery } from "../../newsletter/queries.ts";
import { writeChoice } from "../../newsletter/writes.ts";
import { account } from "../session.ts";
import styles from "./Settings.module.css";

/* The account's newsletter switch, under Account beside the address it goes to. The server keeps the choice; the
   switch is drawn before the session answers, as the section is, its place held until the choice is read. */

/** The account's newsletter: read once per account while online, and again when a lost connection returns. A press
    shows at once and its write goes behind it; why a read or a press failed takes the line's place, so the row never
    grows. Disabled with no connection. */
export function NewsletterChoice() {
  const queryClient = useQueryClient();
  // the account to read for: none while offline, so a connection that returns reads again what failed
  const reachable = () => (offline() ? null : (account()?.id ?? null));
  const key = () => [...choiceQuery().queryKey, account()?.id ?? ""];
  const choice = useQuery(() => ({ ...choiceQuery(), queryKey: key(), enabled: !!reachable() }));
  const [pressed, setPressed] = createSignal<boolean | null>(null);
  const [pressFailure, setPressFailure] = createSignal("");
  /* the account a press was made for: an answer that comes back after a change of account draws nothing. Read at the
     press, since the switch is drawn before the session answers, when there is no account yet */
  let pressedFor: string | undefined;
  const writes = createOptimisticWrites<boolean, boolean>({
    valueOf: held => held,
    show: (_, on) => setPressed(on),
    send: async (_, on) => {
      const held = await writeChoice(on);
      queryClient.setQueryData(key(), held);
      return held;
    },
    live: () => account()?.id === pressedFor
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
    pressedFor = account()?.id;
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
