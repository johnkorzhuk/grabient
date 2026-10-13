import {
  confirmDeletion,
  HEAD_CID,
  type Letter,
  type PaletteView,
  pickHead,
  signInCode,
  signInLink
} from "@grabient/email";
import {
  cookieLocale,
  DEFAULT_LOCALE,
  type Locale,
  negotiateLocale,
  splitLocale
} from "@grabient/i18n";
import { all } from "@grabient/server/db/d1.ts";
import { type Email, sendEmail } from "@grabient/server/email/send.ts";
import type { Env } from "@grabient/server/env.ts";

/* The three emails an account receives, as the Worker sends them: in the language of the page that asked, wearing one
   of the Rising list's first palettes, and carrying its head. An account email is opened the moment it comes, and a
   mail app asks for a picture only once the email is open, so a head named by an address comes in after the words: the
   picture goes out attached instead, under the id the email names. The caller counts the email's limits first. */

/** Draws an account email's head: the palette in its view with the wordmark and no chips at `SIZE.heads.sheet`, or the
    brand's gradient left to right when there is none. The card painter gives it. */
export type HeadPainter = (palette: PaletteView | undefined) => Promise<Uint8Array>;

export type AccountEmail =
  | { kind: "sign-in-link"; url: string }
  | { kind: "sign-in-code"; code: string }
  | { kind: "deletion"; url: string };

/** The language an email is written in: the page it was asked from (the request's Referer names it, /ja/login), else the
    language the reader chose, else the one their browser asks for. */
export function emailLocale(headers: Headers | null | undefined): Locale {
  const referer = headers?.get("Referer");
  if (referer) {
    try {
      return splitLocale(new URL(referer).pathname).locale;
    } catch {
      // no page to read it from
    }
  }
  return (
    cookieLocale(headers?.get("Cookie")) ??
    negotiateLocale(headers?.get("Accept-Language")) ??
    DEFAULT_LOCALE
  );
}

/* One read through the Rising index, in the list's own order. An empty gallery or a failed read leaves the brand's
   colors, so no email fails for want of a palette. */
const RISING_FIRST = 24;
async function wornPalette(env: Pick<Env, "DB">): Promise<PaletteView | undefined> {
  try {
    const rows = await all<Required<PaletteView>>(
      env.DB,
      "SELECT seed, style, steps, angle FROM k_palettes ORDER BY rising DESC, created_at DESC, seed LIMIT ?",
      RISING_FIRST
    );
    return pickHead(rows);
  } catch {
    return undefined;
  }
}

function letterOf(
  email: AccountEmail,
  sent: Omit<Parameters<typeof signInLink>[0], "url">
): Letter {
  if (email.kind === "sign-in-link") return signInLink({ ...sent, url: email.url });
  if (email.kind === "sign-in-code") return signInCode({ ...sent, code: email.code });
  return confirmDeletion({ ...sent, url: email.url });
}

/** Sends an account email. Its head goes as PNG bytes, never base64 (the binding sends a string as the attachment's own
    text). If that send fails, or no head could be drawn, the email goes naming the head's address instead. */
export async function sendAccountEmail(
  env: Env,
  to: string,
  email: AccountEmail,
  options: { request?: Request | null; paint?: HeadPainter } = {}
): Promise<void> {
  const origin =
    env.BETTER_AUTH_URL ?? env.PUBLIC_ORIGIN ?? new URL(options.request?.url ?? "").origin;
  const locale = emailLocale(options.request?.headers);
  const palette = await wornPalette(env);
  const write = (carried: boolean) => letterOf(email, { origin, locale, palette, carried });
  let head: Uint8Array | undefined;
  try {
    head = await options.paint?.(palette);
  } catch (error) {
    console.error("email: the head was not drawn", error instanceof Error ? error.message : error);
  }
  if (head) {
    const attachments: EmailAttachment[] = [
      {
        disposition: "inline",
        contentId: HEAD_CID,
        filename: "grabient.png",
        type: "image/png",
        content: head
      }
    ];
    const carried: Email & { attachments: EmailAttachment[] } = { to, ...write(true), attachments };
    try {
      await sendEmail(env, carried);
      return;
    } catch (error) {
      console.error(
        "email: its head could not go with it",
        error instanceof Error ? error.message : error
      );
    }
  }
  await sendEmail(env, { to, ...write(false) });
}
