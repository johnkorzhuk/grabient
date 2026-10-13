/* What the view's built page carries besides its script, shared by its build (build.ts), the Worker that serves it
   (server/mcp/view.ts) and the page itself (main.tsx). Pure: no imports. */

/** The script element that holds the view's words: every language's catalog as JSON. */
export const MESSAGES_ID = "grabient-view-messages";
/** The meta tag the Worker writes its origin into, so a view whose answer names no site still links to the right one. */
export const ORIGIN_META = '<meta name="grabient-origin" content="">';
/** Where an answer carries the view's data: this key of its `_meta`, which an app hands the view and never its model. */
export const VIEW_DATA = "com.grabient/view";
/** The MCP Apps specification the view's bridge speaks. */
export const APPS_PROTOCOL = "2026-01-26";
