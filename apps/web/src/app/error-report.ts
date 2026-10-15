import { delocalizePath } from "@grabient/i18n";
import { isServer } from "@solidjs/web";

/* Errors a page meets in the reader's browser, sent to the Worker (POST /api/client-error), which logs them with no
   address, account or cookie: a failure in one browser alone, a hydration that breaks on a phone, would otherwise go
   unseen. Only the site's own scripts are reported (an extension's errors are not the site's), each message once per
   page load and five at most, and none while the browser has no connection: a report could not leave, and what fails
   then is the connection. Addresses go without their query, which can hold a sign-in or deletion token, and a page
   is named by its kind; only a palette's or a public collection's address is sent whole, never an account's, which
   can be private. Installed before the app starts, so an error while it hydrates is reported too. */
const MAX = 5;
const MESSAGE_MAX = 300;
const FRAMES = 6;
const sent = new Set<string>();

/** The page, as a report names it: a palette's or a public collection's address, an account's collection by its kind,
    else the first part of its path. */
export function pageOf(pathname: string): string {
  const path = delocalizePath(pathname).path;
  if (/^\/k[A-Za-z0-9_-]{8,49}$/.test(path) || /^\/[a-z0-9]+(-[a-z0-9]+)*$/.test(path)) return path;
  if (path.startsWith("/@")) return "collection";
  return path.split("/")[1] || "home";
}

/** A script of the site's own, as a path without its query; anything else is not the site's. */
function ownPath(address: string | undefined): string | null {
  if (!address) return null;
  try {
    const url = new URL(address, location.href);
    return url.origin === location.origin ? url.pathname : null;
  } catch {
    return null;
  }
}

/** The stack's frames in the site's own scripts, their addresses as paths. */
export function ownStack(stack: unknown, origin: string): string {
  if (typeof stack !== "string") return "";
  return stack
    .split("\n")
    .filter(line => line.includes(origin))
    .slice(0, FRAMES)
    .map(line =>
      line
        .replaceAll(origin, "")
        .replace(/\?[^\s):]*/g, "")
        .trim()
        .slice(0, 200)
    )
    .join("\n");
}

/** A value thrown as an error tells it: its type, its own words and its frames in the site's own scripts. A value that
    is no error tells only `said`. The window's words for an error lead with its type, and Chrome's with "Uncaught",
    so its own words keep one error the same however it was met. */
function described(thrown: unknown, said: string) {
  const error = thrown as { name?: unknown; message?: unknown; stack?: unknown } | null | undefined;
  return {
    name: typeof error?.name === "string" ? error.name : undefined,
    message: typeof error?.message === "string" && error.message ? error.message : said,
    stack: ownStack(error?.stack, location.origin)
  };
}

function report(
  error: ReturnType<typeof described>,
  source: string | null = null,
  line?: number,
  column?: number
) {
  const text = error.message.slice(0, MESSAGE_MAX);
  if (!text || navigator.onLine === false || sent.size >= MAX || sent.has(text)) return;
  sent.add(text);
  try {
    fetch("/api/client-error", {
      method: "POST",
      keepalive: true,
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: error.name,
        message: text,
        source,
        line,
        column,
        stack: error.stack,
        page: pageOf(location.pathname)
      })
    }).catch(() => {});
  } catch {
    /* a report never adds an error of its own */
  }
}

/** An error a page's boundary took, or one caught so the site goes on: the window never hears of either. */
export function reportCaught(error: unknown): void {
  if (isServer) return;
  report(described(error, String(error)));
}

export function installErrorReports(): void {
  window.addEventListener("error", event => {
    if (!(event instanceof ErrorEvent)) return;
    const error = described(event.error, String(event.message ?? ""));
    const source = ownPath(event.filename);
    /* a script of another origin (an extension, a translation tool) is not the site's */
    if (!source && !error.stack) return;
    report(error, source, event.lineno || undefined, event.colno || undefined);
  });
  window.addEventListener("unhandledrejection", event => {
    const error = described(event.reason, String(event.reason));
    if (error.stack) report(error);
  });
}
