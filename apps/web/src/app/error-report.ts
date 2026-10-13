import { delocalizePath } from "@grabient/i18n";
import { isServer } from "@solidjs/web";

/* Errors a page meets in the reader's browser, sent to the Worker (POST /api/client-error), which logs them with no
   address, account or cookie: a failure in one browser alone, a hydration that breaks on a phone, would otherwise go
   unseen. Only the site's own scripts are reported (an extension's errors are not the site's), each message once per
   page load and five at most. Addresses go without their query, which can hold a sign-in or deletion token, and a page
   is named by its kind; only a palette's or a collection's public address is sent whole. Installed before the app
   starts, so an error while it hydrates is reported too. */
const MAX = 5;
const MESSAGE_MAX = 300;
const FRAMES = 6;
const sent = new Set<string>();

/** The page, as a report names it: a palette's or a public collection's address, else the first part of its path. */
export function pageOf(pathname: string): string {
  const path = delocalizePath(pathname).path;
  if (
    /^\/k[A-Za-z0-9_-]{8,49}$/.test(path) ||
    /^\/(@[a-z0-9_-]{3,30}\/)?[a-z0-9]+(-[a-z0-9]+)*$/.test(path)
  )
    return path;
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

function report(
  message: string,
  source: string | null,
  line?: number,
  column?: number,
  stack = ""
) {
  const text = message.slice(0, MESSAGE_MAX);
  if (!text || sent.size >= MAX || sent.has(text)) return;
  sent.add(text);
  try {
    fetch("/api/client-error", {
      method: "POST",
      keepalive: true,
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        source,
        line,
        column,
        stack,
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
  const reason = error as { message?: unknown; stack?: unknown } | null | undefined;
  report(
    typeof reason?.message === "string" ? reason.message : String(error),
    null,
    undefined,
    undefined,
    ownStack(reason?.stack, location.origin)
  );
}

export function installErrorReports(): void {
  window.addEventListener("error", event => {
    if (!(event instanceof ErrorEvent)) return;
    const source = ownPath(event.filename);
    const stack = ownStack(event.error?.stack, location.origin);
    /* a script of another origin (an extension, a translation tool) is not the site's */
    if (!source && !stack) return;
    report(
      String(event.message ?? ""),
      source,
      event.lineno || undefined,
      event.colno || undefined,
      stack
    );
  });
  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason as { message?: unknown; stack?: unknown } | null | undefined;
    const stack = ownStack(reason?.stack, location.origin);
    if (!stack) return;
    report(
      typeof reason?.message === "string" ? reason.message : String(reason),
      null,
      undefined,
      undefined,
      stack
    );
  });
}
