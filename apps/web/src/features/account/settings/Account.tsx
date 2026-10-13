import { formatDate, localHref, msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createSignal } from "solid-js";
import { offline } from "../../../app/connection.ts";
import { forgetAnalytics } from "../../analytics/analytics.ts";
import { type Account, adminAccount, api, authError, forgetAccount, signOut } from "../session.ts";
import styles from "./Settings.module.css";

/** The account itself: its address, whether it is verified, when it joined, and the way out. A sign-out that fails
    says so on the profile's line, since a reader on a shared computer must not walk away signed in. */
export function AccountSection(props: { account: Account; onFailure: (words: string) => void }) {
  return (
    <section class={styles.section} id="account">
      <div class={styles.heading}>
        <Text variant="h2">{t("Account")}</Text>
        <Button
          size="lg"
          disabled={offline()}
          onClick={() =>
            void signOut().catch((error: unknown) =>
              props.onFailure(
                error instanceof Error && error.message ? error.message : t("Couldn't sign out.")
              )
            )
          }
        >
          {t("Sign out")}
        </Button>
      </div>
      <dl class={styles.facts}>
        <div class={styles.fact}>
          <dt>{t("Email")}</dt>
          <dd>
            <span dir="auto">{props.account.email}</span>
          </dd>
        </div>
        <div class={styles.fact}>
          <dt>{t("Email verification")}</dt>
          <dd>{props.account.emailVerified ? t("Verified") : t("Not verified")}</dd>
        </div>
        <div class={styles.fact}>
          <dt>{t("Joined")}</dt>
          <dd>
            <Text variant="num">
              {formatDate(props.account.createdAt, {
                year: "numeric",
                month: "numeric",
                day: "numeric"
              })}
            </Text>
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Last, since it cannot be taken back. Without a token the press asks for the email that confirms it; with the
    email's token it deletes the account. An admin's account is not deleted here: the line says so, the press rests,
    and the section keeps its height. A status takes the warning's place, so the press never moves. */
export function DeletionSection(props: { token: string | null }) {
  const [deleting, setDeleting] = createSignal(false);
  const [status, setStatus] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  const remove = async () => {
    if (deleting() || adminAccount()) return;
    setDeleting(true);
    setStatus("");
    setFailed(false);
    try {
      if (props.token) {
        await api("/api/settings/delete-account", { token: props.token });
        forgetAnalytics();
        await forgetAccount();
        location.replace(localHref("/"));
        return;
      }
      const response = await fetch("/api/auth/delete-user", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(authError(body, msg("Couldn't send the confirmation email.")));
      }
      setStatus(t("Check your email to confirm."));
    } catch (error) {
      setDeleting(false);
      setFailed(true);
      setStatus(
        error instanceof Error && error.message ? error.message : t("Couldn't delete the account.")
      );
    }
  };
  return (
    <section class={styles.section} id="danger-zone">
      <div class={styles.setting}>
        <div class={[styles.head, styles.settingText]}>
          <Text variant="h2">
            {props.token ? t("Confirm account deletion") : t("Delete account")}
          </Text>
          <div class={styles.lines}>
            <div class={[styles.cell, { [styles.unseen]: !!status() || adminAccount() }]}>
              <Text variant="lede">{t("Permanently delete your account and saved palettes.")}</Text>
            </div>
            <div
              class={[styles.cell, { [styles.unseen]: !!status() || !adminAccount() }]}
              id="delete-admin"
            >
              <Text variant="lede">{t("Admin accounts can't be deleted here.")}</Text>
            </div>
            <div class={styles.cell}>
              <Status error={failed()}>{status()}</Status>
            </div>
          </div>
        </div>
        <span class={styles.settingControl}>
          <Button
            size="lg"
            danger
            disabled={deleting() || adminAccount() || offline()}
            aria-describedby={adminAccount() ? "delete-admin" : undefined}
            onClick={() => void remove()}
          >
            {props.token ? t("Confirm deletion") : t("Delete account")}
          </Button>
        </span>
      </div>
    </section>
  );
}
