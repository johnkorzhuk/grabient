import { t } from "@grabient/i18n";
import type { FrameLink } from "@grabient/ui/PageFrame.tsx";
import { getRouteApi } from "@tanstack/solid-router";
import { GITHUB_REPO } from "../lib/page-meta.ts";
import { marked } from "./connection.ts";

/* The links the frame offers on every page, in the reader's language and the address's: a frame's link is a plain
   link, which the app routes itself (navigation.ts), so it carries the page's language prefix like any other. */

/** What the server knows of the site itself and every page draws by, read before the first render (the root route's
    loader) and sent with the document, so both sides draw the same and no page asks for it. */
export interface SiteFacts {
  /** the stars the code has on GitHub, or null where none is kept */
  stars: number | null;
}
const root = getRouteApi("__root__");
/** The site's facts, for a component. */
export const siteFacts = (): (() => SiteFacts) => root.useLoaderData() as () => SiteFacts;

/** The code on GitHub: its name and its stars, in a new tab. */
export const codeLink = (stars: number | null): FrameLink => ({
  href: GITHUB_REPO,
  label: "GitHub",
  external: true,
  stars
});

/** A page of the frame's own navigation or footer. */
export type FramePage = "settings" | "bindings" | "mcp" | "newsletter" | "about" | "contact";
const NAV: readonly { page: FramePage; href: string; label: () => string; keyboard?: true }[] = [
  { page: "settings", href: "/settings", label: () => t("Settings") },
  { page: "bindings", href: "/bindings", label: () => t("Shortcuts"), keyboard: true },
  { page: "mcp", href: "/mcp-server", label: () => "MCP" },
  { page: "newsletter", href: "/newsletter", label: () => t("Newsletter") },
  { page: "about", href: "/about", label: () => t("About") },
  { page: "contact", href: "/contact", label: () => t("Contact") }
];

/** The brand pages' navigation, the page on screen marked, the code on GitHub last: the one link that leaves. */
export function navLinks(
  current: FramePage | null,
  stars: number | null,
  href: (to: string) => string
): FrameLink[] {
  return marked([
    ...NAV.map(link => ({
      href: href(link.href),
      label: link.label(),
      current: link.page === current,
      keyboard: link.keyboard
    })),
    codeLink(stars)
  ]);
}

/** The footer's links, the page on screen marked: the legal pages, how an AI app is connected, then the code. */
export function footerLinks(
  current: "privacy" | "terms" | "mcp" | null,
  stars: number | null,
  href: (to: string) => string
): FrameLink[] {
  return marked([
    { href: href("/privacy"), label: t("Privacy"), current: current === "privacy" },
    { href: href("/terms"), label: t("Terms"), current: current === "terms" },
    { href: href("/mcp-server"), label: "MCP", current: current === "mcp" },
    codeLink(stars)
  ]);
}
