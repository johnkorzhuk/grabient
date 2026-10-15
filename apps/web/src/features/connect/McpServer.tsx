import { CONTACT_EMAIL } from "@grabient/email/addresses.ts";
import { msg, rich, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { type CodeTab, CodeTabs } from "@grabient/ui/CodeTabs.tsx";
import { CopyLine } from "@grabient/ui/CopyLine.tsx";
import link from "@grabient/ui/link.module.css";
import { type FrameLink, PageFrame } from "@grabient/ui/PageFrame.tsx";
import { Rule } from "@grabient/ui/Rule.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createMemo, type Element, For, Show } from "solid-js";
import { unreachable } from "../../app/connection.ts";
import { account } from "../account/session.ts";
import { trackEvent } from "../analytics/analytics.ts";
import { ConnectedApps } from "./ConnectedApps.tsx";
import styles from "./McpServer.module.css";
import { MCP_LINKS, MCP_PATH, MCP_SETUPS, otherSetup } from "./mcp-apps.ts";

/* /mcp-server: how an AI app is connected to Grabient. The server needs an account, so every app signs in when it is
   added. First the address every app takes, with Copy, and one-click links for the apps whose makers give one; then
   each app's setup by hand, a tab each; then the sign-in. Then what a connected app can do, things to ask it, what to
   do when an app doesn't connect, and the apps the account connected, each with the press that ends it. The page's own words read nothing of the account: the
   list is drawn once the browser knows the account, which the server never does. */

/* in the order a stuck connection is most often freed */
const FIXES = [
  msg("Sign in to Grabient in the browser your app opens, then add Grabient again."),
  msg("Remove Grabient from your app and add it once more."),
  msg("Disconnect the apps you no longer use under Connected apps on this page.")
];

const CAN_DO = [
  msg("Search palettes by words, hex codes or another palette."),
  msg("Browse the gallery and public collections."),
  msg("Make palettes from colors and show them."),
  msg("Save palettes to your account."),
  msg("Make, edit and delete your collections.")
];
const TO_ASK = [
  msg("Find five calm palettes for a meditation app."),
  msg("Make a palette from {first} and {second}, and save it."),
  msg("Put my warm palettes in a collection called Sunsets.")
];
/* the example's hex codes are values: a right-to-left sentence keeps a value's own direction, where a code written into
   the words would show its # at the wrong end */
const EXAMPLE = { first: "#14213d", second: "#fca311" };

export function McpServerPage(props: {
  /** the site's public origin, the same on both sides whatever host the page was reached on (siteOrigin) */
  origin: string;
  /** the brand pages' frame: their navigation, the way home, the footer and the language menu */
  nav?: readonly FrameLink[];
  all?: FrameLink;
  footer?: readonly FrameLink[];
  languages?: Element;
}) {
  const address = () => props.origin + MCP_PATH;
  /* each app's setup, then the shape most other apps read; a guide on another site leads nowhere offline */
  const setups = createMemo((): CodeTab[] => [
    ...MCP_SETUPS.map(setup => ({
      label: setup.label,
      code: setup.code(address()),
      where: setup.terminal
        ? { text: t("Terminal") }
        : setup.where
          ? { text: setup.where, path: true }
          : undefined,
      guide: {
        label: t("{app}'s guide", { app: setup.label }),
        href: unreachable(setup.guide) ? undefined : setup.guide
      }
    })),
    {
      label: t("Other"),
      code: otherSetup(address()),
      where: { text: t("Your app's MCP settings") }
    }
  ]);
  return (
    <PageFrame
      nav={props.nav}
      all={props.all}
      footer={props.footer ?? []}
      languages={props.languages}
    >
      <article class={styles.article}>
        <header class={styles.head}>
          {/* a name, the same in every language */}
          <Text variant="title" as="h1">
            MCP
          </Text>
          <Text variant="lede">
            {t(
              "Connect an AI app like Claude to your Grabient account. It can search, make and save palettes for you."
            )}
          </Text>
        </header>
        <section class={styles.section}>
          <div class={styles.intro}>
            <Text variant="h2">{t("Add Grabient to your app")}</Text>
            <Text variant="body" as="p">
              {t("In your app, add a custom connector or MCP server with this address.")}
            </Text>
          </div>
          <CopyLine
            text={address()}
            aria-label={t("Copy address")}
            onCopy={() => trackEvent("copy_mcp_address")}
          />
          <div class={styles.clicks}>
            <Text variant="body" as="p" id="mcp-ways">
              {t("Or add it in one click.")}
            </Text>
            <ul class={styles.ways} aria-labelledby="mcp-ways">
              {/* a page on its maker's site opens in a new tab, and an app's own address opens the app */}
              <For each={MCP_LINKS} keyed={false}>
                {way => (
                  <li>
                    <Button
                      href={way().link(address())}
                      external={way().web}
                      disabled={unreachable(way().link(address()))}
                      onClick={() => trackEvent("add_mcp_app", { app: way().label })}
                    >
                      {t("Add to {app}", { app: way().label })}
                    </Button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </section>
        {/* each tab says where its setup goes, so the heading stands alone */}
        <section class={styles.section}>
          <Text variant="h2">{t("Manual setup")}</Text>
          <CodeTabs
            aria-label={t("Apps")}
            tabs={setups()}
            onCopy={tab => trackEvent("copy_mcp_setup", { app: tab.label })}
          />
        </section>
        <section class={styles.section}>
          <div class={styles.intro}>
            <Text variant="h2">{t("Sign in")}</Text>
            <Text variant="body" as="p">
              {t(
                "Your app asks you to sign in when you add Grabient. Choose Allow. It stays connected until you disconnect it or don't use it for a year."
              )}
            </Text>
            <Text variant="body" as="p">
              {t(
                "If your app asks how to sign in, choose OAuth. Claude Code, Codex and Devin sign in with the second line of their setup, or from their MCP settings."
              )}
            </Text>
          </div>
        </section>
        <Rule />
        <section class={styles.section}>
          <Text variant="h2">{t("What an app can do")}</Text>
          <ul class={styles.list}>
            <For each={CAN_DO} keyed={false}>
              {line => (
                <li>
                  <Text variant="body" as="span">
                    {t(line())}
                  </Text>
                </li>
              )}
            </For>
          </ul>
          <Text variant="body" as="p">
            {t("New palettes you save join the public gallery, without your name.")}
          </Text>
        </section>
        <section class={styles.section}>
          <Text variant="h2">{t("Try asking")}</Text>
          <ul class={styles.asks}>
            <For each={TO_ASK} keyed={false}>
              {line => (
                <li class={styles.ask}>
                  <Text variant="body" as="span">
                    {t(line(), EXAMPLE)}
                  </Text>
                </li>
              )}
            </For>
          </ul>
        </section>
        <section class={styles.section}>
          <Text variant="h2">{t("If it doesn't connect")}</Text>
          <ul class={styles.list}>
            <For each={FIXES} keyed={false}>
              {line => (
                <li>
                  <Text variant="body" as="span">
                    {t(line())}
                  </Text>
                </li>
              )}
            </For>
          </ul>
          <Text variant="body" as="p">
            {rich(
              "Still stuck? Write to <email>{email}</email>.",
              {
                email: words => (
                  <a class={link.inline} href={`mailto:${CONTACT_EMAIL}`} dir="ltr">
                    {words}
                  </a>
                )
              },
              { email: CONTACT_EMAIL }
            )}
          </Text>
        </section>
        <Show when={account()}>
          {signedIn => (
            <>
              <Rule />
              <ConnectedApps account={signedIn().id} />
            </>
          )}
        </Show>
      </article>
    </PageFrame>
  );
}
