/* An app's authorization request rides through sign-in in `r`: its query, base64url without padding, so nothing is
   stored before sign-in and a sign-in link handler that decodes its return address once more leaves it whole. Google's
   sign-in keeps its return address in a cookie the browser drops past 4 KB, so the query is held to 1,200 bytes. */

export const QUERY_MAX = 1200;
/** The longest `r` a query of QUERY_MAX bytes makes. */
export const RESUME_MAX = Math.ceil(QUERY_MAX / 3) * 4;

export function encodeResume(query: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(query)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The query `r` holds, or null for one that is not base64url, too long, or not UTF-8. */
export function decodeResume(value: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1 || value.length > RESUME_MAX)
    return null;
  try {
    const padded = value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}

export const tooLong = (query: string) => new TextEncoder().encode(query).length > QUERY_MAX;
