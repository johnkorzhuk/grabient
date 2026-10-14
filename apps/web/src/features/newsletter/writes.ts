import * as v from "valibot";
import { api } from "../account/session.ts";
import { Choice } from "./input.ts";

/* The newsletter's writes from a page: the unsubscribe page's press, Settings' switch and an admin's test issue. A
   refusal carries the server's own message, translated. */

/** The unsubscribe page's press: ends the newsletter for the token's account, or starts it again. Resolves with what
    the server holds after. */
export const answerUnsubscribe = async (token: string, subscribed: boolean) =>
  v.parse(Choice, await api(`/unsubscribe/${token}`, { subscribed })).subscribed;

/** Settings' switch: turns the newsletter on or off for the signed-in account; what the server holds after. */
export const writeChoice = async (subscribed: boolean) =>
  v.parse(Choice, await api("/api/me/newsletter", { subscribed }, "PUT")).subscribed;

/** An admin's test issue, sent to the admin's own address alone. */
export const sendTestIssue = async () => {
  await api("/api/me/newsletter/test", {});
};
