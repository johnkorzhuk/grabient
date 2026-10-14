import { localHref, msg, t } from "@grabient/i18n";
import { Avatar } from "@grabient/ui/Avatar.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { Field } from "@grabient/ui/Field.tsx";
import { NavLink } from "@grabient/ui/NavLink.tsx";
import { Placeholder } from "@grabient/ui/Placeholder.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { isServer } from "@solidjs/web";
import { createSignal, isHydrating, onCleanup, Show } from "solid-js";
import { offline } from "../../../app/connection.ts";
import { shownError } from "../../../lib/query.ts";
import { inView } from "../../list/appearance.ts";
import {
  account,
  api,
  engineNow,
  keptUserId,
  loginHref,
  refreshSession,
  sessionReady
} from "../session.ts";
import { readUsername, USERNAME_MAX } from "../username.ts";
import styles from "./Settings.module.css";

/* The account's picture and username. The username's rules are the Worker's own (username.ts), so the field says what
   the server would refuse, in the reader's language, and asks the server whether the name is free half a second after
   the last keystroke. A picture is cropped to a square and drawn at 256 by 256 as WebP in the browser, and sent with
   the name when Save is pressed. */

const AVATAR_SIDE = 256;
const AVATAR_FILE_MAX = 5 * 1024 * 1024;
const CHECK_AFTER_MS = 500;

