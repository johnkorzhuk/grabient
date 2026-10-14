import type { Env } from "@grabient/server/env.ts";
import { checkLimits, type LimitCheck, type LimitResult } from "@grabient/server/limits/check.ts";
import { type LimitName, limitOf } from "@grabient/server/limits/config.ts";
import { SAVING_RETRY_SECONDS, savingPaused, workChecks } from "@grabient/server/limits/writes.ts";

/* What the MCP server's tools share: how a tool is written, what a call is given, and the shapes every tool answers
   in. A tool's answer is one text block of compact JSON, which every client hands its model as it is. */

/** Who is asking: the account, its role as the database has it now, the scopes it allowed and the app. */
export interface Grant {
  userId: string;
  role: "admin" | "user";
  scopes: string[];
  clientId: string;
  /** the app's name as the consent recorded it, "An app" for one that gave none */
  clientName: string;
}

export interface ToolContext {
  env: Env;
  /** work that may finish after the answer: a search counted */
  ctx: Pick<ExecutionContext, "waitUntil">;
  request: Request;
  /** the site's origin, for the addresses an answer names */
  origin: string;
  grant: Grant;
  /** the admin tools are open to this call: the account is an admin and allowed the app the admin scope */
  admin: boolean;
  /** the call comes from an app that draws the palette view (view.ts), and the view is on */
  view: boolean;
}

/** `_meta` is data for an app's view, which no model is given; the text says everything to every model. */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: true;
  _meta?: Record<string, unknown>;
}

/** What a tool does, as the protocol's annotations tell an app before it calls: it only reads; it may overwrite or
    delete; the same call again changes nothing more; what it writes reaches people beyond the account, which may
    depend on whose the connection is (null: an ordinary account's). */
export interface Hints {
  readOnly: boolean;
  destructive: boolean;
  idempotent: boolean;
  openWorld: boolean | ((grant: Grant | null) => boolean);
}
export const READS: Hints = {
  readOnly: true,
  destructive: false,
  idempotent: true,
  openWorld: false
};

export type Schema = Record<string, unknown>;

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Schema;
  hints: Hints;
  /** the tool's _meta in the list, what an app reads beside its description */
  meta?: Record<string, unknown>;
  run(args: Record<string, unknown>, c: ToolContext): Promise<ToolResult>;
}

/** Claude Code loads a tool marked so with the server instead of waiting for a search to find it: for the two tools a
    palette request starts from. */
export const ALWAYS_LOAD = { "anthropic/alwaysLoad": true };

export const answer = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }]
});
/** An answer the model can act on: what was wrong with the call, in a sentence. */
export const refuse = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true
});

/* What each limit a call can meet counts, for a refusal's words: a model told the limit can wait or spread its calls
   instead of asking again at once. A limit not named here counts requests. */
const COUNTED: Partial<Record<LimitName, string>> = {
  mcpList: "requests to connect or list tools",
  mcpListDaily: "requests to connect or list tools",
  mcpAccount: "tool calls",
  mcpAccountDaily: "tool calls",
  mcpAccountBudget: "tool calls",
  mcpAdmin: "tool calls",
  mcpAdminDaily: "tool calls",
  mcpAdminItemsDay: "palettes and items written",
  toggleLike: "saves",
  toggleLikeDaily: "saves",
  likesDaily: "saves",
  mcpLikesDaily: "saves",
  mcpPublishDaily: "saves of palettes new to Grabient",
  collectionWrite: "collection changes",
  collectionWriteDaily: "collection changes",
  collectionWritesSite: "collection changes",
  mcpCollectionWritesSite: "collection changes",
  curation: "curation changes"
};
/** The site's ceilings that count connected apps' writes alone. */
const APPS_ONLY: readonly LimitName[] = ["mcpLikesDaily", "mcpCollectionWritesSite"];

const per = (seconds: number) =>
  seconds === 60
    ? "a minute"
    : seconds === 3600
      ? "an hour"
      : seconds === 86400
        ? "a day"
        : `in ${Math.round(seconds / 60)} minutes`;

/** A wait in words: seconds under a minute and a half, minutes under an hour and a half, then hours. */
export const waitWords = (seconds: number) =>
  seconds < 90
    ? `${seconds} second${seconds === 1 ? "" : "s"}`
    : seconds < 5400
      ? `${Math.round(seconds / 60)} minutes`
      : `${Math.round(seconds / 3600)} hours`;

