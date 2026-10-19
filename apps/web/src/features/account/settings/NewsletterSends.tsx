import { formatDate, msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Field } from "@grabient/ui/Field.tsx";
import { Segmented } from "@grabient/ui/Segmented.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, onCleanup, Show } from "solid-js";
import { offline } from "../../../app/connection.ts";
import { shownError } from "../../../lib/query.ts";
import {
  type PauseReason,
  type Problem,
  SEGMENTS,
  type Segment,
  type SendAction,
  type SendsAnswer,
  type SendView
} from "../../newsletter/input.ts";
import { readSends, stepSend } from "../../newsletter/writes.ts";
import { account, isAdmin } from "../session.ts";
import styles from "./Settings.module.css";

/* An admin's send of the newsletter (server/newsletter/sends.ts). Prepare finds the readers and checks the issue,
   sending nothing; the proof goes to this admin alone; arming takes the count typed back and a start at least fifteen
   minutes ahead. Cancel and resume each confirm on themselves, as the site's features do. While a send is armed or
   going out, its counts are read again every ten seconds. */

const ARMED_MS = 4000;
const POLL_MS = 10_000;
/* the server's own: a start sooner than this is refused */
const LEAD_MS = 15 * 60_000;
const ACTIVE: ReadonlySet<string> = new Set(["prepared", "armed", "sending", "paused"]);
const WHEN: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short"
};
const UTC: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC"
};

const GROUPS: Readonly<Record<Segment, string>> = {
  admins: msg("Admins only"),
  likers: msg("People who liked a palette"),
  everyone: msg("Everyone it hasn't reached")
};
const REASONS: Readonly<Record<PauseReason, string>> = {
  admin: msg("Paused by an admin."),
  failures: msg("Paused itself: more than 2% of the emails failed."),
  errors: msg("Paused itself: Resend failed three times in a row."),
  key: msg("Paused itself: Resend refused the key."),
  changed: msg("Paused itself: Resend saw a different email under the same key."),
  daily: msg("Paused itself: 5,000 emails went out in the last day."),
  sender: msg("Paused itself: the newsletter has no sender."),
  reach: msg("Paused itself: this deploy may not send to that address."),
  quota: msg("Paused itself: Resend's sending quota ran out."),
  links: msg("Paused itself: a link or picture in the email stopped loading."),
  late: msg("Paused itself: it hadn't started an hour after its start time. Resume to send it now.")
};

/* a time as a date-and-time field holds it, in this browser's zone */
function fieldValue(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}
/* the next 9:00 in this browser's zone that can still be armed */
function nextNine(now: number): string {
  const nine = new Date(now);
  nine.setHours(9, 0, 0, 0);
  if (nine.getTime() < now + LEAD_MS) nine.setDate(nine.getDate() + 1);
  return fieldValue(nine.getTime());
}
const at = (ms: number) =>
  t("{when}, {utc} UTC", { when: formatDate(ms, WHEN), utc: formatDate(ms, UTC) });

function problemLine(problem: Problem): string {
  if (problem.kind === "link") {
    return problem.status
      ? t("{url} answered {status}.", { url: problem.url, status: String(problem.status) })
      : t("{url} didn't answer.", { url: problem.url });
  }
  if (problem.kind === "outside") return t("{url} leaves the site.", { url: problem.url });
  if (problem.kind === "size") {
    return t("The email is {size} KB, and Gmail cuts off an email past 102 KB.", {
      size: String(Math.ceil(problem.bytes / 1024))
    });
  }
  return t("The email has no unsubscribe link.");
}

/* how far a send has got: what went, what was left out on the way, and what is left */
function progress(send: SendView): string {
  const { sent, skipped, failed, unknown, queued, sending } = send.counts;
  const line = t("{sent} sent, {skipped} skipped, {failed} failed, {left} to go.", {
    sent: String(sent),
    skipped: String(skipped),
    failed: String(failed),
    left: String(queued + sending)
  });
  return unknown
    ? `${line} ${t("{count} unconfirmed: Resend may have taken them, so they won't be sent again.", { count: String(unknown) })}`
    : line;
}

