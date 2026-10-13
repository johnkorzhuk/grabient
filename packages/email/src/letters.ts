/* The three emails an account receives. Each is one sheet: the one action, the line that says how long it lasts, and
   the way home. The words are the site's catalog messages, so each is written in the reader's language. */
import { DEFAULT_LOCALE, type Locale, translate } from "@grabient/i18n";
import { email, type Letter } from "./document.ts";
import type { PaletteView } from "./palette.ts";
import { button, code, homeAddress, links, type Part, stack, text, title } from "./parts.ts";

export interface Sent {
  /** the site its links, pictures and fonts come from */
  origin: string;
  locale?: Locale;
  /** the palette it wears: `pickHead`'s choice. Without one, the brand's */
  palette?: PaletteView;
  /** the head travels with the email, attached by the sender under HEAD_CID */
  carried?: boolean;
  /** a fixed scheme is for a preview */
  scheme?: "auto" | "light" | "dark";
}

const host = (origin: string) => origin.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
/** The way back to the site at an email's foot: its name as an address shows it. */
export const home: Part = ctx => links({ label: host(ctx.origin), href: homeAddress(ctx) })(ctx);

function account(options: Sent, subject: string, preheader: string, body: Part[]): Letter {
  return email({
    ...options,
    width: "sheet",
    subject,
    preheader,
    body,
    foot: [home]
  });
}

/** The link that signs a reader in. It has no title: its one press says what it does, under a head that names the
    site, and the subject names the site for an inbox that shows no wordmark. */
export function signInLink(options: Sent & { url: string }): Letter {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const note = translate(
    locale,
    "This link expires in 5 minutes. If you didn't ask for it, ignore this email."
  );
  return account(options, translate(locale, "Sign in to Grabient"), note, [
    button({ label: translate(locale, "Sign in"), href: options.url, full: true }),
    text(note, { role: "small" })
  ]);
}

/** The code typed into the window that asked for it. The preview line is the note, never the code, so a locked phone
    does not show it. */
export function signInCode(options: Sent & { code: string }): Letter {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const note = translate(
    locale,
    "This code expires in 5 minutes. If you didn't ask for it, ignore this email."
  );
  return account(options, translate(locale, "Your Grabient sign-in code"), note, [
    title(translate(locale, "Sign in")),
    code(options.code),
    text(note, { role: "small" })
  ]);
}

/** The way to Settings, where a signed-in reader confirms deleting the account. The link deletes nothing. */
export function confirmDeletion(options: Sent & { url: string }): Letter {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const what = translate(locale, "Confirm account deletion");
  const lose = translate(locale, "This permanently deletes your account and saved palettes.");
  return account(options, what, lose, [
    stack("s3", title(what), text(lose)),
    button({ label: translate(locale, "Confirm deletion"), href: options.url, full: true }),
    text(translate(locale, "Sign in to confirm. This link expires in 24 hours."), { role: "small" })
  ]);
}
