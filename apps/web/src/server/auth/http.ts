import type { Env } from "../env.ts";
import { checkLimits, type LimitCheck, type LimitResult } from "../limits/check.ts";

/* The answers of private routes: account data, sign-in, anything that reads a cookie. Neither the browser nor the edge
   keeps them. */

export const NO_STORE = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store" };

function noStore(response: Response): Response {
  for (const [name, value] of Object.entries(NO_STORE)) response.headers.set(name, value);
  return response;
}

export const json = (body: unknown, status = 200, headers?: HeadersInit): Response =>
  noStore(Response.json(body, { status, headers }));

/** Another answer, made private: the sign-in library's, which may set cookies. */
export const privateResponse = (response: Response): Response =>
  noStore(new Response(response.body, response));

/** A cookie-authenticated write must come from one of the site's own pages. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin || request.headers.get("Sec-Fetch-Site") === "cross-site") return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** The body, or null when it says or turns out to be longer than `max` bytes. */
export async function readBytes(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body || Number(request.headers.get("Content-Length")) > max) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** A JSON object out of bytes already read, or null for anything else. */
export function parseObject(bytes: Uint8Array | null): Record<string, unknown> | null {
  if (!bytes) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** A JSON object body of at most `max` bytes, or null. */
export async function readJson(
  request: Request,
  max = 8192
): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return null;
  return parseObject(await readBytes(request, max));
}

const limitHeaders = (result: LimitResult) => ({
  "Retry-After": String(Math.max(1, result.reset - Math.floor(Date.now() / 1000))),
  "X-RateLimit-Limit": String(result.limit),
  "X-RateLimit-Remaining": "0",
  "X-RateLimit-Reset": String(result.reset)
});

/** The answer to a request past one of its limits (429), or whose limits could not be checked (503), in `busy`'s words
    when given; null when the request may go on. */
export async function overLimit(
  env: Pick<Env, "RATE_LIMITER" | "DEPLOYMENT" | "USAGE">,
  checks: readonly LimitCheck[],
  busy?: string
): Promise<Response | null> {
  const result = await checkLimits(env, checks);
  if (result?.success) return null;
  if (!result) return json({ error: busy ?? "Something went wrong. Try again." }, 503);
  return json({ error: busy ?? "Too many requests. Try again later." }, 429, limitHeaders(result));
}