/** The newsletter's send, for an admin: the form while none is under way, else the send and its presses. */
export function NewsletterSends() {
  const queryClient = useQueryClient();
  const key = () => ["newsletter-sends", account()?.id ?? ""] as const;
  const live = (answer: SendsAnswer | undefined) =>
    !!answer?.sends.some(send => send.state === "armed" || send.state === "sending");
  const sends = useQuery(() => ({
    queryKey: key(),
    queryFn: readSends,
    enabled: isAdmin() && !offline(),
    refetchInterval: query => (live(query.state.data) ? POLL_MS : false)
  }));
  const [segment, setSegment] = createSignal<Segment>("admins");
  const [problems, setProblems] = createSignal<Problem[]>([]);
  const [failure, setFailure] = createSignal("");
  const [note, setNote] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [start, setStart] = createSignal(nextNine(Date.now()));
  const [typed, setTyped] = createSignal("");
  const [confirming, setConfirming] = createSignal<"cancel" | "resume" | null>(null);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(confirmTimer));

  const answer = () => (sends.isSuccess ? sends.data : undefined);
  const active = () => answer()?.sends.find(send => ACTIVE.has(send.state));
  const last = () => answer()?.sends.find(send => !ACTIVE.has(send.state));
  const issue = () => answer()?.issues[0];
  const startMs = () => new Date(start()).getTime();
  const startOk = () => Number.isFinite(startMs()) && startMs() >= Date.now() + LEAD_MS;
  const startHelp = () => (startOk() ? at(startMs()) : t("Start at least 15 minutes from now."));

  const step = async (action: SendAction, done?: string) => {
    if (busy()) return;
    setBusy(true);
    setFailure("");
    setNote("");
    setProblems([]);
    try {
      const next = await stepSend(action);
      queryClient.setQueryData(key(), next);
      setProblems(next.problems ?? []);
      if (done) setNote(done);
    } catch (reason) {
      setFailure(shownError(reason, msg("Something went wrong. Try again.")));
    } finally {
      setBusy(false);
    }
  };
  const confirm = (what: "cancel" | "resume", id: string) => {
    clearTimeout(confirmTimer);
    if (confirming() !== what) {
      setConfirming(what);
      confirmTimer = setTimeout(() => setConfirming(null), ARMED_MS);
      return;
    }
    setConfirming(null);
    void step({ action: what, id });
  };
  const press = (label: string, action: () => void, disabled = false) => (
    <Button size="lg" disabled={busy() || offline() || disabled} onClick={action}>
      {label}
    </Button>
  );

  return (
    <div class={styles.send}>
      <div class={styles.choiceText}>
        <Text variant="body" strong>
          {t("Send an issue")}
        </Text>
        <Text variant="small">
          {t("Prepare a send, read its proof, then arm it. Nothing goes out before its start.")}
        </Text>
        <Show when={answer() && !answer()?.reaches}>
          <Text variant="small">
            {t("This deploy sends only to admins and Resend's test addresses.")}
          </Text>
        </Show>
      </div>
      <Show
        when={active()}
        fallback={
          <Show when={issue()}>
            {shown => (
              <>
                <Text variant="small">
                  {t("Issue {number}: {title}", {
                    number: String(shown().number),
                    title: shown().title
                  })}
                </Text>
                <Segmented
                  aria-label={t("Who gets it")}
                  options={SEGMENTS.map(value => ({ value, label: t(GROUPS[value]) }))}
                  value={segment()}
                  onChange={value => setSegment(value as Segment)}
                />
                <div class={styles.sendPresses}>
                  {press(
                    t("Prepare"),
                    () =>
                      void step({ action: "prepare", issue: shown().number, segment: segment() })
                  )}
                </div>
                <Show when={last()}>
                  {done => (
                    <Text variant="small">
                      {done().state === "done"
                        ? t("Last send finished {when}.", {
                            when: at(done().finishedAt ?? done().createdAt)
                          })
                        : t("Last send was cancelled {when}.", {
                            when: at(done().finishedAt ?? done().createdAt)
                          })}{" "}
                      {progress(done())}
                    </Text>
                  )}
                </Show>
              </>
            )}
          </Show>
        }
      >
        {send => (
          <>
            <Text variant="small">
              {t("Issue {number}: {title}", { number: String(send().issue), title: send().title })}{" "}
              · {t(GROUPS[send().segment])} ·{" "}
              {t("{count, plural, one {# person} other {# people}}", { count: send().recipients })}
            </Text>
            <Show when={send().state === "prepared"}>
              <Text variant="small">
                {t(
                  "Left out: {unsubscribed} opted out or waiting for a yes, {personas} personas, {undeliverable} test addresses, {already} already sent it.",
                  {
                    unsubscribed: String(send().leftOut.unsubscribed),
                    personas: String(send().leftOut.personas),
                    undeliverable: String(send().leftOut.undeliverable),
                    already: String(send().leftOut.already)
                  }
                )}
              </Text>
              <Text variant="small">
                {t("Checked {links} links and pictures. The email is {size} KB.", {
                  links: String(send().checks.links),
                  size: String(Math.ceil(send().checks.bytes / 1024))
                })}
              </Text>
              <div class={styles.sendFields}>
                <Field
                  label={t("Start time")}
                  name="newsletter-start"
                  type="datetime-local"
                  value={start()}
                  invalid={!startOk()}
                  help={startHelp()}
                  onInput={setStart}
                />
                <Field
                  label={t("Type {count} to arm", { count: String(send().counts.queued) })}
                  name="newsletter-count"
                  inputmode="numeric"
                  value={typed()}
                  onInput={setTyped}
                />
              </div>
              <div class={styles.sendPresses}>
                {press(
                  t("Arm"),
                  () =>
                    void step({
                      action: "arm",
                      id: send().id,
                      count: Number(typed()),
                      startsAt: startMs()
                    }).then(() => setTyped("")),
                  typed() !== String(send().counts.queued) || !startOk()
                )}
                {press(
                  t("Send me the proof"),
                  () => void step({ action: "proof", id: send().id }, t("Sent. Check your inbox."))
                )}
                {press(t("Cancel"), () => confirm("cancel", send().id))}
              </div>
            </Show>
            <Show when={send().state === "armed"}>
              <Text variant="small">
                {t("Armed. Starts {when}.", { when: at(send().startsAt ?? 0) })}
              </Text>
              <Show when={!answer()?.on}>
                <Status error>
                  {t("The newsletter is off in Site features. Nothing goes out until it's on.")}
                </Status>
              </Show>
              <div class={styles.sendPresses}>
                {press(t("Pause"), () => void step({ action: "pause", id: send().id }))}
                {press(
                  t("Send me the proof"),
                  () => void step({ action: "proof", id: send().id }, t("Sent. Check your inbox."))
                )}
                {press(t("Cancel"), () => confirm("cancel", send().id))}
              </div>
            </Show>
            <Show when={send().state === "sending"}>
              <Text variant="small">{t("Sending now, at most fifty a minute.")}</Text>
              <Text variant="small">{progress(send())}</Text>
              <div class={styles.sendPresses}>
                {press(t("Pause"), () => void step({ action: "pause", id: send().id }))}
              </div>
            </Show>
            <Show when={send().state === "paused"}>
              <Status error={send().reason !== "admin"}>
                {t(REASONS[send().reason ?? "admin"])}
              </Status>
              <Text variant="small">{progress(send())}</Text>
              <div class={styles.sendPresses}>
                {press(t("Resume"), () => confirm("resume", send().id))}
                {press(t("Cancel"), () => confirm("cancel", send().id))}
              </div>
            </Show>
            <Show when={confirming()}>
              {what => (
                <Text variant="small" as="p">
                  {what() === "cancel"
                    ? t("Press again to cancel the send.")
                    : t("Press again to resume the send.")}
                </Text>
              )}
            </Show>
          </>
        )}
      </Show>
      <Show when={problems().length}>
        <Status error>{t("The issue didn't pass its checks, so nothing changed.")}</Status>
        <For each={problems()}>
          {problem => (
            <Text variant="small" as="p">
              {problemLine(problem)}
            </Text>
          )}
        </For>
      </Show>
      <Status error={!!failure()}>{failure() || note()}</Status>
    </div>
  );
}
