import { localHref, msg, rich, t } from "@grabient/i18n";
import { Avatar } from "@grabient/ui/Avatar.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import link from "@grabient/ui/link.module.css";
import { PageFrame } from "@grabient/ui/PageFrame.tsx";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createSignal, type Element, onCleanup, onSettled, Show, untrack } from "solid-js";
import type { ConsentProblem } from "../../server/oauth/authorize.ts";
import type { ConsentApp, ConsentPage } from "../../server/oauth/consent.ts";
import { installConnection, offline, signOut, unreachable } from "./account.ts";
import styles from "./Connect.module.css";

/* The consent page. An app sent the account to /oauth/authorize, which led here with the request's handle and the
   request itself (`h` and `r`); the Worker read both before the page drew (readConsent). The sheet is one column, as a
   letter is: the app by its name with who vouches for it, what a yes allows, the account it is for, then Cancel and
   Allow, and under them where a yes leads back to and how long it lasts. The page follows only an address that leads
   back to the one it named, and after a Cancel only one the Worker trusts. Nothing is sent without a press. The frame
   and the sheet are sign-in's. */

export const MCP_SERVER_PAGE = "/mcp-server";

/* why there is nothing to answer, each said in its own line */
const LINES: Readonly<Record<ConsentProblem | "nothing", string>> = {
  invalid: msg("Invalid request. Connect again from your app."),
  unverified: msg("Couldn't verify this app. Connect again from your app."),
  unknown: msg("This app isn't registered. Remove Grabient from the app and add it again."),
  expired: msg("This request expired. Connect again from your app."),
  paused: msg("Connecting apps is paused. Try again later."),
  nothing: msg("No app is waiting. Connect again from your app.")
};
const UNSENT = msg("Couldn't send your answer. Try again.");

/* A value inside a sentence keeps its own direction, so the sentence's punctuation never moves around it: a host or a
   link's scheme reads left to right, and a name an app gave itself is data in whatever script it came in. A sentence
   takes the direction of its own words, so one not translated yet reads left to right in a right-to-left page. */
const ltrPart = (words: (string | Element)[]) => <span dir="ltr">{words}</span>;
const namePart = (words: (string | Element)[]) => <span dir="auto">{words}</span>;
const sentence = (words: Element) => <span dir="auto">{words}</span>;

/** Where a yes or a no leads back to: a site by its host, this computer, or an installed app. */
const placeWords = (place: ConsentApp["returnsTo"]) =>
  place.kind === "site"
    ? place.name
    : place.kind === "local"
      ? t("An app on this computer")
      : sentence(
          rich(
            "An installed app that opens <scheme>{scheme}</scheme> links",
            { scheme: ltrPart },
            { scheme: place.name }
          )
        );
/** Who vouches for the app's name: the domain that published a saved app's document, the document's own claim for an
    app whose document was read, or no one for an app that registered itself. */
const bylineWords = (byline: ConsentApp["byline"]) =>
  byline.kind === "published"
    ? sentence(rich("Published by <host>{host}</host>", { host: ltrPart }, { host: byline.host }))
    : byline.kind === "says"
      ? sentence(
          rich("It says it is <name>{name}</name>.", { name: namePart }, { name: byline.name })
        )
      : t("Name not verified.");
/** Whether an address the Worker answered with leads back to the redirect the sheet named. */
function leadsBack(to: string, redirect: string): boolean {
  try {
    const a = new URL(to);
    const b = new URL(redirect);
    return a.protocol === b.protocol && a.host === b.host && a.pathname === b.pathname;
  } catch {
    return false;
  }
}
/** Sign-in, then the same request again: the Worker reads it from `r` once the account has signed in. */
const signInAgain = (resume: string) =>
  `/login?redirect=${encodeURIComponent(`/oauth/authorize?r=${resume}`)}`;
/** What the Worker's consent route answers: where to go next, or a refusal. */
interface Answer {
  redirect?: unknown;
  url?: unknown;
  error?: unknown;
}
/** A refusal in the reader's words: the Worker's own words for its limits, else the fallback. */
const refusal = (status: number, body: Answer) =>
  t(
    (status === 429 || status === 503) && typeof body.error === "string" && body.error
      ? body.error
      : UNSENT
  );

