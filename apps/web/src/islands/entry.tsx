import { render } from "solid-js/web";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import "../app.client.js";
import "../embed-notice.js";
import { GridIsland, type ListData } from "./grid";
import { listKey, setPreviewPatch, syncFromLocation, updateKey } from "./params";
import { parseListSearch } from "../search";
import { applyStaticListPreview } from "./static-list-preview";

// One client for the whole session — the cache survives page swaps, which is
// what makes list -> seed -> back feel like a persistent client app.
const queryClient = new QueryClient();

let disposers: (() => void)[] = [];
let paramsTimer: ReturnType<typeof setTimeout> | undefined;

declare global {
  interface Window {
    __paramsHandler?: (fields: Record<string, string>) => void;
    __previewHandler?: (fields: Record<string, string> | null) => void;
    __popstateHandler?: () => boolean;
    __fitSwatches?: () => void;
  }
}

function fieldsToPatch(fields: Record<string, string>) {
  const sp = new URLSearchParams();
  for (const k in fields) if (fields[k]) sp.set(k, fields[k]!);
  const parsed = parseListSearch(sp);
  return { style: parsed.style, steps: parsed.steps, angle: parsed.angle };
}

function mountIslands() {
  disposers.forEach((d) => d());
  disposers = [];
  delete window.__paramsHandler;
  delete window.__previewHandler;
  delete window.__popstateHandler;
  setPreviewPatch(null);

  const gridHost = document.getElementById("grid-island");
  const dataEl = document.getElementById("__DATA__");
  if (gridHost && dataEl) {
    syncFromLocation();
    const initial = JSON.parse(dataEl.textContent || "{}") as ListData;
    const initialKey = JSON.stringify(listKey());

    disposers.push(
      render(
        () => (
          <QueryClientProvider client={queryClient}>
            <GridIsland initial={initial} initialKey={initialKey} />
          </QueryClientProvider>
        ),
        gridHost,
      ),
    );
    document.getElementById("grid-ssr")?.remove();

    // The nav layer's #opts form handler delegates here while the island is
    // mounted: style/steps/angle changes update the grid in place. Values are
    // validated through the shared valibot schema — junk collapses to "auto".
    // Debounced so rapid arrow-key stepping coalesces into one refetch.
    window.__paramsHandler = (fields) => {
      // Optimistic: cards re-render from the preview overlay instantly; the
      // URL write + query-key change debounces behind it.
      setPreviewPatch(fieldsToPatch(fields));
      clearTimeout(paramsTimer);
      paramsTimer = setTimeout(() => {
        updateKey(fieldsToPatch(fields));
        setPreviewPatch(null);
      }, 250);
    };

    // Transient hover/typing preview — writes the overlay only, never the URL.
    window.__previewHandler = (fields) => {
      setPreviewPatch(fields ? fieldsToPatch(fields) : null);
    };
  } else if (dataEl?.hasAttribute("data-static-preview")) {
    // Authenticated Saved pages intentionally keep their SSR grid/pagination
    // instead of querying the public palettes endpoint. They still get the
    // same instant style/steps/angle hover preview by repainting those cards
    // from the serialized SSR palette data.
    const initial = JSON.parse(dataEl.textContent || "{}") as ListData;
    window.__previewHandler = (fields) => {
      const params = fields
        ? fieldsToPatch(fields)
        : parseListSearch(new URLSearchParams(location.search));
      applyStaticListPreview(initial.palettes, params);
    };
  }

  const editorHost = document.getElementById("editor-island");
  if (editorHost) {
    // Code-split: list pages never pay for the editor (serialization + css gen).
    const props = { ...editorHost.dataset };
    void import("./edit").then(({ EditorIsland }) => {
      if (!document.getElementById("editor-island")) return;
      editorHost.replaceChildren();
      disposers.push(
        render(
          () => (
            <EditorIsland
              seed={props.seed!}
              style={props.style as never}
              steps={Number(props.steps)}
              angle={Number(props.angle)}
            />
          ),
          editorHost,
        ),
      );
    });
  }

  // Multi-palette export: list pages only (seed pages never pay for it).
  // Plain DOM, no Solid — bootExport re-syncs selection/view state per swap.
  if (document.getElementById("export-slot")) {
    void import("./export").then((m) => m.bootExport());
  }
}

document.addEventListener("app:swap", mountIslands);
addEventListener("popstate", syncFromLocation);
mountIslands();
