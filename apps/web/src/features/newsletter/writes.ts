import { msg, t } from "@grabient/i18n";
import * as v from "valibot";
import { READ_TIMEOUT } from "../../lib/query.ts";
import { Choice } from "./input.ts";

/* The newsletter's writes from a page: the unsubscribe page's press, Settings' switch and an admin's test issue. A
   refusal carries the server's own message, translated. */

const UNSENT = msg("Something went wrong. Try again.");

async function send<S extends v.GenericSchema>(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  schema: S
): Promise<v.InferOutput<S>> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(READ_TIMEOUT)
  });
  const answer: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (answer as { error?: unknown } | null)?.error;
    throw new Error(t(typeof error === "string" ? error : UNSENT));
  }
  return v.parse(schema, answer);
}

/** The unsubscribe page's press: ends the newsletter for the token's account, or starts it again. Resolves with what
    the server holds after. */
export const answerUnsubscribe = async (token: string, subscribed: boolean) =>
  (await send("POST", `/unsubscribe/${token}`, { subscribed }, Choice)).subscribed;

/** Settings' switch: turns the newsletter on or off for the signed-in account; what the server holds after. */
export const writeChoice = async (subscribed: boolean) =>
  (await send("PUT", "/api/me/newsletter", { subscribed }, Choice)).subscribed;

/** An admin's test issue, sent to the admin's own address alone. */
export const sendTestIssue = async () => {
  await send("POST", "/api/me/newsletter/test", {}, v.object({ sent: v.literal(true) }));
};
