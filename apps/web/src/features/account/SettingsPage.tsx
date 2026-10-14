import { localHref, t } from "@grabient/i18n";
import { Rule } from "@grabient/ui/Rule.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useRouter } from "@tanstack/solid-router";
import { createSignal, onSettled, Show, untrack } from "solid-js";
import { BrandFrame } from "../../app/Frames.tsx";
import { account, adminAccount, isAdmin, loadAccount, sessionReady } from "./session.ts";
import { AccountSection, DeletionSection } from "./settings/Account.tsx";
import { AdminSection, SiteFeatures } from "./settings/Admin.tsx";
import { ColorFormatSetting, MotionSetting, ThemeSetting } from "./settings/Appearance.tsx";
import { PrivacySection } from "./settings/Privacy.tsx";
import { Profile } from "./settings/Profile.tsx";
import styles from "./settings/Settings.module.css";

/* Settings. Theme, Reduce motion, Color format and the privacy choices belong to this browser and work signed out;
   the profile, the account, the newsletter and the deletion belong to the account. An admin also sees the admin tools
   switch, a test of the newsletter's sender and, with the tools on, the site's features. Deleting the account stands
   last, after everything that can be taken back. */
export function SettingsPage(props: {
  /** the deletion email's token, which the page takes out of the address as it reads it */
  token?: string;
}) {
  const router = useRouter();
  const token = untrack(() => props.token) ?? null;
  const [name, setName] = createSignal("");
  const [notice, setNotice] = createSignal("");
  onSettled(() => {
    /* nothing that reads the address (a recording, a shared screen, the history) keeps the token: Sign in carries it
       on, and a reload has lost it */
    if (token) void router.navigate({ href: localHref("/settings"), replace: true });
    void loadAccount(true).then(() => {
      setName(account()?.username ?? "");
      if (account() && token) {
        requestAnimationFrame(() =>
          document.getElementById("danger-zone")?.scrollIntoView({ block: "center" })
        );
      }
    });
  });
  const back = token ? `/settings?token=${encodeURIComponent(token)}` : "/settings";
  return (
    <BrandFrame page="settings">
      <div class={styles.stack}>
        <header class={styles.head}>
          <Text variant="title" as="h1">
            {t("Settings")}
          </Text>
          <Text variant="lede">{t("Profile, account and privacy.")}</Text>
        </header>
        <Rule />
        <Profile back={back} name={name} onSaved={setName} notice={notice} />
        {/* drawn before the session answers too, empty, for the account this browser kept, so nothing under it moves
            when the account lands; a visitor's page shows none of it (Settings.module.css) */}
        <Show when={account() || !sessionReady()}>
          <div class={styles.own} data-for={sessionReady() ? "account" : undefined}>
            <Rule />
            <AccountSection account={account() ?? undefined} onFailure={setNotice} />
          </div>
        </Show>
        <Show when={adminAccount()}>
          <Rule />
          <AdminSection />
        </Show>
        <Show when={isAdmin()}>
          <Rule />
          <SiteFeatures />
        </Show>
        <Rule />
        <ThemeSetting />
        <Rule />
        <MotionSetting />
        <Rule />
        <ColorFormatSetting />
        <Rule />
        <PrivacySection />
        <Show when={account()}>
          <Rule />
          <DeletionSection token={token} />
        </Show>
      </div>
    </BrandFrame>
  );
}
