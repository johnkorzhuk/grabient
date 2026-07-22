// Integration test against the BUILT islands bundle (dist/client): the grid
// island must mount from SSR-embedded JSON without fetching (initialData),
// replace the SSR grid, and register the params handler that makes
// style/steps/angle changes in-place instead of full navigations.
// Requires `pnpm build` first (CI order: build -> test).
import { describe, expect, it, vi } from "vitest";
import manifest from "../dist/client/.vite/manifest.json";

const DATA = {
  palettes: [
    { seed: "_test1", href: "/_test1", background: "linear-gradient(90deg, #000, #fff)", likesCount: 2 },
    { seed: "_test2", href: "/_test2", background: "red", likesCount: 0 },
  ],
  total: 2,
  totalPages: 1,
};

describe("islands integration (built bundle)", () => {
  it("mounts the grid island from SSR data, removes SSR grid, registers params handler", async () => {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
    };
    window.scrollTo = () => {};
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    document.body.innerHTML = `
<header><form id="opts"><select name="style"><option value="">Auto</option></select><input name="steps" value=""><input name="angle" value=""></form></header>
<main class="wrap">
<div id="grid-ssr"><ul class="grid"><li><a class="card" href="/_test1">ssr</a></li></ul></div>
<div id="grid-island"></div>
<script type="application/json" id="__DATA__">${JSON.stringify(DATA)}</script>
</main>`;

    await import(/* @vite-ignore */ `../dist/client/${manifest["src/islands/entry.tsx"].file}`);
    await new Promise((r) => setTimeout(r, 50));

    expect(document.getElementById("grid-ssr")).toBeNull();
    const cards = document.querySelectorAll("#grid-island a.card");
    expect(cards.length).toBe(2);
    expect(cards[0].getAttribute("href")).toBe("/_test1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(typeof window.__paramsHandler).toBe("function");
  });
});
