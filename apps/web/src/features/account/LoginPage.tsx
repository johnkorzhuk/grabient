import { localHref, msg, rich, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Field } from "@grabient/ui/Field.tsx";
import link from "@grabient/ui/link.module.css";
import { PageFrame } from "@grabient/ui/PageFrame.tsx";
import { Pane } from "@grabient/ui/Pane.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useRouter } from "@tanstack/solid-router";
import { createSignal, onCleanup, onSettled, Show, untrack } from "solid-js";
import { offline } from "../../app/connection.ts";
import { Languages } from "../../app/Frames.tsx";
import { trackLoginStart } from "../analytics/analytics.ts";
import styles from "./Login.module.css";
import { account, authError, loadAccount, loginHref, safeRedirect } from "./session.ts";

/* Sign in and sign up are one page: Google, or a link by email. While an app connects (the authorization page sends
   the reader here with its request), the email sends a code instead, typed in the window that asked: a link opens in
   whatever browser the mail app picks, where the app's window never learns of it. The code's field and Sign in stand
   under the send from the start, disabled until a code is on its way, so the sheet never grows; then Sign in is the
   primary press and the send asks for another code. */

// a refusal of the site's email ceilings (429), or of a limiter that cannot count (503): Google still works
const EMAIL_BUSY = msg("Email sign-in is busy. Try again later or use Google.");
const FAILED = msg("Something went wrong. Try again.");
// a wrong code, one past its five minutes, or a fourth try: the same words, and a new code is one press away
const CODE_REFUSED = msg("Wrong or expired code.");
const GOOGLE_FAILED = msg("Google sign-in failed.");
const RESEND_S = 30;
/* Where the sheet leads once signed in, kept for this tab as it leaves for Google. A sign-in that fails there comes
   back to /login?error=… without the sheet's query, so the sheet reads it here, within the ten minutes Google's state
   lasts: a failure that comes later is not that press's. */
const KEPT_RETURN = "grabient-sign-in-return";
const KEPT_FOR_MS = 600_000;
function keptReturn(): string | null {
  try {
    const [, at, to] = /^(\d+) (.+)$/.exec(sessionStorage.getItem(KEPT_RETURN) ?? "") ?? [];
    return to && Date.now() - Number(at) < KEPT_FOR_MS ? to : null;
  } catch {
    return null;
  }
}
function keepReturn(to: string | null) {
  try {
    if (to === null) sessionStorage.removeItem(KEPT_RETURN);
    else sessionStorage.setItem(KEPT_RETURN, `${Date.now()} ${to}`);
  } catch {
    // no storage: the sheet comes back without where it led
  }
}
/** The digits of a code typed in any script, with any spaces or dashes between them. */
const digitsOf = (typed: string) =>
  typed
    .normalize("NFKC")
    .replace(/[٠-٩۰-۹๐-๙]/g, d =>
      String(d.charCodeAt(0) - (d >= "๐" ? 0x0e50 : d >= "۰" ? 0x06f0 : 0x0660))
    )
    .replace(/\D/g, "");

/** A POST to the sign-in library, through the Worker's gate: the answer's status and body. */
async function ask(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    ok: response.ok,
    body: await response.json().catch(() => ({}))
  };
}

const GoogleG = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.8 2.3 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"
    />
    <path
      fill="#FBBC05"
      d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
    />
  </svg>
);

