import { CONTACT_EMAIL } from "@grabient/email/addresses.ts";
import { msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { CopyLine } from "@grabient/ui/CopyLine.tsx";
import { Field } from "@grabient/ui/Field.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { Textarea } from "@grabient/ui/Textarea.tsx";
import { createSignal, flush } from "solid-js";
import * as v from "valibot";
import { offline } from "../../app/connection.ts";
import { shownError } from "../../lib/query.ts";
import { api } from "../account/session.ts";
import styles from "./Contact.module.css";
import { CONTACT_INVALID, ContactInput, EMAIL_MAX, MESSAGE_MAX } from "./input.ts";

const UNSENT = msg("Couldn't send the message. Try again.");
/* how long the line stays empty before a failure is said again */
const SAID_AGAIN_MS = 60;

/** /contact: the form, checked here as the Worker checks it, then the address for a reader who would rather write from
    their own mail. A field that fails the check says why under itself, which describes it, and takes the keyboard; the
    line under the form says the rule each time. A refusal says the Worker's own words (a limit, contact turned off),
    in the reader's language. A field no person sees takes what fills every field; its word stays as it is. */
export function ContactPage() {
  const [said, setSaid] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  /* the fields the check found wrong */
  const [wrong, setWrong] = createSignal<readonly string[]>([]);
  /* the words follow what was typed: Solid writes a field's value again whenever another of its states changes (an
     error shown), which would empty it */
  const [email, setEmail] = createSignal("");
  const [message, setMessage] = createSignal("");
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (busy()) return;
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const input = v.safeParse(ContactInput, {
      email: String(values.get("email") ?? ""),
      message: String(values.get("message") ?? ""),
      website: values.get("website") || undefined
    });
    setSaid("");
    setFailed(false);
    setWrong([]);
    if (!input.success) {
      setFailed(true);
      setWrong(input.issues.map(issue => String(issue.path?.[0]?.key ?? "")));
      flush();
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      /* the line empties first, so the same words said again are heard again */
      setTimeout(() => setSaid(t(CONTACT_INVALID)), SAID_AGAIN_MS);
      return;
    }
    setBusy(true);
    try {
      await api("/api/contact", input.output);
      setSaid(t("Sent. Thanks."));
      form.reset();
      setEmail("");
      setMessage("");
    } catch (error) {
      setFailed(true);
      setSaid(shownError(error, UNSENT));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class={styles.page}>
      {/* a press before the page has started must not write the message to the address: with this method and no
          dialog around it, a submit the page does not take goes nowhere */}
      <form class={styles.form} method="dialog" onSubmit={e => void submit(e)} novalidate>
        <div class={styles.head}>
          <Text variant="title" as="h1">
            {t("Contact")}
          </Text>
          <Text variant="lede">{t("Tell us what's broken or what you need.")}</Text>
        </div>
        <Field
          label={t("Email · optional")}
          name="email"
          type="email"
          autocomplete="email"
          inputmode="email"
          maxlength={EMAIL_MAX}
          placeholder={t("name@example.com")}
          value={email()}
          onInput={setEmail}
          invalid={wrong().includes("email")}
          help={
            wrong().includes("email")
              ? t("Use a valid email, or leave it empty.")
              : t("Only if you want a reply.")
          }
        />
        <Textarea
          label={t("Message")}
          name="message"
          rows={6}
          maxlength={MESSAGE_MAX}
          required
          placeholder={t("What happened")}
          value={message()}
          onInput={setMessage}
          invalid={wrong().includes("message")}
          help={wrong().includes("message") ? t("Write 5 to 5,000 characters.") : undefined}
        />
        <label class={styles.honey} aria-hidden="true">
          Website
          <input name="website" tabindex={-1} autocomplete="off" />
        </label>
        <div class={styles.actions}>
          <Status error={failed()}>{busy() ? t("Sending…") : said()}</Status>
          <Button variant="primary" size="lg" type="submit" disabled={busy() || offline()}>
            {busy() ? t("Sending…") : t("Send")}
          </Button>
        </div>
      </form>
      <section class={styles.write}>
        <Text variant="body" as="p">
          {t("Or email us.")}
        </Text>
        <CopyLine text={CONTACT_EMAIL} aria-label={t("Copy address")} />
      </section>
    </div>
  );
}
