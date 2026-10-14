import { formatDate, localHref, msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Field } from "@grabient/ui/Field.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createSignal, Show } from "solid-js";
import { offline } from "../../../app/connection.ts";
import { forgetAnalytics } from "../../analytics/analytics.ts";
import {
  type Account,
  adminAccount,
  api,
  authError,
  authPost,
  forgetAccount,
  shownError,
  signOut
} from "../session.ts";
import styles from "./Settings.module.css";

// a row keeps its line's height while the account it is for has not answered
const UNKNOWN = "\u00a0";

/** The account itself: its address, whether it is verified, when it joined, and the way out. A sign-out that fails
    says so on the profile's line, since a reader on a shared computer must not walk away signed in. Until the session
    answers there is no account to show: the rows stand empty. */
export function AccountSection(props: { account?: Account; onFailure: (words: string) => void }) {
  return (
    <section class={styles.section} id="account">
      <div class={styles.heading}>
        <Text variant="h2">{t("Account")}</Text>
        <Button
          size="lg"
          disabled={offline() || !props.account}
          onClick={() =>
            void signOut().catch((error: unknown) =>
              props.onFailure(shownError(error, msg("Couldn't sign out.")))
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
            <span dir="auto">{props.account?.email ?? UNKNOWN}</span>
          </dd>
        </div>
        <div class={styles.fact}>
          <dt>{t("Email verification")}</dt>
          <dd>
            {props.account
              ? props.account.emailVerified
                ? t("Verified")
                : t("Not verified")
              : UNKNOWN}
          </dd>
        </div>
        <div class={styles.fact}>
          <dt>{t("Joined")}</dt>
          <dd>
            <Text variant="num">
              {props.account
                ? formatDate(props.account.createdAt, {
                    year: "numeric",
                    month: "numeric",
                    day: "numeric"
                  })
                : UNKNOWN}
            </Text>
          </dd>
        </div>
      </dl>
      <Show when={props.account?.reviewer}>
        <ReviewerPassword />
      </Show>
    </section>
  );
}

/** The password the app directories' reviewers sign in with (/login/password), which their account gives itself here,
    once: the server takes it from that account alone, and refuses a second. */
function ReviewerPassword() {
  const [saving, setSaving] = createSignal(false);
  const [status, setStatus] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  let form!: HTMLFormElement;
  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    if (saving() || !form.reportValidity()) return;
    setSaving(true);
    setFailed(false);
    setStatus(t("Saving…"));
    try {
      const answer = await authPost("/api/auth/reviewer-password", {
        password: new FormData(form).get("password")
      });
      if (!answer.ok) throw new Error(authError(answer.body, msg("Couldn't save.")));
      form.reset();
      setStatus(t("Saved."));
    } catch (error) {
      setFailed(true);
      setStatus(shownError(error, msg("Couldn't save.")));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form ref={form} class={styles.form} onSubmit={e => void save(e)} novalidate>
      {/* nothing of the field changes once drawn: a change of any of its states writes its value again */}
      <Field
        label={t("Password")}
        name="password"
        type="password"
        autocomplete="new-password"
        required
      />
      <div class={styles.actions}>
        <Status error={failed()}>{status()}</Status>
        <Button variant="primary" size="lg" type="submit" disabled={saving() || offline()}>
          {saving() ? t("Saving…") : t("Save")}
        </Button>
      </div>
    </form>
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
      const answer = await authPost("/api/auth/delete-user");
      if (!answer.ok) {
        throw new Error(authError(answer.body, msg("Couldn't send the confirmation email.")));
      }
      setStatus(t("Check your email to confirm."));
    } catch (error) {
      setDeleting(false);
      setFailed(true);
      setStatus(shownError(error, msg("Couldn't delete the account.")));
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
