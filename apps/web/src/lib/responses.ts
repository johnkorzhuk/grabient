import { NO_STORE } from "./cache.ts";

/** JSON that no cache keeps unless `headers` names a class: every error and every private answer. An error is
    `{ error: message }` with the English named by msg(), which the page translates. */
export function json(
  data: unknown,
  init: { status?: number; headers?: Readonly<Record<string, string>> } = {}
): Response {
  return Response.json(data, { status: init.status, headers: { ...NO_STORE, ...init.headers } });
}

/** The same answer with these headers set: a response's own headers can be immutable. */
export function withHeaders(
  response: Response,
  headers: Readonly<Record<string, string>>
): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) out.headers.set(name, value);
  return out;
}

/** A redirect no cache keeps: the address it leads from may answer otherwise tomorrow. */
export function redirect(location: string, status: 301 | 302 = 301): Response {
  return new Response(null, { status, headers: { ...NO_STORE, Location: location } });
}
