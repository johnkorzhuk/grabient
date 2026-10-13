import { msg } from "@grabient/i18n";
import * as v from "valibot";

/* The contact form's message, as the page checks it before sending and the Worker checks it again. */

export const CONTACT_INVALID = msg("Write 5 to 5,000 characters, and a valid email for a reply.");
export const MESSAGE_MAX = 5000;
export const EMAIL_MAX = 254;

export const ContactInput = v.object({
  /** only for a reply */
  email: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.maxLength(EMAIL_MAX),
      v.check(email => email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ),
    ""
  ),
  message: v.pipe(v.string(), v.maxLength(MESSAGE_MAX), v.trim(), v.minLength(5)),
  /** a field people never see: a value in it is a bot's */
  website: v.optional(v.unknown())
});
export type ContactInput = v.InferInput<typeof ContactInput>;
