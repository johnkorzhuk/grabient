import type { Env } from "@grabient/server/env.ts";

/* The token a removal answers with, so its undo puts the membership back as it stood: its place, its view and the time
   it joined. A membership's time is a palette's public date, so a restore never takes one from the client: the server
   restores what a token it signed says, for this account and this collection, for a day. An admin's add to one of
   Grabient's collections answers with one too, which its undo sends to take that membership out again. */

const PURPOSE = "collection-restore";
const LIFE_MS = 24 * 60 * 60 * 1000;
const TOKEN_MAX = 2048;
const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(
      text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4)
    );
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  } catch {
    return null;
  }
}
const key = (env: Pick<Env, "BETTER_AUTH_SECRET">) => {
  if (!env.BETTER_AUTH_SECRET) throw new Error("No secret to sign collection tokens with");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`${PURPOSE}:${env.BETTER_AUTH_SECRET}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
};

/** A membership as it stood before it was taken out, or as an admin's add made it. */
export interface Membership {
  seed: string;
  style: string;
  steps: number;
  angle: number;
  position: number;
  createdAt: number | null;
  /** made by an admin's add: its undo takes it out, and nothing else does with this token */
  added?: boolean;
  /** the admin's record of the removal, which the undo takes back */
  record?: string;
}

export async function restoreToken(
  env: Pick<Env, "BETTER_AUTH_SECRET">,
  userId: string,
  collectionId: string,
  row: Membership,
  now = Date.now()
): Promise<string> {
  const body = toBase64Url(
    encoder.encode(JSON.stringify({ u: userId, c: collectionId, r: row, x: now + LIFE_MS }))
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await key(env), encoder.encode(body))
  );
  return `${body}.${toBase64Url(signature)}`;
}

/** The membership a token names, when it is this account's, for this collection, unexpired and signed here. */
export async function readRestoreToken(
  env: Pick<Env, "BETTER_AUTH_SECRET">,
  token: unknown,
  userId: string,
  collectionId: string,
  now = Date.now()
): Promise<Membership | null> {
  if (typeof token !== "string" || token.length > TOKEN_MAX) return null;
  const [body, signed] = token.split(".");
  const signature = signed ? fromBase64Url(signed) : null;
  if (!body || !signature) return null;
  if (!(await crypto.subtle.verify("HMAC", await key(env), signature, encoder.encode(body))))
    return null;
  try {
    const bytes = fromBase64Url(body);
    const claim = bytes
      ? (JSON.parse(new TextDecoder().decode(bytes)) as {
          u?: unknown;
          c?: unknown;
          x?: unknown;
          r?: Membership;
        })
      : null;
    if (
      !claim ||
      claim.u !== userId ||
      claim.c !== collectionId ||
      typeof claim.x !== "number" ||
      claim.x < now ||
      typeof claim.r?.seed !== "string"
    )
      return null;
    return claim.r;
  } catch {
    return null;
  }
}
