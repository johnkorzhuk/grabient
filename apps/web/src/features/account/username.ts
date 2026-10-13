import { msg } from "@grabient/i18n";
import * as v from "valibot";

/* A username is the account's name and the handle in its private collections' addresses. Settings and the Worker
   read it with this one schema, so the field accepts what the server keeps. Its messages are message keys: the page
   translates them, and the Worker sends them for the page to translate. */

export const USERNAME_MAX = 30;
// Names a reader would take for the site speaking.
const RESERVED = new Set([
  "grabient",
  "admin",
  "administrator",
  "moderator",
  "official",
  "security",
  "staff",
  "support",
  "system",
  "team",
  "help"
]);

export const Username = v.pipe(
  v.string(msg("Use at least 3 characters.")),
  v.trim(),
  v.minLength(3, msg("Use at least 3 characters.")),
  v.maxLength(USERNAME_MAX, msg("Use up to 30 characters.")),
  v.regex(/^[A-Za-z0-9_-]+$/, msg("Use letters, numbers, underscores and hyphens.")),
  /* A letter or a digit at each end: a handle that starts with an underscore belongs to an account without a
     username, made from its id, so a username shaped like one could take another account's addresses. */
  v.regex(/^[A-Za-z0-9](?:.*[A-Za-z0-9])?$/, msg("Start and end with a letter or number.")),
  v.check(name => !RESERVED.has(name.toLowerCase()), msg("That username is reserved."))
);

/** The username as it is kept (trimmed), or the first rule it breaks, as a message key. */
export function readUsername(
  input: unknown
): { username: string; problem: null } | { username: null; problem: string } {
  const read = v.safeParse(Username, input, { abortPipeEarly: true });
  return read.success
    ? { username: read.output, problem: null }
    : { username: null, problem: read.issues[0].message };
}
