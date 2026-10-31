/* An animated SVG as an app that previews a posted link reads it: a page whose card is the SVG's first frame under the
   wordmark, titled with the palette's name, since an SVG carries no card of its own. The page is the link preview's
   alone: the edge keeps no copy of it (pipeline.ts), and a reader's browser gets the SVG. */
import { NO_STORE } from "../../lib/cache.ts";

const attribute = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function svgPreview(page: {
  address: string;
  card: string;
  title: string;
  about: string;
}): Response {
  const address = attribute(page.address);
  const card = attribute(page.card);
  const title = attribute(page.title);
  const about = attribute(page.about);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="${about}"><link rel="canonical" href="${address}"><meta property="og:type" content="website"><meta property="og:site_name" content="Grabient"><meta property="og:title" content="${title}"><meta property="og:description" content="${about}"><meta property="og:url" content="${address}"><meta property="og:image" content="${card}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${about}"><meta name="twitter:image" content="${card}"></head><body><img src="${address}" alt="" width="1200" height="630"></body></html>`;
  return new Response(html, {
    headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8", Vary: "User-Agent" }
  });
}
