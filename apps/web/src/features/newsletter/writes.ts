import * as v from "valibot";
import { api } from "../account/session.ts";
import { Choice, LeadSheet } from "./input.ts";

/* The newsletter's writes from a page: the unsubscribe page's press, Settings' switch, an admin's test issue and an
   admin's choice of an issue's lead. A refusal carries the server's own message, translated. */

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

const leadQuery = (issue: number, lang: string, seed?: string) =>
  new URLSearchParams({
    issue: String(issue),
    ...(seed ? { seed } : {}),
    ...(lang === "en" ? {} : { lang })
  });
/** An issue's sheet led by a palette it offers, the chosen one unless `seed` names another: an admin's alone. */
export const readLead = async (issue: number, lang: string, seed?: string) =>
  v.parse(LeadSheet, await api(`/api/me/newsletter/lead?${leadQuery(issue, lang, seed)}`));
/** Makes `seed` the issue's lead; the sheet led by it, and the choice the server holds after. */
export const chooseLead = async (issue: number, seed: string, lang: string) =>
  v.parse(
    LeadSheet,
    await api(`/api/me/newsletter/lead?${leadQuery(issue, lang)}`, { issue, seed })
  );
