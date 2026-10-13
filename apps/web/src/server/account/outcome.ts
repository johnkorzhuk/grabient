import { formatMessage, type Params } from "@grabient/i18n";

/* What one of a sync's changes came to, in the shape a page's press would have been answered with: a status, and the
   answer's body. A refusal's `error` is its English and `i18n` its message and values, which the page says in the
   reader's language. */

export interface Outcome {
  status: number;
  body: Record<string, unknown>;
  /** a limit's or the database's wait, in seconds */
  retryAfter?: number;
}

export const done = (body: Record<string, unknown> = {}): Outcome => ({ status: 200, body });
export const refused = (status: number, message: string, params?: Params): Outcome => ({
  status,
  body: {
    error: params ? formatMessage(message, params, "en") : message,
    ...(params ? { i18n: { message, params } } : {})
  }
});

/** An answer another module gave, as an outcome: a limit's refusal keeps its wait. */
export async function fromResponse(response: Response): Promise<Outcome> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const after = Number(response.headers.get("Retry-After"));
  return {
    status: response.status,
    body,
    ...(Number.isFinite(after) && after > 0 ? { retryAfter: after } : {})
  };
}
