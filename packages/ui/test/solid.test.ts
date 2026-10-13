import { decodePalette } from "@grabient/engine/codec.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { describe, expect, test } from "vitest";
import { buildFigure, type FigureMeta, figureMeta, figureName } from "../src/figure.ts";
import { marksSvg } from "../src/marks.ts";
import { CAM0, nearestOnPath, solidFrame, solidScene } from "../src/solid.ts";
import { BRAND_SUPPLY } from "../src/supply.ts";
import { golden, r4 } from "./support.ts";

const EIGHT = BRAND_SUPPLY[1];
const P8 = decodePalette(EIGHT) as Palette;
const ink = { ink: "#f2f2f2", ink3: "#9a9a9a", edge: "#3a3a3a", paper: "#121212" };
type Parts = Record<string, string | [string, string]>;
const parts = golden<Record<string, Parts>>("figureParts");
/* a layer of an SVG by its name, its groups balanced */
function layerOf(svg: string, name: string): string {
  const head = `<g id="${name}" data-name="${name}">`;
  const from = svg.indexOf(head);
  if (from < 0) return "";
  let depth = 0;
  for (const m of svg.slice(from).matchAll(/<g[\s>]|<\/g>/g)) {
    depth += m[0] === "</g>" ? -1 : 1;
    if (!depth) return svg.slice(from, from + (m.index ?? 0) + 4);
  }
  return "";
}

describe("the color solid's scene", () => {
  test("the live scene's ring, bay and path land where they did", () => {
    for (const hullK of [0, 1, null]) {
      const want = golden<{ ringC: number; bay: unknown; pathHead: number[][]; pathLen: number }>(
        `solid-live-hull${hullK}`
      );
      const f = solidFrame(P8, 9, true, false, [1, 4], 96);
      const r = solidScene(f, CAM0, ink, 380, 480, { hullK, outline: true });
      expect(r4(r.ringC)).toBe(want.ringC);
      expect(r4(r.bay)).toEqual(want.bay);
      expect(r4(r.path.slice(0, 5))).toEqual(want.pathHead);
      expect(r.path).toHaveLength(want.pathLen);
    }
  });

  test("a press reads the nearest point along the drawn path", () => {
    const want = golden<unknown[]>("nearestOnPath");
    const path: [number, number][] = [
      [0, 0],
      [50, 50],
      [100, 0]
    ];
    expect(
      r4(
        [
          [10, 10],
          [55, 40],
          [200, 0]
        ].map(p => nearestOnPath(path, [0, 0.5, 1], p as [number, number]))
      )
    ).toEqual(want);
  });

  test("the scene as an SVG writes only literal colors, the clip once, and nothing unseen", () => {
    const f = solidFrame(P8, 9, true, false, [1], 96);
    const svg = marksSvg(
      solidScene(f, CAM0, ink, 380, 480, { hullK: 0, outline: true }).marks,
      "s"
    );
    expect(svg).not.toMatch(/oklch\(|var\(|opacity="0"/);
    expect(svg.match(/<clipPath /g)).toHaveLength(1);
    expect(svg).toContain("light · L 1");
  });
});

describe("the figures", () => {
  test("the footer's numbers are measured as before", () => {
    const meta = golden<{ seed: string; steps7: FigureMeta; steps2: FigureMeta }[]>("figureMeta");
    for (const m of meta) {
      const P = decodePalette(m.seed) as Palette;
      expect(r4(figureMeta(P, 7))).toEqual(m.steps7);
      expect(r4(figureMeta(P, 2, true))).toEqual(m.steps2);
    }
    const names = golden<string[]>("figureName");
    expect([figureName(EIGHT), figureName(EIGHT, true)]).toEqual(names.slice(1));
  });

  for (const theme of ["dark", "light"] as const)
    test(`the ${theme} figures draw the same card, header, strip, chroma read and footer`, () => {
      const three = buildFigure({
        palette: P8,
        steps: 9,
        stepped: true,
        theme,
        style: "linearSwatches",
        angle: 45,
        seed: EIGHT
      });
      const kept = buildFigure({
        palette: P8,
        steps: 9,
        kept: true,
        wide: true,
        theme,
        style: "radialGradient",
        seed: EIGHT
      });
      for (const [svg, name] of [
        [three, `figure3d-${theme}`],
        [kept, `figureSolid-${theme}`]
      ] as const) {
        const want = parts[name];
        expect(svg.match(/width="(\d+)" height="(\d+)"/)?.slice(1)).toEqual(want.size);
        for (const id of ["background", "header", "palette", "footer", "panel-chroma"])
          if (want[id]) expect(layerOf(svg, id), `${name} ${id}`).toBe(want[id]);
        for (const id of ["panel-orbit", "panel-solid"]) {
          const caption = want[`${id}-caption`];
          if (caption)
            expect(layerOf(svg, id).startsWith(`<g id="${id}" data-name="${id}">${caption}`)).toBe(
              true
            );
        }
        /* a design tool reads every color, and finds the solid's four layers */
        expect(svg).not.toMatch(/oklch\(|var\(--/);
        for (const id of ["wall", "path", "grid", "edges"]) expect(layerOf(svg, id)).not.toBe("");
        expect(svg).toContain(EIGHT);
      }
    });
});

describe("the solid on the server", () => {
  test("the pane is a group named Color space whose scene is a named, blank canvas until it is seen", async () => {
    const { renderToString } = await import("@solidjs/web");
    const { SolidPane } = await import("../src/SolidPane.tsx");
    const html = renderToString(() => SolidPane({ palette: P8, steps: 9, seed: EIGHT }));
    expect(html).toContain('aria-label="Color space"');
    expect(html).toContain(
      '<canvas class="canvas" role="img" aria-label="The palette in the color space"'
    );
    expect(html).toContain('aria-label="Copy"');
    expect(html).not.toContain("Hide color space");
  });
});
