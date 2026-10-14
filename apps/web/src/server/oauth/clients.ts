import { CLIENT_DOCUMENTS } from "./client-documents.data.ts";

/* Which apps may connect and how the consent page, Settings and the MCP server name them. Pure: the authorization
   server (server.ts) issues and checks every token; nothing here does. */

/** The MCP server's address for every app, which is also the resource its tokens are issued for. */
export const MCP_PATH = "/mcp";
/** The scope every connection is challenged for and allowed: the account's saved palettes and collections. */
export const MCP_SCOPES = ["account"] as const;
/** An admin's connection when the admin chose the admin tools at consent. Never advertised or challenged for, and it
    counts only while the account is an admin. */
export const ADMIN_SCOPES = ["account", "admin"] as const;

export const OAUTH_PATHS = {
  authorize: "/oauth/authorize",
  token: "/oauth/token",
  register: "/oauth/register",
  consent: "/oauth/consent"
} as const;
/** RFC 8414's address for an issuer that is the origin. */
export const AS_METADATA_PATH = "/.well-known/oauth-authorization-server";
/** The MCP server's own metadata (RFC 9728). The root document is never served: the challenge names this one. */
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

/** The client ids Grabient keeps a copy for: the only apps the consent may offer the admin tools to. */
export const SAVED_CLIENT_IDS: ReadonlySet<string> = new Set(Object.keys(CLIENT_DOCUMENTS));
/** Every redirect the saved documents list: addresses only their makers receive at. */
export const SAVED_REDIRECTS: ReadonlySet<string> = new Set(
  Object.values(CLIENT_DOCUMENTS).flatMap(document =>
    Array.isArray(document.redirect_uris)
      ? document.redirect_uris.filter((uri): uri is string => typeof uri === "string")
      : []
  )
);

/** How an app identifies itself: a document Grabient keeps a copy of, a document it fetches, or a registration. */
export type ClientKind = "saved" | "document" | "registered";
export const isUrlClientId = (clientId: string) => /^https:\/\//i.test(clientId);
export const clientKind = (clientId: string): ClientKind =>
  SAVED_CLIENT_IDS.has(clientId) ? "saved" : isUrlClientId(clientId) ? "document" : "registered";

/* What CIMD asks a server not to fetch: a URL spelled otherwise than URL parsing spells it, an IP literal, a port, a
   single-label or special-use name, and this site's own hosts, which would make the Worker fetch itself. A name with
   an empty label is refused too, since a trailing dot names the same host the comparisons below would miss. */
const SPECIAL =
  /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|test|example|invalid|onion|arpa)$/i;

/** Whether the Worker may fetch the client metadata document a client_id names. */
export function fetchableClientId(id: string, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(id);
  } catch {
    return false;
  }
  if (url.href !== id || url.protocol !== "https:" || url.port || url.username || url.password)
    return false;
  if (url.hash) return false;
  const host = url.hostname;
  if (host.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const labels = host.split(".");
  if (labels.length < 2 || labels.includes("") || SPECIAL.test(host)) return false;
  return (
    host !== new URL(origin).hostname && host !== "grabient.com" && !host.endsWith(".grabient.com")
  );
}

const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/;

/** Whether a browser may be sent to this redirect without the person choosing it: one on this computer, or one a saved
    document lists. Anyone can register any https redirect, so no other is followed unasked. */
export function trustedRedirect(uri: string): boolean {
  if (SAVED_REDIRECTS.has(uri)) return true;
  try {
    const url = new URL(uri);
    return url.protocol === "http:" && LOOPBACK_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

export type Place = { kind: "local" | "site" | "app"; name: string };
const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Where a redirect leads, as the consent page and Settings say it: this computer, a site, or an installed app. */
export function redirectPlace(raw: string): Place {
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return { kind: LOOPBACK_NAMES.has(url.hostname) ? "local" : "site", name: url.hostname };
    }
    return { kind: "app", name: url.protocol.slice(0, -1) };
  } catch {
    return { kind: "site", name: "" };
  }
}

const NAME_MAX = 60;
const CONTROL = /[\p{Cc}\p{Cf}]/gu;

/** An app's name as it gave it, bounded and without control characters, or null when none is left. */
export function givenName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFKC").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  return name.slice(0, NAME_MAX) || null;
}

/** The same where a record needs a name: the tools' records and the usage counts. */
export const appName = (raw: unknown): string => givenName(raw) ?? "An app";
