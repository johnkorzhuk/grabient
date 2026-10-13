/* The account emails in plain words, in the site's own English strings: what each is, its link or code, and how long
   that lasts. The designed letters in @grabient/email take their place. */

export interface Letter {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

function letter(
  subject: string,
  middle: { link: string; label: string } | { code: string },
  note: string
) {
  const shown = "code" in middle ? middle.code : middle.link;
  const held =
    "code" in middle
      ? `<strong>${escapeHtml(middle.code)}</strong>`
      : `<a href="${escapeHtml(middle.link)}">${escapeHtml(middle.label)}</a>`;
  return {
    subject,
    text: `${subject}\n\n${shown}\n\n${note}\n`,
    html: `<p>${escapeHtml(subject)}</p>\n<p>${held}</p>\n<p>${escapeHtml(note)}</p>\n`
  };
}

export const signInLink = (url: string): Letter =>
  letter(
    "Sign in to Grabient",
    { link: url, label: "Sign in to Grabient" },
    "This link expires in 5 minutes. If you didn't ask for it, ignore this email."
  );

export const signInCode = (code: string): Letter =>
  letter(
    "Your Grabient sign-in code",
    { code },
    "This code expires in 5 minutes. If you didn't ask for it, ignore this email."
  );

export const confirmDeletion = (url: string): Letter =>
  letter(
    "Confirm account deletion",
    { link: url, label: "Confirm deletion" },
    "Sign in to confirm. This link expires in 24 hours."
  );
