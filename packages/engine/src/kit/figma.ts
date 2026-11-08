/* A field effect as Figma's own layers, for Copy for Figma: its file's layers (svg.ts kitFrameLayers: its first frame,
   traced as any frame's SVG is), each a vector layer of its path's loops, a vector network holding them all, filled by
   the odd rule (figma-paste.ts figmaVector) as the SVG fills them by evenodd, bottom to top:
   - "ground": the box in the ground's color, or in the highest sheet's that covers the box whole;
   - each sheet a group ("sheet 1" the lowest the frame shows, counted up from there; its level k stays out of the
     name, a periodic sheet's running below 0) of its "shadow" (its path moved by the shadow's move, in its color at
     the shadow's opacity; a soft shadow a "shadow" a layer, each the sheet's level raised, at its share of the
     opacity), its "rim" (moved toward the light, in its color at the rim's opacity) and itself ("sheet"), as the
     papercut's sheets are groups of their layers, each layer its own solid: a sheet's shadow the ink or the sheet
     below it darkened, its rim white or its own color lit, as the SVG fills them (shade.ts kitShadowColor,
     kitRimColor);
   - "lines", a group of one vector a line ("line 1" the lowest, counted up), the band between its two edges' levels.
   All of it in the frame, which clips to the box. A paste is the still at any pace: the levels change shape as the
   field moves, islands surfacing and parting, which no layer's turn or move follows, so Figma's timeline has nothing to
   key (as the papercut's and the strings'). Its soft and grain wrap it as the site paints them (figmaFinish). */
import {
  FIGMA_PAGE,
  type FigmaCubic,
  type FigmaFinish,
  type FigmaNode,
  figmaFinish,
  figmaLayers,
  figmaPasteHtml,
  figmaPathLoops,
  figmaScene,
  figmaSolid,
  figmaVector
} from "../figma-paste.ts";
import type { Underlay } from "../fx-finish.ts";
import type { Palette } from "../palette.ts";
import { kitScene } from "./scene.ts";
import { type KitLayer, kitFrameLayers } from "./svg.ts";
import type { FieldEffect } from "./types.ts";

/** A field effect to paste: its palette and look, the frame's size and name, and its soft and grain. */
export interface FigmaKitView {
  palette: Palette;
  angle: number;
  shape: number | null;
  /** the look's steps, for an effect that takes them (kit/scene.ts KitView): null as designed */
  steps: number | null;
  width: number;
  height: number;
  name: string;
  finish?: FigmaFinish | null;
  /** the gradient a soft effect's edges go to (fx-finish.ts effectUnderlay), none for none */
  underlay?: Underlay | null;
}

/** The effect's layers as Figma's scene (figmaScene), and the vector networks they name. */
export function figmaKitNodes(
  def: FieldEffect,
  view: FigmaKitView
): { nodes: FigmaNode[]; blobs: Uint8Array[] } {
  const { width: W, height: H } = view;
  const m = kitScene(
    def,
    view.palette,
    { angle: view.angle, shape: view.shape, steps: view.steps },
    { width: W, height: H }
  );
  const { ground, layers } = kitFrameLayers(m);
  const { nodes, add, group } = figmaLayers();
  const blobs: Uint8Array[] = [];
  const top = add("FRAME", view.name, FIGMA_PAGE, 0, W, H, 0, 0, {
    fillPaints: [],
    frameMaskDisabled: false
  });
  const into = figmaFinish(
    { add, group },
    top,
    { width: W, height: H },
    view.finish,
    view.underlay
  );
  const drawing = group(def.kind, into.parent, into.index, 0, 0, W, H);
  add("RECTANGLE", "ground", drawing, 0, W, H, 0, 0, { fillPaints: [figmaSolid(ground)] });
  /* the layers by their groups, in their order: each sheet's, then the lines' */
  const groups = new Map<string, KitLayer[]>();
  for (const l of layers) groups.set(l.group, [...(groups.get(l.group) ?? []), l]);
  let index = 1;
  for (const [name, members] of groups) {
    const loops = members.map(l => figmaPathLoops(l.d));
    /* the group fits its layers' loops, which it places its layers from */
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ls of loops)
      for (const loop of ls)
        for (const c of loop)
          for (const [x, y] of c) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
    const parent = group(name, drawing, index++, x0, y0, x1 - x0, y1 - y0);
    members.forEach((l, i) => {
      const moved = loops[i].map(loop =>
        loop.map(c => c.map(([x, y]) => [x - x0, y - y0] as const) as unknown as FigmaCubic)
      );
      figmaVector(add, blobs, l.name, parent, i, moved, {
        fillPaints: [figmaSolid(l.hex)],
        ...(l.alpha < 1 ? { opacity: l.alpha } : {})
      });
    });
  }
  return { nodes: figmaScene(nodes), blobs };
}

/** The file Figma's paste says it comes from: the effect's name in a key of the length the other effects' are. */
export const figmaKitFileKey = (def: FieldEffect): string =>
  `grabientPaste${(def.kind[0].toUpperCase() + def.kind.slice(1) + "0".repeat(10)).slice(0, 10)}`;

/** The clipboard's text/html of a field effect, which a paste into Figma reads as its layers. */
export function figmaKitHtml(
  def: FieldEffect,
  view: FigmaKitView,
  pasteID = Math.floor(Math.random() * 0x7fffffff)
): string {
  const { nodes, blobs } = figmaKitNodes(def, view);
  return figmaPasteHtml(nodes, pasteID, figmaKitFileKey(def), blobs);
}