/** A refusal in words: whose limit it is, how many it allows in what time, and when to try again. */
export function limitWords(result: LimitResult): string {
  const wait = waitWords(Math.max(1, result.reset - Math.floor(Date.now() / 1000)));
  const type = result.type;
  if (!type) return `Too many requests for now. Try again in ${wait}.`;
  const limit = limitOf(type);
  const allows = `${result.limit.toLocaleString("en-US")} ${COUNTED[type] ?? "requests"} ${per(limit.window)}`;
  // the admins' items are counted under one key for all of them: a ceiling, though not the site's
  const whose = limit.site
    ? `Grabient's limit for every ${APPS_ONLY.includes(type) ? "connected app" : "account"} together, ${allows},`
    : type === "mcpAdminItemsDay"
      ? `The admins' shared limit of ${allows}`
      : `This account's limit of ${allows}`;
  return `${whose} is reached. Try again in ${wait}.`;
}

/** What a call is told when the limiter cannot answer: never that it asked too often, since it may not have. */
export const LIMITER_DOWN = "The limiter could not be reached. Try again shortly.";

/** A call's allowances, an admin's work counted as its role allows: null when it may go on, or the refusal that names
    the limit that stopped it. */
export async function limited(
  c: ToolContext,
  checks: readonly LimitCheck[]
): Promise<ToolResult | null> {
  const result = await checkLimits(c.env, workChecks(c.env, c.grant.role, checks));
  return !result ? refuse(LIMITER_DOWN) : result.success ? null : refuse(limitWords(result));
}

/** What a save is told while an admin has paused every account's writes. */
export const SAVING_PAUSED = `Grabient has paused saving for every account. Nothing was changed. Try again in ${waitWords(SAVING_RETRY_SECONDS)}.`;

/** A save to the account, as its pages' writes are: refused while saving is paused, then counted as `limited` counts. */
export async function writeLimited(
  c: ToolContext,
  checks: readonly LimitCheck[]
): Promise<ToolResult | null> {
  return (await savingPaused(c.env)) ? refuse(SAVING_PAUSED) : limited(c, checks);
}

/* Schemas, as short as the tools that use them. Every object closes its properties. */
export const text = (description: string, more: Schema = {}): Schema => ({
  type: "string",
  description,
  ...more
});
export const whole = (description: string, minimum: number, maximum: number): Schema => ({
  type: "integer",
  description,
  minimum,
  maximum
});
export const flag = (description: string): Schema => ({ type: "boolean", description });
export const list = (
  items: Schema,
  description: string,
  minItems: number,
  maxItems: number
): Schema => ({
  type: "array",
  items,
  description,
  minItems,
  maxItems
});
export const shape = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false
});

/* Arguments as the admins' tools read them; the account's are read against their schemas (args.ts). Text is composed
   (NFC) and never folded, so a Thai title or a full-width bracket comes back as sent. */
export const str = (value: unknown, max = 200): string =>
  typeof value === "string" ? value.normalize("NFC").trim().slice(0, max) : "";
export const num = (value: unknown, fallback: number, min: number, max: number): number =>
  value !== null && value !== "" && Number.isFinite(Number(value))
    ? Math.max(min, Math.min(max, Math.floor(Number(value))))
    : fallback;
export const items = (value: unknown, max: number): unknown[] =>
  Array.isArray(value) ? value.slice(0, max) : [];
/** An entry of a list a call sends: an object as it is, a string as its `seed`, or nothing. */
export const entryOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === "string"
    ? { seed: value }
    : value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

/** A moment in ISO 8601, to the millisecond: for the admins' records and the schedule, where the hour matters. */
export const moment = (ms: number | null | undefined): string | null =>
  ms ? new Date(Number(ms)).toISOString() : null;
/** A day as YYYY-MM-DD: all an account's answers need of a date. */
export const day = (ms: number | null | undefined): string | null =>
  ms ? new Date(Number(ms)).toISOString().slice(0, 10) : null;
/** A moment a call names (ISO 8601 or milliseconds), or undefined. */
export const momentOf = (value: unknown): number | undefined => {
  const at =
    typeof value === "number"
      ? value
      : typeof value === "string" && value
        ? Date.parse(value)
        : Number.NaN;
  return Number.isFinite(at) ? at : undefined;
};

export type { Env };
