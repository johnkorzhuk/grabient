// The island entry point.
//
// Everything on this dashboard is server-rendered and works with no
// JavaScript at all; islands only UPGRADE what is already on the page. Each
// host element contains the finished static markup and a JSON payload, so if
// this bundle fails to parse, is blocked, or simply has not run yet, the
// reader still has the table — the same contract as the "Table view"
// disclosure under every chart.
//
// The bundle is inlined into the document by html.ts rather than fetched:
// this worker has no assets binding, on purpose (see wrangler.jsonc).

import { render } from "solid-js/web";
import { SortableTable, type TablePayload } from "./table";

function mountTables() {
  document.querySelectorAll<HTMLElement>("[data-island='table']").forEach((host) => {
    const script = host.querySelector<HTMLScriptElement>("script[type='application/json']");
    if (!script) return;
    let payload: TablePayload;
    try {
      payload = JSON.parse(script.textContent || "");
    } catch {
      return; // keep the static table
    }
    if (!payload.rows?.length) return;
    // Replace the static markup only once the payload parsed — a half-mounted
    // island is worse than no island.
    const mount = document.createElement("div");
    host.replaceChildren(mount);
    render(() => <SortableTable payload={payload} />, mount);
  });
}

function boot() {
  try {
    mountTables();
  } catch (error) {
    // Never let an island take the page down with it; the server-rendered
    // content underneath is the product.
    console.error("island mount failed", error);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

// The table disclosures are inside <details>; browsers parse their contents up
// front, so nothing extra is needed for closed ones — but pages can add hosts
// later (none do today), so expose a re-scan for that case.
declare global {
  interface Window {
    __mountIslands?: () => void;
  }
}
window.__mountIslands = boot;
