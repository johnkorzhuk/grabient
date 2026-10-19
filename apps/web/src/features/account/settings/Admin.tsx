import { formatDate, msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Placeholder } from "@grabient/ui/Placeholder.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, createStore, For, lazy, onCleanup, Show } from "solid-js";
import { offline } from "../../../app/connection.ts";
import { createOptimisticWrites } from "../../../lib/optimistic.ts";
import { shownError } from "../../../lib/query.ts";
import { sendTestIssue } from "../../newsletter/writes.ts";
import { account, adminTools, isAdmin, setAdminTools } from "../session.ts";
import { FLAG_NAMES, FLAGS, type FlagName, type FlagState, readFlags, writeFlag } from "./flags.ts";
import styles from "./Settings.module.css";

/* An admin's sections: the switch that puts every admin tool away in this browser, a test of the newsletter's sender,
   the newsletter's send, and, with the tools shown, the site's features, a switch each that turns one off for every
   visitor. */

const ARMED_MS = 4000;
// an admin's alone, so no other reader's Settings carries it
const NewsletterSends = lazy(() =>
  import("./NewsletterSends.tsx").then(m => ({ default: m.NewsletterSends }))
);
const MINUTE: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/** The admin tools switch, the newsletter's test and its send, for an admin's account. */
export function AdminSection() {
  const [testing, setTesting] = createSignal(false);
  const [testStatus, setTestStatus] = createSignal("");
  const [testFailed, setTestFailed] = createSignal(false);
  /* one issue to the admin's own address: what came of it takes the line's place, and the press keeps its width and
     the keyboard's focus while the test is out */
  const sendTest = async () => {
    if (testing()) return;
    setTesting(true);
    setTestFailed(false);
    setTestStatus("");
    try {
      await sendTestIssue();
      setTestStatus(t("Sent. Check your inbox."));
    } catch (reason) {
      setTestFailed(true);
      setTestStatus(shownError(reason, msg("Something went wrong. Try again.")));
    } finally {
      setTesting(false);
    }
  };
  return (
    <section class={styles.section} id="admin">
      <div class={styles.head}>
        <Text variant="h2">{t("Admin")}</Text>
        <Text variant="lede">{t("Only admins see this section.")}</Text>
      </div>
      <div class={styles.list}>
        <div class={styles.choice}>
          <div class={styles.choiceText}>
            <Text variant="body" strong id="admin-tools-label">
              {t("Admin tools")}
            </Text>
            <Text variant="small">
              {t("Show curation, votes, agent notes and publishing in this browser.")}
            </Text>
          </div>
          <Switch
            checked={adminTools()}
            aria-labelledby="admin-tools-label"
            onChange={setAdminTools}
          />
        </div>
        <div class={styles.choice}>
          <div class={styles.choiceText}>
            <Text variant="body" strong>
              {t("Newsletter test")}
            </Text>
            <div class={styles.lines}>
              <div
                class={[styles.cell, { [styles.unseen]: !!testStatus() }]}
                id="newsletter-test-line"
              >
                <Text variant="small" as="p">
                  {t("Send a test issue to {email} only.", { email: account()?.email ?? "" })}
                </Text>
              </div>
              <div class={styles.cell}>
                <Status error={testFailed()}>{testStatus()}</Status>
              </div>
            </div>
          </div>
          <Button
            size="lg"
            disabled={testing() || offline()}
            keep
            aria-describedby="newsletter-test-line"
            onClick={() => void sendTest()}
          >
            <span class={styles.words}>
              <span
                class={[styles.cell, { [styles.unseen]: testing() }]}
                aria-hidden={testing() ? "true" : undefined}
              >
                {t("Send test")}
              </span>
              <span
                class={[styles.cell, { [styles.unseen]: !testing() }]}
                aria-hidden={testing() ? undefined : "true"}
              >
                {t("Sending…")}
              </span>
            </span>
          </Button>
        </div>
        <NewsletterSends />
      </div>
    </section>
  );
}

