import { localHref, msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Field } from "@grabient/ui/Field.tsx";
import { PageFrame } from "@grabient/ui/PageFrame.tsx";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createSignal, onCleanup } from "solid-js";
import { offline } from "../../app/connection.ts";
import styles from "./Login.module.css";
import { authError, safeRedirect, shownError } from "./session.ts";

const FAILED = msg("Something went wrong. Try again.");

/* The app directories' reviewers sign in to their one account here with its password: the only password the site
   takes, for the one address the deploy names (REVIEWER_EMAIL). No page links here and no search engine keeps it. */
export function PasswordPage(props: { redirect?: string }) {
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  let form!: HTMLFormElement;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (busy() || !form.reportValidity()) return;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email")).trim(),
          password: data.get("password")
        })
      });
      if (disposed) return;
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(authError(body, FAILED));
      }
      location.replace(localHref(safeRedirect(props.redirect)));
    } catch (error) {
      if (!disposed) setMessage(shownError(error, FAILED));
    } finally {
      if (!disposed) setBusy(false);
    }
  };
  return (
    <PageFrame login footer={[]}>
      <Pane variant="frost" padding="lg" bar>
        <form ref={form} class={styles.form} onSubmit={e => void submit(e)} novalidate>
          <Text variant="title" as="h1">
            {t("Sign in")}
          </Text>
          <Field label={t("Email")} name="email" type="email" autocomplete="username" required />
          <Field
            label={t("Password")}
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
          <Button variant="primary" size="lg" full type="submit" disabled={busy() || offline()}>
            {t("Sign in")}
          </Button>
          <Status error={!!message()}>{message()}</Status>
        </form>
      </Pane>
    </PageFrame>
  );
}
