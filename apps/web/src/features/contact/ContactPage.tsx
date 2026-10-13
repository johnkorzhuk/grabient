import { msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { CopyLine } from "@grabient/ui/CopyLine.tsx";
import { Field } from "@grabient/ui/Field.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { Textarea } from "@grabient/ui/Textarea.tsx";
import { createSignal } from "solid-js";
import * as v from "valibot";
import { offline } from "../../app/connection.ts";
import { CONTACT_EMAIL } from "../../app/site.ts";
import styles from "./Contact.module.css";
import { CONTACT_INVALID, ContactInput, EMAIL_MAX, MESSAGE_MAX } from "./input.ts";

/** What the Worker answers when it refuses a message: its words in English, which the page translates. */
const Refusal = v.object({ error: v.string() });

/** Sends a message; rejects with the words to show, already in the reader's language. */
async function send(input: ContactInput): Promise<void> {
  let answer: Response;
  try {
    answer = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
  } catch {
    throw new Error(t("Couldn't send the message. Try again."));
  }
  if (answer.ok) return;
  const refusal = v.safeParse(Refusal, await answer.json().catch(() => null));
  throw new Error(
    t(refusal.success ? refusal.output.error : msg("Couldn't send the message. Try again."))
  );
}

/** /contact: the form, checked here as the Worker checks it, then the address for a reader who would rather write from
    their own mail. A field no person sees takes what fills every field; its word stays as it is. */
export function ContactPage() {
  const [said, setSaid] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
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
    if (!input.success) {
      setFailed(true);
      setSaid(t(CONTACT_INVALID));
      return;
    }
    setBusy(true);
    try {
      await send(input.output);
      setSaid(t("Sent. Thanks."));
      form.reset();
    } catch (error) {
      setFailed(true);
      setSaid(error instanceof Error ? error.message : t("Couldn't send the message. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class={styles.page}>
      <form class={styles.form} onSubmit={e => void submit(e)} novalidate>
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
          help={t("Only if you want a reply.")}
        />
        <Textarea
          label={t("Message")}
          name="message"
          rows={6}
          maxlength={MESSAGE_MAX}
          required
          placeholder={t("What happened")}
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