/** The site's features, for an admin with the tools shown. Read once; a press confirms on itself (the first arms the
    row for four seconds, the second writes) and shows at once, as this admin at this minute, while its write goes
    behind it. */
export function SiteFeatures() {
  const queryClient = useQueryClient();
  const key = () => ["flags", account()?.id ?? ""] as const;
  const flags = useQuery(() => ({
    queryKey: key(),
    queryFn: readFlags,
    enabled: isAdmin() && !offline(),
    staleTime: Number.POSITIVE_INFINITY,
    reconcile: "name"
  }));
  /* the rows a press has drawn over what the server held, each until the server answers for it */
  const [pressed, setPressed] = createStore<Partial<Record<FlagName, FlagState>>>({});
  const [failures, setFailures] = createStore<Partial<Record<FlagName, string>>>({});
  const [armed, setArmed] = createSignal<FlagName | null>(null);
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(armTimer));
  const held = (flag: FlagName): FlagState | undefined =>
    pressed[flag] ?? (flags.isSuccess ? flags.data.find(row => row.name === flag) : undefined);
  const who = () => account()?.username || account()?.name || null;
  const writes = createOptimisticWrites<boolean, FlagState>({
    valueOf: state => state.on,
    show: (flag, on, state) =>
      setPressed(draft => {
        draft[flag as FlagName] =
          on === state.on ? state : { ...state, on, updatedAt: Date.now(), updatedBy: who() };
      }),
    send: async (flag, on) => {
      const list = await writeFlag(flag as FlagName, on);
      queryClient.setQueryData(key(), list);
      return (
        list.find(row => row.name === flag) ?? {
          name: flag as FlagName,
          on,
          updatedAt: null,
          updatedBy: null
        }
      );
    },
    live: () => isAdmin()
  });
  const disarm = (flag: FlagName) => {
    if (armed() !== flag) return;
    clearTimeout(armTimer);
    setArmed(null);
  };
  const press = (flag: FlagName, on: boolean) => {
    if (armed() !== flag) {
      clearTimeout(armTimer);
      setArmed(flag);
      armTimer = setTimeout(() => {
        if (armed() === flag) setArmed(null);
      }, ARMED_MS);
      return;
    }
    disarm(flag);
    const state = held(flag);
    if (!state) return;
    setFailures(draft => {
      delete draft[flag];
    });
    writes.set(flag, state, on).catch(reason =>
      setFailures(draft => {
        draft[flag] = shownError(reason, msg("Couldn't save."));
      })
    );
  };
  const readFailure = () =>
    flags.isError && !offline()
      ? shownError(flags.error, msg("Something went wrong. Try again."))
      : "";
  /* who turned a feature off and when: the name when the server has one, and the minute */
  const offLine = (name: string | null, at: number | null) => (
    <Show when={at}>
      {when => (
        <span class={styles.flagLine}>
          <Show when={name}>
            {n => (
              <>
                <Text variant="small">{t("Turned off by {name}", { name: n() })}</Text>
                <Text variant="small">·</Text>
              </>
            )}
          </Show>
          <Text variant="num">{formatDate(when(), MINUTE)}</Text>
        </span>
      )}
    </Show>
  );
  // the minute a press made now would show: its line holds the room under every switch, so no press grows a row
  const now = Date.now();
  return (
    <section class={styles.section} id="features">
      <div class={styles.setting}>
        <div class={[styles.head, styles.settingText]}>
          <Text variant="h2">{t("Site features")}</Text>
          <div class={styles.lines}>
            <div class={[styles.cell, { [styles.unseen]: !!readFailure() }]}>
              <Text variant="lede">{t("Changes reach everyone within a minute.")}</Text>
            </div>
            <div class={styles.cell}>
              <Status error={!!readFailure()}>{readFailure()}</Status>
            </div>
          </div>
        </div>
        <Show when={readFailure()}>
          <span class={styles.settingControl}>
            <Button size="lg" disabled={offline()} onClick={() => void flags.refetch()}>
              {t("Retry")}
            </Button>
          </span>
        </Show>
      </div>
      <div class={styles.list} aria-busy={flags.isSuccess ? "false" : "true"}>
        <For each={FLAG_NAMES} keyed={false}>
          {flag => {
            const state = () => held(flag());
            const failure = () => failures[flag()] ?? "";
            const on = () => state()?.on !== false;
            /* on by its own switch, and off all the same while every feature is */
            const overruled = () => flag() !== "all" && held("all")?.on === false && on();
            const isArmed = () => armed() === flag();
            const label = () => `flag-${flag()}-label`;
            return (
              <div class={styles.flagRow}>
                <div class={styles.choice}>
                  <div class={styles.choiceText}>
                    <Text variant="body" strong id={label()}>
                      {t(FLAGS[flag()].label, { $context: FLAGS[flag()].context })}
                    </Text>
                    <Text variant="small">{t(FLAGS[flag()].line)}</Text>
                  </div>
                  <Show when={state()} fallback={<Placeholder width="56px" height="40px" />}>
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: Escape and the focus leaving disarm the
                        switch inside */}
                    <span
                      class={styles.switchCell}
                      onFocusOut={() => disarm(flag())}
                      onKeyDown={e => {
                        if (e.key !== "Escape" || !isArmed()) return;
                        e.stopPropagation();
                        disarm(flag());
                      }}
                    >
                      <span class={[styles.cell, styles.unseen]} aria-hidden="true">
                        <Switch checked={!on()} onChange={() => {}} />
                      </span>
                      <span class={[styles.cell, styles.unseen]} aria-hidden="true">
                        <Switch checked armed={t("Turn off")} onChange={() => {}} />
                      </span>
                      <span class={[styles.cell, styles.unseen]} aria-hidden="true">
                        <Switch checked={false} armed={t("Turn on")} onChange={() => {}} />
                      </span>
                      <span class={styles.cell}>
                        <Switch
                          checked={on()}
                          armed={isArmed() ? (on() ? t("Turn off") : t("Turn on")) : undefined}
                          aria-labelledby={label()}
                          aria-describedby={isArmed() ? `flag-${flag()}-armed` : undefined}
                          disabled={offline()}
                          onChange={next => press(flag(), next)}
                        />
                      </span>
                    </span>
                  </Show>
                </div>
                {/* under the row, in one place: what the second press does while armed, who turned it off and when,
                    the note while every feature is off, and why a press failed; each holds its room */}
                <div class={styles.lines}>
                  <div class={[styles.cell, styles.unseen]} aria-hidden="true">
                    {offLine(who(), now)}
                  </div>
                  <div class={[styles.cell, styles.unseen]} aria-hidden="true">
                    <Text variant="small" as="p">
                      {t("Press again to turn off for everyone.")}
                    </Text>
                  </div>
                  <div class={[styles.cell, styles.unseen]} aria-hidden="true">
                    <Text variant="small" as="p">
                      {t("Press again to turn on for everyone.")}
                    </Text>
                  </div>
                  <div class={[styles.cell, { [styles.unseen]: on() || !!failure() || isArmed() }]}>
                    {offLine(state()?.updatedBy ?? null, state()?.updatedAt ?? null)}
                  </div>
                  <Show when={flag() !== "all"}>
                    <div
                      class={[
                        styles.cell,
                        { [styles.unseen]: !overruled() || !!failure() || isArmed() }
                      ]}
                    >
                      <Text variant="small" as="p">
                        {t("Off while all features are off")}
                      </Text>
                    </div>
                  </Show>
                  <div
                    class={[styles.cell, { [styles.unseen]: !isArmed() }]}
                    id={`flag-${flag()}-armed`}
                  >
                    <Text variant="small" as="p">
                      {on()
                        ? t("Press again to turn off for everyone.")
                        : t("Press again to turn on for everyone.")}
                    </Text>
                  </div>
                  <div class={[styles.cell, { [styles.unseen]: isArmed() }]}>
                    <Status error={!!failure()}>{failure()}</Status>
                  </div>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </section>
  );
}