export function LoginPage(props: {
  /** where the sheet leads once signed in, as the address asked */
  redirect?: string;
  /** back from a Google sign-in that failed: the library names why in the address */
  error?: string;
}) {
  const router = useRouter();
  const [googleFailed, asked] = untrack(() => [props.error !== undefined, props.redirect]);
  /* Where the sheet leads once signed in: what the address asks, which the server reads too, or, back from a Google
     sign-in that failed, what this tab kept as it left, which the browser alone knows and reads once the sheet stands. */
  const [to, setTo] = createSignal(safeRedirect(asked));
  // an app's request waits behind this sign-in (the authorization page carries it in `r`)
  const connecting = () => to().startsWith("/oauth/authorize");
  const [sending, setSending] = createSignal(false);
  const [checking, setChecking] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  const [wait, setWait] = createSignal(0);
  const [codeOpen, setCodeOpen] = createSignal(false);
  let form!: HTMLFormElement;
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    clearInterval(timer);
  });
  const say = (words: string, failure = false) => {
    setFailed(failure);
    setMessage(words);
  };
  onSettled(() => {
    if (googleFailed) {
      const back = safeRedirect(asked ?? keptReturn());
      setTo(back);
      // said once the sheet stands, so a screen reader hears the line change
      say(t(GOOGLE_FAILED), true);
      // the sheet's own address again, before any press: a reload or another language says nothing of the failure
      void router.navigate({
        href: localHref(back === "/" ? "/login" : loginHref(back)),
        replace: true
      });
    }
    // what was kept answers one return: a sheet opened any other way starts without it
    keepReturn(null);
    void loadAccount(true).then(() => {
      if (!disposed && account()) location.replace(localHref(to()));
    });
    // backing out of Google's account picker brings this page back from the browser's cache as it was left
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setSending(false);
      setChecking(false);
      say("");
    };
    addEventListener("pageshow", restored);
    return () => removeEventListener("pageshow", restored);
  });
  const input = (name: "email" | "code") =>
    form.elements.namedItem(name) as HTMLInputElement | null;
  /* the email's send waits half a minute before it may send again */
  const startWait = () => {
    setWait(RESEND_S);
    clearInterval(timer);
    let left = RESEND_S;
    timer = setInterval(() => {
      left -= 1;
      setWait(left);
      if (!left) clearInterval(timer);
    }, 1000);
  };
  const sendLink = async (email: string) => {
    setSending(true);
    say(t("Sending…"));
    try {
      trackLoginStart("magic_link");
      const answer = await ask("/api/auth/sign-in/magic-link", {
        email,
        callbackURL: localHref(to())
      });
      if (disposed) return;
      if (!answer.ok)
        throw new Error(authError(answer.body, msg("Couldn't send the link. Try again.")));
      say(t("Check your email. The link expires in 5 minutes."));
      startWait();
    } catch (error) {
      if (!disposed) say(error instanceof Error && error.message ? error.message : t(FAILED), true);
    } finally {
      if (!disposed) setSending(false);
    }
  };
  const sendCode = async (email: string) => {
    setSending(true);
    say("");
    try {
      const answer = await ask("/api/auth/email-otp/send-verification-otp", {
        email,
        type: "sign-in"
      });
      if (disposed) return;
      if (answer.status === 429 || answer.status === 503) {
        say(t(EMAIL_BUSY), true);
        return;
      }
      if (!answer.ok) throw new Error(authError(answer.body, FAILED));
      // a new code replaces the last: its field is emptied and takes the keyboard
      const field = input("code");
      if (field) field.value = "";
      setCodeOpen(true);
      startWait();
      requestAnimationFrame(() => {
        if (!disposed) input("code")?.focus();
      });
    } catch (error) {
      if (!disposed) say(error instanceof Error && error.message ? error.message : t(FAILED), true);
    } finally {
      if (!disposed) setSending(false);
    }
  };
  /* the email's own field is checked alone: the code's is still empty when another code is asked for */
  const send = () => {
    const field = input("email");
    if (!field?.reportValidity() || sending() || wait()) return;
    const email = field.value.trim();
    void (connecting() ? sendCode(email) : sendLink(email));
  };
  const checkCode = async () => {
    const email = input("email");
    const code = input("code");
    if (!email || !code || !email.reportValidity() || checking()) return;
    /* the refusal is said on the status line: what was typed stays in the field */
    const refused = () => {
      say(t(CODE_REFUSED), true);
      code.focus();
      code.select();
    };
    const otp = digitsOf(code.value);
    if (otp.length !== 6) {
      refused();
      return;
    }
    setChecking(true);
    say("");
    try {
      const answer = await ask("/api/auth/sign-in/email-otp", { email: email.value.trim(), otp });
      if (disposed) return;
      if (answer.status === 400 || answer.status === 403) {
        refused();
        return;
      }
      if (!answer.ok) throw new Error(authError(answer.body, FAILED));
      location.replace(localHref(to()));
    } catch (error) {
      if (!disposed) say(error instanceof Error && error.message ? error.message : t(FAILED), true);
    } finally {
      if (!disposed) setChecking(false);
    }
  };
  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    if (connecting() && codeOpen()) void checkCode();
    else send();
  };
  const signInWithGoogle = async () => {
    if (sending()) return;
    setSending(true);
    say("");
    try {
      trackLoginStart("google");
      // a failure comes back to this sheet in its language, where what is kept here says where it led
      keepReturn(to() === "/" ? null : to());
      const answer = await ask("/api/auth/sign-in/social", {
        provider: "google",
        callbackURL: localHref(to()),
        errorCallbackURL: localHref("/login")
      });
      const url = (answer.body as { url?: unknown }).url;
      if (!answer.ok || typeof url !== "string")
        throw new Error(authError(answer.body, GOOGLE_FAILED));
      location.href = url;
    } catch (error) {
      if (disposed) return;
      setSending(false);
      say(error instanceof Error && error.message ? error.message : t(GOOGLE_FAILED), true);
    }
  };
  /* what the email's press says: sending, waiting to send again, or what it sends */
  const sendWords = () =>
    sending()
      ? t("Sending…")
      : wait()
        ? t("{seconds, plural, one {Resend in #s} other {Resend in #s}}", { seconds: wait() })
        : connecting()
          ? t("Send code")
          : t("Send link");
  return (
    <PageFrame
      login
      footer={[]}
      languages={<Languages />}
      note={
        <p class={styles.legal}>
          {rich(
            "By continuing you agree to the <terms>Terms of Service</terms> and <privacy>Privacy Policy</privacy>.",
            {
              terms: words => (
                <a class={link.inline} href={localHref("/terms")}>
                  {words}
                </a>
              ),
              privacy: words => (
                <a class={link.inline} href={localHref("/privacy")}>
                  {words}
                </a>
              )
            }
          )}
        </p>
      }
    >
      <Pane variant="frost" padding="lg" bar>
        <form ref={form} class={styles.form} onSubmit={submit} novalidate>
          <Text variant="title" as="h1">
            {t("Sign in")}
          </Text>
          <div class={styles.sub}>
            <Text variant="lede">
              {connecting()
                ? t("Connect an app to your account.")
                : t("Save your favorite palettes.")}
            </Text>
          </div>
          <Button
            size="lg"
            full
            disabled={sending() || checking() || offline()}
            onClick={() => void signInWithGoogle()}
          >
            <GoogleG /> {t("Sign in with Google")}
          </Button>
          {/* plain words between the two ways in: a separator role would hide its words from a screen reader */}
          <div class={styles.or}>
            <span class={styles.line} aria-hidden="true" />
            <span>{t("or continue with email")}</span>
            <span class={styles.line} aria-hidden="true" />
          </div>
          <Field
            label={t("Email")}
            name="email"
            type="email"
            autocomplete="email"
            inputmode="email"
            placeholder={t("name@example.com")}
            required
          />
          {/* once a code is on its way the send asks for another and Sign in under it is the one primary press: Enter
              presses whichever is the form's submit */}
          <Button
            variant={codeOpen() ? "secondary" : "primary"}
            size="lg"
            full
            type={codeOpen() ? "button" : "submit"}
            disabled={sending() || wait() > 0 || offline()}
            onClick={() => {
              if (codeOpen()) send();
            }}
          >
            {sendWords()}
          </Button>
          <Show when={connecting()}>
            <Field
              label={t("Code")}
              name="code"
              autocomplete="one-time-code"
              inputmode="numeric"
              required
              disabled={!codeOpen()}
              help={t("Enter the 6-digit code from your email.")}
            />
            <Button
              variant={codeOpen() ? "primary" : "secondary"}
              size="lg"
              full
              type={codeOpen() ? "submit" : "button"}
              disabled={!codeOpen() || checking() || offline()}
            >
              {t("Sign in")}
            </Button>
          </Show>
          <Status error={failed()}>{message()}</Status>
        </form>
      </Pane>
    </PageFrame>
  );
}
