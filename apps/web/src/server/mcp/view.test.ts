import { describe, expect, it } from "vitest";
import drawsJson from "./fixtures/draws-view.json" with { type: "json" };
import viewDataGolden from "./fixtures/view-data.json" with { type: "json" };
import { drawsView, viewData } from "./view.ts";

const drawsGolden = drawsJson as {
  label: string;
  meta: Record<string, unknown>;
  modern: boolean;
  app: { clientId: string; kind?: "registered"; host?: string };
  draws: boolean;
}[];

describe("the palette view", () => {
  it("is drawn by an app that declares it, or one known to draw views", () => {
    for (const golden of drawsGolden) {
      expect(drawsView(golden.meta, golden.modern, golden.app), golden.label).toBe(golden.draws);
    }
  });

  it("is handed each tile's number, seed and view, and a title only where it is the tile's own", () => {
    expect(
      viewData("https://grabient.com", [
        {
          tile: 1,
          seed: "kSWUkczDNDewdRK",
          title: "Mine",
          own: true,
          style: "linearGradient",
          steps: 7,
          angle: 90
        },
        {
          tile: 2,
          seed: "kQf5EOWSTcQ",
          title: "By colors",
          style: "radialSwatches",
          steps: 5,
          angle: 90
        }
      ])
    ).toEqual(viewDataGolden);
  });
});
