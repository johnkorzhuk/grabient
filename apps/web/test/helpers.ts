import { env as bound } from "cloudflare:workers";
import { encodePalette } from "@grabient/engine";
import { anchorsFromHexes } from "@grabient/engine/spec.ts";
import { authFor } from "@grabient/server/auth/library.ts";
import type { Place } from "@grabient/server/consent.ts";
import { run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";

/* Accounts, sessions, requests and palettes for the Worker's tests. Every test makes its own accounts, addresses and
   inboxes, so tests never share a count or a row whatever order they run in. */

export const ORIGIN = "https://grabient.test";
export const SECRET = "a test secret that no deploy has, 32 characters or more";

/** The emails a test's environment sent, in order, in place of Email Service. */
export class Mailbox implements SendEmail {
  readonly sent: EmailMessageBuilder[] = [];
  async send(message: EmailMessage | EmailMessageBuilder): Promise<EmailSendResult> {
    if ("subject" in message) this.sent.push(message);
    return { messageId: `test-${this.sent.length}` };
  }
  get last(): EmailMessageBuilder {
    const message = this.sent.at(-1);
    if (!message) throw new Error("No email was sent");
    return message;
  }
  /** The sign-in code in the last email. */
  get code(): string {
    const found = this.last.html?.match(/<strong>(\d{6})<\/strong>/)?.[1];
    if (!found) throw new Error(`No code in: ${this.last.html}`);
    return found;
  }
  /** The first link in the last email's text that leads to `path`. */
  link(path: string): URL {
    const found = this.last.text?.match(/https?:\/\/\S+/g)?.find(href => href.includes(path));
    if (!found) throw new Error(`No link to ${path} in: ${this.last.text}`);
    return new URL(found);
  }
}

export type TestEnv = Env & { EMAIL: Mailbox };

/** The bindings local development has, with a secret, a mailbox and the given values. A new environment is a new
    sign-in library instance, as a new deploy would be. */
export function testEnv(values: Partial<Env> = {}): TestEnv {
  return {
    ...(bound as unknown as Env),
    BETTER_AUTH_URL: ORIGIN,
    BETTER_AUTH_SECRET: SECRET,
    ...values,
    EMAIL: new Mailbox()
  };
}

/** The same bindings seen by another isolate: its own assets binding, so it holds no snapshot or files yet. */
export const freshIsolate = (env: TestEnv): TestEnv => ({
  ...env,
  ASSETS: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => env.ASSETS.fetch(input, init)
  } as Fetcher
});

/** A palette's seed, made of these colors. */
export const seedOf = (...hexes: string[]) => encodePalette(anchorsFromHexes(hexes)!);

/** A name no other test uses: an account, an inbox, a limit's key. */
export const unique = (stem: string) => `${stem}-${crypto.randomUUID().slice(0, 13)}`;

/** A client address no other test uses (an IPv6 /64 of its own), so per-address limits start empty. */
export const address = () => {
  const [a, b] = crypto.getRandomValues(new Uint16Array(2));
  return `2001:db8:${a!.toString(16)}:${b!.toString(16)}::1`;
};

export interface Account {
  id: string;
  email: string;
  /** The Cookie header of a session for this account. */
  cookie: string;
}

/** The session token cookie as the library signs it: the token and its HMAC under the secret. */
async function signedCookie(env: Env, token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token))
  );
  const { name } = (await authFor(env).$context).authCookies.sessionToken;
  return `${name}=${encodeURIComponent(`${token}.${btoa(String.fromCharCode(...mac))}`)}`;
}

/** A session for an account, written straight to the database: a session made before any rule now in force. */
export async function sessionFor(env: Env, userId: string): Promise<string> {
  const token = crypto.randomUUID().replaceAll("-", "");
  const now = Date.now();
  await run(
    env.DB,
    `INSERT INTO auth_session (id, token, user_id, expires_at, created_at, updated_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, 'test')`,
    crypto.randomUUID(),
    token,
    userId,
    now + 7 * 86_400_000,
    now,
    now
  );
  return signedCookie(env, token);
}

/** An account and a session for it. */
export async function makeAccount(
  env: Env,
  options: { role?: "admin" | "user"; email?: string; name?: string } = {}
): Promise<Account> {
  const id = unique("user");
  const email = options.email ?? `${id}@example.test`;
  const now = Date.now();
  await run(
    env.DB,
    `INSERT INTO auth_user (id, name, email, email_verified, role, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)`,
    id,
    options.name ?? "",
    email,
    options.role ?? "user",
    now,
    now
  );
  return { id, email, cookie: await sessionFor(env, id) };
}

export const makeAdmin = (env: Env, email?: string) => makeAccount(env, { role: "admin", email });

type Init = {
  cookie?: string;
  ip?: string;
  origin?: string | null;
  headers?: Record<string, string>;
  /** where Cloudflare places the request: none, as no deploy receives one, unless a test says */
  cf?: Place;
};

function headersOf(init: Init): Headers {
  const headers = new Headers(init.headers);
  headers.set("CF-Connecting-IP", init.ip ?? address());
  if (init.cookie) headers.set("Cookie", init.cookie);
  return headers;
}

export function get(path: string, init: Init = {}): Request {
  return new Request(new URL(path, ORIGIN), { headers: headersOf(init), cf: init.cf });
}

/** A JSON POST from the site's own page, unless `origin` says otherwise. */
export function post(path: string, body: unknown, init: Init = {}): Request {
  const headers = headersOf(init);
  headers.set("Content-Type", "application/json");
  if (init.origin !== null) headers.set("Origin", init.origin ?? ORIGIN);
  return new Request(new URL(path, ORIGIN), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cf: init.cf
  });
}

/** The cookies an answer sets, as the browser would send them back: the cleared ones left out. */
export function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map(cookie => cookie.split(";")[0]!)
    .filter(pair => !pair.endsWith("="))
    .join("; ");
}

/** An answer's JSON, as the test expects it to be shaped. */
export const bodyOf = async <T>(response: Response): Promise<T> => (await response.json()) as T;

/** A count of rows, for checking what a request wrote. */
export async function count(
  env: Env,
  query: string,
  ...params: (string | number)[]
): Promise<number> {
  const row = await env.DB.prepare(query)
    .bind(...params)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** The environment with a view of its limiter: every limit asked of the Durable Object, in order. The view is a new
    binding object, so the isolate's memory of limits starts empty for it. */
export function watchLimits(env: TestEnv): { env: TestEnv; asked: string[] } {
  const namespace = env.RATE_LIMITER;
  if (!namespace) throw new Error("No RATE_LIMITER binding");
  const asked: string[] = [];
  const watched = {
    idFromName: (name: string) => namespace.idFromName(name),
    get: (id: DurableObjectId) => {
      const stub = namespace.get(id);
      return {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          asked.push(
            ...new URL(input instanceof Request ? input.url : String(input)).searchParams.getAll(
              "type"
            )
          );
          return stub.fetch(input, init);
        }
      };
    }
  };
  return { env: { ...env, RATE_LIMITER: watched as unknown as DurableObjectNamespace }, asked };
}
