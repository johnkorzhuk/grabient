import * as v from "valibot";
import { api } from "../account/session.ts";
import { Choice, ChoiceSheet, type SendAction, SendsAnswer } from "./input.ts";

/* The newsletter's writes from a page: the unsubscribe page's press, Settings' switch, an admin's test issue, an
   admin's choice of an issue's lead and quick tip, and an admin's sends. A refusal carries the server's own message,
   translated. */

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

/** The latest sends and what an admin may send: an admin's alone. */
export const readSends = async () => v.parse(SendsAnswer, await api("/api/me/newsletter/sends"));
/** A step on a send; the sends as the server holds them after, with what kept a prepare from writing anything. */
export const stepSend = async (step: SendAction) =>
  v.parse(SendsAnswer, await api("/api/me/newsletter/sends", step));

/** What an admin chooses in an issue: the palette it leads with, or the quick tip it ends with. */
export type IssuePart = "lead" | "tip";
/** What an admin's sheet of an issue is drawn with: a lead and a tip, each the one chosen where left out. */
export interface SheetAsk {
  seed?: string;
  tip?: string;
}
const sheetQuery = (issue: number, lang: string, ask: SheetAsk) =>
  new URLSearchParams({
    issue: String(issue),
    ...(ask.seed ? { seed: ask.seed } : {}),
    ...(ask.tip ? { tip: ask.tip } : {}),
    ...(lang === "en" ? {} : { lang })
  });
/** An issue's sheet drawn as `ask` says, with what `part` offers and the one chosen: an admin's alone. */
export const readSheet = async (part: IssuePart, issue: number, lang: string, ask: SheetAsk) =>
  v.parse(ChoiceSheet, await api(`/api/me/newsletter/${part}?${sheetQuery(issue, lang, ask)}`));
/** Chooses `id` for the issue's `part`; the sheet drawn with it and with the rest of `ask`, and the choice the server
    holds after. */
export const chooseSheet = async (
  part: IssuePart,
  issue: number,
  id: string,
  lang: string,
  ask: SheetAsk
) =>
  v.parse(
    ChoiceSheet,
    await api(
      `/api/me/newsletter/${part}?${sheetQuery(issue, lang, part === "lead" ? { tip: ask.tip } : { seed: ask.seed })}`,
      part === "lead" ? { issue, seed: id } : { issue, tip: id }
    )
  );
