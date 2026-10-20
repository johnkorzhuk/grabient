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
import { creditKey, creditQuery, writeCredit } from "../credit.ts";
import { account } from "../session.ts";
import styles from "./Settings.module.css";

/* The account's display name on palettes, under Profile beside the name it shows. The server keeps the choice; the
   switch is drawn before the session answers, as the section is, its place held until the choice is read. */

/** The account's display name on the palettes it liked first, which anyone reads there: read and pressed as the
    newsletter is. Off until the account turns it on. An account with no display name has nothing to show: its switch
    stands off and its line says to add one, in the place the line holds for everyone. */
export function CreditChoice() {
  const queryClient = useQueryClient();
  const reachable = () => (offline() ? null : (account()?.id ?? null));
  const key = () => creditKey(account()?.id ?? "");
  const choice = useQuery(() => ({ ...creditQuery(), queryKey: key(), enabled: !!reachable() }));
  const [pressed, setPressed] = createSignal<boolean | null>(null);
  const [pressFailure, setPressFailure] = createSignal("");
  /* the account a press was made for: an answer that comes back after a change of account draws nothing. Read at the
     press, since the switch is drawn before the session answers, when there is no account yet */
  let pressedFor: string | undefined;
  const writes = createOptimisticWrites<boolean, boolean>({
    valueOf: held => held,
    show: (_, on) => setPressed(on),
    send: async (_, on) => {
      const held = await writeCredit(on);
      queryClient.setQueryData(key(), held);
      return held;
    },
    live: () => account()?.id === pressedFor
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
    pressedFor = account()?.id;
    writes
      .set("credit", held, on)
      .catch(reason => setPressFailure(shownError(reason, msg("Couldn't save."))));
  };
  return (
    <div class={styles.choice}>
      <div class={styles.choiceText}>
        <Text variant="body" strong id="credit-label">
          {t("Your display name on palettes")}
        </Text>
        <div class={styles.lines}>
          <div class={[styles.cell, { [styles.unseen]: !!failure() || !named() }]} id="credit-line">
            <Text variant="small" as="p">
              {t("Shows your display name on the palettes you liked first. Anyone can see it.")}
            </Text>
          </div>
          <div
            class={[styles.cell, { [styles.unseen]: !!failure() || named() }]}
            id="credit-unnamed"
          >
            <Text variant="small" as="p">
              {t("Add a display name to turn this on.")}
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