/** A chosen picture as the server keeps it: its middle square, 256 by 256, as WebP. */
async function avatarBlob(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error(t("Choose a JPG, PNG or WebP image."));
  }
  if (file.size > AVATAR_FILE_MAX) throw new Error(t("Choose an image up to 5MB."));
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = AVATAR_SIDE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(t("Couldn't read this image."));
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIDE,
      AVATAR_SIDE
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error(t("Couldn't read this image.")))),
        "image/webp",
        0.9
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Profile(props: {
  /** the address Sign in leads back to: Settings, with a deletion's token when the page came with one */
  back: string;
  /** the name as the server holds it, which the field starts at once the session is known */
  name: () => string;
  onSaved: (name: string) => void;
  /** a failure from beyond the form that this line says: a sign-out the server refused */
  notice: () => string;
}) {
  const [typed, setTyped] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal("");
  const [failed, setFailed] = createSignal(false);
  const [checking, setChecking] = createSignal(false);
  const [available, setAvailable] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [staged, setStaged] = createSignal<{ blob: Blob; url: string } | null>(null);
  let fileInput!: HTMLInputElement;
  let checkTimer: ReturnType<typeof setTimeout> | undefined;
  let asked = 0;
  const current = () => account()?.username ?? "";
  const wanted = () => (typed() ?? props.name()).trim();
  const problem = (name: string) => {
    const read = readUsername(name);
    return read.problem === null ? "" : t(read.problem);
  };
  const changed = () => wanted() !== current() || !!staged();
  const canSave = () =>
    changed() &&
    !saving() &&
    !checking() &&
    available() &&
    (wanted() === current() || !problem(wanted()));
  const unstage = () => {
    const held = staged();
    if (held) URL.revokeObjectURL(held.url);
    setStaged(null);
  };
  onCleanup(() => {
    clearTimeout(checkTimer);
    const held = staged();
    if (held) URL.revokeObjectURL(held.url);
  });
  const say = (words: string, failure = false) => {
    setFailed(failure);
    setStatus(words);
  };

  const check = (value: string) => {
    setTyped(value);
    say("");
    setAvailable(true);
    setChecking(false);
    clearTimeout(checkTimer);
    const turn = ++asked;
    const name = value.trim();
    if (name === current()) return;
    const broken = problem(name);
    if (broken) {
      say(broken, true);
      return;
    }
    setChecking(true);
    checkTimer = setTimeout(async () => {
      try {
        const answer = await api<{ available: boolean }>("/api/settings/username/check", {
          username: name
        });
        if (turn !== asked) return;
        setAvailable(answer.available);
        say(answer.available ? "" : t("That username is taken."), !answer.available);
      } catch {
        if (turn !== asked) return;
        setAvailable(false);
        say(t("Couldn't check the username. Try again."), true);
      } finally {
        if (turn === asked) setChecking(false);
      }
    }, CHECK_AFTER_MS);
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await avatarBlob(file);
      unstage();
      setStaged({ blob, url: URL.createObjectURL(blob) });
      say("");
    } catch (error) {
      // a picture the browser cannot decode fails in the browser's own words: the page says its own
      say(shownError(error, msg("Couldn't read this image.")), true);
    }
    fileInput.value = "";
  };

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!canSave() || offline()) return;
    setSaving(true);
    say(t("Saving…"));
    try {
      const held = staged();
      if (held) {
        const response = await fetch("/api/settings/avatar", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "image/webp" },
          body: held.blob
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: unknown };
          throw new Error(
            t(typeof body.error === "string" ? body.error : msg("Couldn't upload the avatar."))
          );
        }
        unstage();
      }
      const renamed = wanted() !== current();
      if (renamed) await api("/api/settings/username", { username: wanted() });
      const user = await refreshSession(true);
      setTyped(null);
      props.onSaved(user?.username ?? "");
      /* a new username moved the account's private collections under it: the copy hears where before the form says
         so, so the next page leads to their new addresses */
      if (renamed) await engineNow()?.syncWithin(3000);
      say(t("Saved."));
    } catch (error) {
      say(shownError(error, msg("Couldn't save.")), true);
    } finally {
      setSaving(false);
    }
  };

  const shownName = () => account()?.username || account()?.name || undefined;
  /* Who the section draws for: the account or a visitor once the session answers, and until then whoever this browser
     kept, so nothing moves when the answer is the likely one and no reader is shown the other's page first. The
     server's document cannot know: it holds both the form and the way in, unmarked, and its head's script shows one
     (Settings.module.css). */
  const fromDocument = isServer || isHydrating();
  const drawnFor = () => {
    if (sessionReady()) return account() ? "account" : "visitor";
    return fromDocument ? undefined : keptUserId() ? "account" : "visitor";
  };
  return (
    <section class={[styles.section, styles.profile]} id="profile" data-for={drawnFor()}>
      <div class={styles.head}>
        <div class={styles.heading}>
          <Text variant="h2">{t("Profile")}</Text>
          <Show when={!!account() || !sessionReady()}>
            <span class={styles.account}>
              <NavLink href={localHref(inView("/palettes/saved"))} small>
                {t("Saved palettes")}
              </NavLink>
            </span>
          </Show>
        </div>
        <div class={styles.account}>
          <Text variant="lede">{t("Update your username and avatar.")}</Text>
        </div>
        <div class={styles.visitor}>
          <Text variant="lede">{t("Sign in to change your profile.")}</Text>
        </div>
      </div>
      <Show when={!account()}>
        <div class={styles.visitor}>
          <Button
            variant="primary"
            size="lg"
            href={localHref(loginHref(props.back))}
            disabled={offline()}
          >
            {t("Sign in")}
          </Button>
        </div>
      </Show>
      {/* drawn before the session answers too, for the account this browser kept, with nothing to change until it
          does: the form is where it lands, and nothing moves */}
      <Show when={!!account() || !sessionReady()}>
        <form class={[styles.form, styles.account]} onSubmit={e => void save(e)}>
          <div class={styles.avatarRow}>
            <Show
              when={account()}
              fallback={<Placeholder width="64px" height="64px" round="surface" />}
            >
              <Avatar
                size="lg"
                name={shownName()}
                src={staged()?.url || account()?.image || undefined}
              />
            </Show>
            <div class={styles.avatarText}>
              <input
                ref={fileInput}
                class={styles.hidden}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={event => void choose(event.currentTarget.files?.[0])}
              />
              <Button
                size="lg"
                disabled={!account() || saving() || offline()}
                onClick={() => (staged() ? unstage() : fileInput.click())}
              >
                {staged() ? t("Keep current avatar") : t("Change avatar")}
              </Button>
              <Text variant="caption">{t("JPG, PNG or WebP, up to 5MB.")}</Text>
            </div>
          </div>
          {/* the value follows what was typed: Solid writes it again whenever another of the field's states
                changes (an error shown, the connection lost), which would put the saved name back */}
          <Field
            label={t("Username")}
            name="username"
            value={typed() ?? props.name()}
            autocomplete="username"
            maxlength={USERNAME_MAX}
            invalid={failed()}
            disabled={!account() || offline()}
            help={t("Letters, numbers, underscores and hyphens.")}
            onInput={check}
          />
          <div class={styles.actions}>
            {/* with no connection neither the name nor the picture can change, and the line says so */}
            <Status error={(failed() || !!props.notice()) && !offline()}>
              {offline()
                ? t("You're offline.")
                : props.notice() || (checking() ? t("Checking…") : status())}
            </Status>
            <Button variant="primary" size="lg" type="submit" disabled={!canSave() || offline()}>
              {saving() ? t("Saving…") : t("Save")}
            </Button>
          </div>
        </form>
      </Show>
    </section>
  );
}
