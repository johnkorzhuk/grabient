import { formatDate, msg, rich, t } from "@grabient/i18n";
import { announce } from "@grabient/ui/announce.ts";
import { Button } from "@grabient/ui/Button.tsx";
import { Label } from "@grabient/ui/Label.tsx";
import { Placeholder } from "@grabient/ui/Placeholder.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, Errored, For, Loading, Show } from "solid-js";
import { shownError } from "../../lib/query.ts";
import type { Connection } from "../../server/oauth/connections.ts";
import { adminAccount } from "../account/session.ts";
import styles from "./ConnectedApps.module.css";
import { connectionsQuery, disconnectApp } from "./connections.ts";

/* The apps an account allowed to use it, at the end of the MCP page: one card, an app to a row, each with the press
   that ends it. A row reads across as a table's does (the app and who published it, when it was connected, then
   Disconnect) and every row keeps the same columns. An app held in more than one session lately says how many:
   Disconnect ends them all. A press takes the row away at once and the write goes behind it; a refusal puts the row
   back and says why under the app's name. */

/** How long a disconnected app stays away whatever a read says: the Worker's list can lag its writes by a minute. */
const LAG_MS = 60_000;
const FAILED = msg("Something went wrong. Try again.");

/** An app's name as it is shown: the one its document or registration gave, or words that say it gave none. */
const nameOf = (app: Connection) => app.name ?? t("Unnamed app");

export function ConnectedApps(props: { account: string }) {
  const client = useQueryClient();
  const query = useQuery(() => connectionsQuery(props.account));
  /* apps taken away from this page: gone at once, back with the reason when the Worker refuses */
  const [gone, setGone] = createSignal<ReadonlySet<string>>(new Set());
  const [refusals, setRefusals] = createSignal<Readonly<Record<string, string>>>({});
  const apps = () => query.data.connections.filter(app => !gone().has(app.clientId));
  const without = (set: ReadonlySet<string>, id: string) => new Set([...set].filter(x => x !== id));

  const disconnect = async (app: Connection) => {
    const key = connectionsQuery(props.account).queryKey;
    setRefusals(({ [app.clientId]: _, ...rest }) => rest);
    setGone(all => new Set([...all, app.clientId]));
    /* the row leaves without a sound: a reader who listens is told */
    announce(t("{name} is disconnected", { name: nameOf(app) }));
    /* a read on its way began before the write, and would bring the row back */
    await client.cancelQueries({ queryKey: key });
    try {
      await disconnectApp(app.clientId);
      client.setQueryData(key, held =>
        held ? { connections: held.connections.filter(c => c.clientId !== app.clientId) } : held
      );
      setTimeout(() => setGone(all => without(all, app.clientId)), LAG_MS);
    } catch (reason) {
      setGone(all => without(all, app.clientId));
      setRefusals(all => ({
        ...all,
        [app.clientId]: shownError(reason, msg("Couldn't disconnect the app. Try again."))
      }));
    }
  };
  /* who vouches for the app's name: the domain that published its document, or no one for an app that registered
     itself. The host reads left to right inside the sentence, which takes the direction of its own words */
  const byline = (app: Connection) =>
    app.verifiedHost ? (
      <Text variant="small" as="div">
        <span dir="auto">
          {rich(
            "Published by <host>{host}</host>",
            { host: words => <span dir="ltr">{words}</span> },
            { host: app.verifiedHost }
          )}
        </span>
      </Text>
    ) : (
      <Text variant="small" as="div">
        {t("Not verified", { $context: "app" })}
      </Text>
    );
  return (
    <section class={styles.section} id="connections">
      <div class={styles.head}>
        <Text variant="h2">{t("Connected apps")}</Text>
        <Text variant="lede">{t("Apps you allowed to use your account.")}</Text>
      </div>
      <Errored
        fallback={(error, reset) => (
          <div class={styles.retry}>
            <Status error>{shownError(error(), FAILED)}</Status>
            <Button
              onClick={() => {
                void query.refetch();
                reset();
              }}
            >
              {t("Retry")}
            </Button>
          </div>
        )}
      >
        <Loading
          fallback={
            <div class={styles.quiet} aria-busy="true">
              <Placeholder width="min(240px, 100%)" />
            </div>
          }
        >
          <Show
            when={apps().length}
            fallback={
              <div class={styles.quiet}>
                <Text variant="ui" as="p">
                  {t("No apps connected yet.")}
                </Text>
              </div>
            }
          >
            <ul class={styles.list}>
              {/* a row is its app, whatever a later read says of it: a press lands on the app it was aimed at */}
              <For each={apps()} keyed={app => app.clientId}>
                {app => {
                  const refusal = () => refusals()[app().clientId] ?? "";
                  return (
                    <li class={styles.row}>
                      <div class={styles.who}>
                        <span class={styles.name}>
                          <Text variant="h3" as="span" dir="auto">
                            {nameOf(app())}
                          </Text>
                          <Show when={adminAccount() && app().scopes.includes("admin")}>
                            <Label>{t("Admin tools")}</Label>
                          </Show>
                        </span>
                        {/* who published it and the line a refusal takes, in one cell: the row is as tall with either */}
                        <div class={styles.lines}>
                          <div class={styles.cell} data-unseen={refusal() ? "" : undefined}>
                            {byline(app())}
                          </div>
                          <div class={styles.cell}>
                            <Status error={!!refusal()}>{refusal()}</Status>
                          </div>
                        </div>
                        <Show when={app().sessions > 1}>
                          <Text variant="small" as="div">
                            {t("{count, plural, one {# session} other {# sessions}}", {
                              count: app().sessions
                            })}
                          </Text>
                        </Show>
                      </div>
                      <dl class={styles.date}>
                        <dt class={styles.word}>
                          <Text variant="small" as="span">
                            {t("Connected")}
                          </Text>
                        </dt>
                        <dd class={styles.value}>
                          <Text variant="num">{formatDate(app().connectedAt)}</Text>
                        </dd>
                      </dl>
                      <span class={styles.control}>
                        <Button
                          aria-label={t("Disconnect {name}", { name: nameOf(app()) })}
                          onClick={() => void disconnect(app())}
                        >
                          {t("Disconnect")}
                        </Button>
                      </span>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </Loading>
      </Errored>
    </section>
  );
}
