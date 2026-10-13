import { VIEW_DATA } from "../../mcp-view/page.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import type { GrantProps } from "../oauth/server.ts";

/* The palette view: an MCP App (the extension io.modelcontextprotocol/ui), one read-only page an AI app draws where
   show_palettes answers, drawing the palettes from their seeds (src/mcp-view). This is what the server says of it: the
   capability, its resource, which calls come from an app that draws it, and the data it draws from. The `mcp-view`
   flag takes it away from every app at once. */

export const UI_EXTENSION = "io.modelcontextprotocol/ui";
export const VIEW_MIME = "text/html;profile=mcp-app";
/** The view's address. Versioned: stored conversations ask for it again, so a change they could not draw ships as v2
    beside it, and its answers only gain fields. */
export const PALETTES_VIEW = "ui://grabient/v1/palettes.html";
/** The one tool that shows the view. A tool that names a view has every answer taken as shown (Claude tells its model
    the person already sees it), so the tools that find, make and change palettes name none. */
export const VIEW_TOOL = "show_palettes";
/** The page changes with a deploy only and is the same for everyone: an app may keep it a day. */
export const KEPT = { ttlMs: 86_400_000, cacheScope: "public" } as const;

/** Whether the view is offered: on unless an admin turned it off. */
export const viewOn = async (env: Pick<Env, "DB">): Promise<boolean> =>
  !(await flagOff(env, "mcp-view"));

/** The extension the server declares beside its tools while the view is on. */
export const viewExtension = (on: boolean) =>
  on ? { [UI_EXTENSION]: { mimeTypes: [VIEW_MIME] } } : {};

/** show_palettes' `_meta` while the view is on: the specification's place and the flat key it replaced, which hosts
    still read. */
export const VIEW_TOOL_META = {
  ui: { resourceUri: PALETTES_VIEW },
  "ui/resourceUri": PALETTES_VIEW
};

/* The apps known to draw views: Claude's app on the web, the desktop and a phone, and ChatGPT, each by the document its
   maker publishes, or by the site its sign-in returns to where it registered itself instead. Claude Code, Codex and
   VS Code return to the person's machine and read the files. */
const VIEW_CLIENTS: readonly string[] = [
  "https://claude.ai/oauth/mcp-oauth-client-metadata",
  "https://chatgpt.com/oauth/client.json"
];
const VIEW_HOSTS: readonly string[] = ["claude.ai", "chatgpt.com"];

/** Whether a call comes from an app that draws the view. A 2026-07-28 request that declares the extension says so
    itself; any other comes from such an app where the app is one known to draw views (Claude's drew them before it
    declared the extension). ChatGPT is also known by the hints of its own it puts in a handshake's `_meta`. */
export function drawsView(
  meta: Record<string, unknown>,
  modern: boolean,
  app: { clientId: string } & Pick<GrantProps, "kind" | "host">
): boolean {
  const capabilities = meta["io.modelcontextprotocol/clientCapabilities"] as
    | { extensions?: Record<string, unknown> }
    | undefined;
  const ui = capabilities?.extensions?.[UI_EXTENSION];
  if (ui && typeof ui === "object") {
    const types = (ui as { mimeTypes?: unknown }).mimeTypes;
    return !Array.isArray(types) || types.includes(VIEW_MIME);
  }
  const known =
    VIEW_CLIENTS.includes(app.clientId) ||
    (app.kind === "registered" && VIEW_HOSTS.includes(app.host ?? ""));
  return known || (!modern && Object.keys(meta).some(key => key.startsWith("openai/")));
}

/** The view's data, which show_palettes answers in `_meta` where an app draws the view: the site, and each tile's
    number, seed and view. A title rides only where it is the tile's own, since the page reads every title here as one.
    Never structuredContent: an app may hand its model that in the text's place, and the text holds each color. */
export const viewData = (
  origin: string,
  tiles: readonly {
    tile: number;
    seed: string;
    title: string;
    own?: boolean;
    style: string;
    steps: number;
    angle: number;
  }[]
) => ({
  [VIEW_DATA]: {
    origin,
    tiles: tiles.map(({ tile, seed, title, own, style, steps, angle }) => ({
      tile,
      seed,
      style,
      steps,
      angle,
      ...(own ? { title } : {})
    }))
  }
});
