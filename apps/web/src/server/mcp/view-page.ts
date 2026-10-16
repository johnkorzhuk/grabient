/// <reference path="../../mcp-view/virtual.d.ts" />
import viewPage from "virtual:mcp-view";
import { ORIGIN_META } from "../../mcp-view/page.ts";
import { KEPT, PALETTES_VIEW, VIEW_MIME } from "./view.ts";

/* The view's page as the server answers it: the one HTML file the view's build makes (mcp-view/build.ts), with this
   site's origin written in. */

/* No border of the app's, and the clipboard for Copy. No network policy: the page loads nothing. The openai/ keys are
   ChatGPT's: its model's line about the view, and the modes it may open in, inline first, since ChatGPT opens an app
   that may also fill the screen full screen unless it says otherwise. */
export const RESOURCE_META = {
  ui: { prefersBorder: false, permissions: { clipboardWrite: {} } },
  "openai/widgetDescription":
    "The palettes show_palettes answered, drawn from their seeds and numbered as in its answer, with links to their pages on Grabient; full screen shows the chosen one's colors and a strip that copies its address, CSS, SVG or PNG.",
  "openai/ui": { availableDisplayModes: ["inline", "fullscreen"], preferredDisplayMode: "inline" }
};

/* The view's own origin, which ChatGPT's directory asks of every app with a view: the site's. ChatGPT's own key for
   it, never the standard's ui.domain, which Claude takes only in its own hashed form and refuses otherwise. */
const metaAt = (origin: string) => ({ ...RESOURCE_META, "openai/widgetDomain": origin });

/** The view as resources/list names it. */
export const viewResource = (origin: string) => ({
  uri: PALETTES_VIEW,
  name: "palettes",
  title: "Palettes",
  description: "The palettes show_palettes shows, drawn from their seeds.",
  mimeType: VIEW_MIME,
  _meta: metaAt(origin)
});

/** The page, with this site's origin written in for a view whose answer names none. */
function page(origin: string): string {
  const attribute = origin.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return viewPage.replace(ORIGIN_META, `<meta name="grabient-origin" content="${attribute}">`);
}

/** resources/read of the view, in the shape of the request's era. Readable while the view is off, for an app that
    kept the tool list from before. */
export const readView = (origin: string, modern: boolean) => ({
  contents: [
    { uri: PALETTES_VIEW, mimeType: VIEW_MIME, text: page(origin), _meta: metaAt(origin) }
  ],
  ...(modern ? KEPT : {})
});
