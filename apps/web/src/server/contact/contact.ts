import { CONTACT_EMAIL } from "@grabient/email/addresses.ts";
import { msg } from "@grabient/i18n";
import { json, overLimit, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff, pausedBy } from "@grabient/server/flags/flags.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import * as v from "valibot";
import {
  CONTACT_INVALID,
  ContactInput,
  EMAIL_MAX,
  MESSAGE_MAX
} from "../../features/contact/input.ts";

// the page counts a message in UTF-16 units, each at most three bytes of UTF-8, so the longest it sends fits whole
const BODY_MAX = MESSAGE_MAX * 3 + EMAIL_MAX + 1024;
const UNAVAILABLE = msg("Contact is temporarily unavailable.");

/** `POST /api/contact`: a message from the contact page to the site's own address, as plain text, with the sender's
    address to reply to when given. Each message is an email Email Service may bill for, so it is refused while an admin
    has email off, passes its address's allowance and the site's hour and day first, and a bot that fills the hidden
    field is answered as if sent. */
export async function contactResponse(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: msg("Invalid request.") }, 403);
  const who = clientAddress(request);
  if (!who || !env.RATE_LIMITER || !env.EMAIL) return json({ error: UNAVAILABLE }, 503);
  if (await flagOff(env, "email")) return json({ error: UNAVAILABLE }, 503, pausedBy("email"));
  const input = v.safeParse(ContactInput, await readJson(request, BODY_MAX));
  if (!input.success) return json({ error: CONTACT_INVALID }, 400);
  const limited = await overLimit(env, [[`contact:${who}`, "contactForm"]]);
  if (limited) return limited;
  const { email, message, website } = input.output;
  if (website) return json({ success: true });
  const budget = await overLimit(env, [
    ["contact:global", "contactGlobal"],
    ["contact:day", "contactDaily"]
  ]);
  if (budget) return budget;
  try {
    await env.EMAIL.send({
      from: { name: "Grabient", email: env.EMAIL_FROM },
      to: CONTACT_EMAIL,
      ...(email ? { replyTo: email } : {}),
      subject: "Grabient contact",
      text: message
    });
  } catch (error) {
    // Email Service's refusals carry a code: E_DELIVERY_FAILED, E_DAILY_LIMIT_EXCEEDED and the like
    console.error(
      "contact: the message was not sent",
      (error as { code?: string }).code ?? String(error)
    );
    return json({ error: msg("Couldn't send the message. Try again.") }, 502);
  }
  return json({ success: true });
}