/** The sheet in sign-in's frame. */
function Sheet(props: { languages?: Element; children: Element }) {
  return (
    <PageFrame login footer={[]} languages={props.languages}>
      <Pane variant="frost" padding="lg" bar>
        <div class={styles.sheet}>{props.children}</div>
      </Pane>
    </PageFrame>
  );
}

/** Nothing to answer: the title, one line that says why and what to do, the page on connecting apps and the way home. */
function Nothing(props: { line: string }) {
  return (
    <>
      <div class={styles.who}>
        <Text variant="title" as="h1">
          {t("Connect an app")}
        </Text>
        <Text variant="lede">{props.line}</Text>
      </div>
      <div class={styles.ways}>
        <Button
          size="lg"
          full
          href={localHref(MCP_SERVER_PAGE)}
          disabled={unreachable(MCP_SERVER_PAGE)}
        >
          {t("How to connect")}
        </Button>
        <Button size="lg" full href={localHref("/")} disabled={unreachable("/")}>
          {t("Browse palettes")}
        </Button>
      </div>
    </>
  );
}

export function ConnectPage(props: {
  /** the facts the Worker read for this request */
  page: ConsentPage;
  /** the language menu, at the end of the frame's footer */
  languages?: Element;
}) {
  onSettled(() => installConnection());
  /* read once: nothing on this page rewrites the request it answers */
  const page = untrack(() => props.page);
  if (page.state !== "ready") {
    const line = page.state === "problem" && page.problem in LINES ? page.problem : "nothing";
    return (
      <Sheet languages={props.languages}>
        <Nothing line={t(LINES[line])} />
      </Sheet>
    );
  }
  return <Ready page={page} languages={props.languages} />;
}

function Ready(props: { page: Extract<ConsentPage, { state: "ready" }>; languages?: Element }) {
  const { app, account, handle, resume, admin } = untrack(() => props.page);
  /* the admin tools start off every time: only the admin's own press adds them */
  const [tools, setTools] = createSignal(false);
  const [sending, setSending] = createSignal<"allow" | "cancel" | "switch" | null>(null);
  /* answered, or past answering: the presses rest and the status line says how it ended */
  const [settled, setSettled] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  /* after a Cancel to an address the Worker does not trust: the page names it and the reader decides */
  const [back, setBack] = createSignal<{ url: string; host: string } | null>(null);
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const again = signInAgain(resume);
  const end = (line: string, error = false) => {
    setSettled(true);
    setFailed(error);
    setMessage(line);
  };

  const answer = async (accept: boolean) => {
    if (sending() || settled()) return;
    setSending(accept ? "allow" : "cancel");
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch("/oauth/consent", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          resume,
          account: account.id,
          accept,
          ...(admin && accept ? { admin: tools() } : {})
        })
      });
      const body = (await response.json().catch(() => ({}))) as Answer;
      if (disposed) return;
      /* the session ended since the page drew: sign in again, and the same request comes back here */
      if (response.status === 401) {
        location.assign(localHref(again));
        return;
      }
      const to =
        response.ok && typeof body.url === "string" && leadsBack(body.url, app.redirect)
          ? body.url
          : "";
      if (to && body.redirect === true) {
        /* an installed app's address opens the app and leaves this page standing, so the page says it is done */
        end(
          t(
            accept
              ? msg("The app is connected. You can close this tab.")
              : msg("Nothing was shared. You can close this tab.")
          )
        );
        location.assign(to);
        return;
      }
      if (to && body.redirect === false) {
        end(t("Cancelled. Nothing was shared."));
        setBack({ url: to, host: new URL(to).host });
        return;
      }
      /* answered already, run out, or another account's by now: only the app can ask again */
      if (response.status === 409 || (response.status === 400 && body.error === "expired"))
        end(t(LINES.expired), true);
      else if (response.status === 400 && body.error === "unverified")
        end(t(LINES.unverified), true);
      else {
        setFailed(true);
        setMessage(refusal(response.status, body));
      }
    } catch {
      if (!disposed) {
        setFailed(true);
        setMessage(t(UNSENT));
      }
    } finally {
      if (!disposed) setSending(null);
    }
  };
  const busy = () => !!sending() || settled() || offline();
  /* another account: this one signs out here, and sign-in brings the same request back for the account chosen there.
     It rests with Cancel and Allow: once the request is answered or on its way there is nothing to answer */
  const switchOff = () => busy() || unreachable(again);
  const useAnother = async (e: MouseEvent) => {
    e.preventDefault();
    if (switchOff()) return;
    setSending("switch");
    setFailed(false);
    setMessage("");
    try {
      await signOut(again);
    } catch (error) {
      if (disposed) return;
      setSending(null);
      setFailed(true);
      setMessage(error instanceof Error && error.message ? error.message : t(UNSENT));
    }
  };
  return (
    <Sheet languages={props.languages}>
      <div class={styles.who}>
        <Text variant="micro" as="p">
          {t("Connect an app")}
        </Text>
        {/* a domain reads left to right; a name the app gave itself is data, shown as written */}
        <Text variant="title" as="h1" dir={app.byline.kind === "says" ? "ltr" : "auto"}>
          {app.name ?? t("Unnamed app")}
        </Text>
        <Text variant="small" as="p">
          {bylineWords(app.byline)}
        </Text>
      </div>
      <Text variant="body">{t("It can see and change your saved palettes and collections.")}</Text>
      <div class={styles.account}>
        {/* the address beside it says whose: the letter is not read out a second time */}
        <span aria-hidden="true">
          <Avatar name={account.email} />
        </span>
        <div class={styles.lines}>
          <Text variant="ui" as="span" strong dir="auto">
            {account.email}
          </Text>
          <Text variant="small" as="span">
            {rich("Not you? <switch>Use another account</switch>", {
              switch: words => (
                <a
                  class={[link.inline, styles.switch]}
                  href={switchOff() ? undefined : localHref(again)}
                  aria-disabled={switchOff() ? "true" : undefined}
                  onClick={e => void useAnother(e)}
                >
                  {words}
                </a>
              )
            })}
          </Text>
        </div>
      </div>
      {/* a request any program on the computer could have made with this app's name */}
      <Show when={app.loopback}>
        <Text variant="body" id="connect-caution">
          {t("Continue only if you started connecting from an app on this computer.")}
        </Text>
      </Show>
      <Show when={admin}>
        <div class={styles.row}>
          <div class={styles.rowText}>
            <Text variant="ui" strong id="connect-admin">
              {t("Admin tools")}
            </Text>
            <Text variant="small" id="connect-admin-line">
              {t(
                "Publish and schedule palettes and collections, and edit or remove ones the site made."
              )}
            </Text>
          </div>
          <Switch
            checked={tools()}
            aria-labelledby="connect-admin"
            aria-describedby="connect-admin-line"
            disabled={busy()}
            onChange={setTools}
          />
        </div>
      </Show>
      <div class={styles.answer}>
        <div class={styles.actions}>
          <Button size="lg" full disabled={busy()} onClick={() => void answer(false)}>
            {t("Cancel")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            full
            disabled={busy()}
            aria-describedby={app.loopback ? "connect-caution" : undefined}
            onClick={() => void answer(true)}
          >
            {sending() === "allow" ? t("Connecting…") : t("Allow")}
          </Button>
        </div>
        <div class={styles.under}>
          {/* where a yes leads back to tells a real app from one that borrowed its name; once the request is answered,
              the line that says how it ended stands in this cell */}
          <div
            class={styles.print}
            data-unseen={message() ? "" : undefined}
            aria-hidden={message() ? "true" : undefined}
          >
            <span class={styles.place}>
              <Text variant="small" as="span">
                {t("Returns to")}
              </Text>
              <Text
                variant="small"
                as="span"
                strong
                dir={app.returnsTo.kind === "site" ? "ltr" : undefined}
              >
                {placeWords(app.returnsTo)}
              </Text>
            </span>
            <Text variant="small" as="p">
              {t("It stays connected until you disconnect it or don't use it for a year.")}
            </Text>
          </div>
          <div class={styles.foot}>
            <Status error={failed()}>{message()}</Status>
            <Show when={back()}>
              {to => (
                <Button href={to().url} disabled={unreachable(to().url)}>
                  {sentence(
                    rich("Return to <host>{host}</host>", { host: ltrPart }, { host: to().host })
                  )}
                </Button>
              )}
            </Show>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
