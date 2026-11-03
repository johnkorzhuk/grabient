/* The papercut as Figma's own layers, for Copy for Figma: its sheets as its SVG file lays them (papercut-svg.ts
   papercutFileOf), each a group of four vector layers, its cut's loops a vector network with its holes by the odd
   rule (figma-paste.ts figmaVector), bottom to top:
   1. "shadow": the cut moved away from the light by the shadow's offset, filled in the sheet's shadow color at the
      shadow's opacity, under a layer blur of the shadow's sigma (2.351 times it, Figma's measured radius: FIGMA_FINISH);
   2. "contact": the cut, in the shadow's color at the contact's opacity, under the contact's blur;
   3. "wall": the cut in its lit edge's color;
   4. "face": the cut moved toward the light by the edge's width, in the sheet's color.
   The ground is the box filled in the first color, all of it in the frame, which clips to the box. A paste is the still
   at any pace: a cut's islands surface and part as the papercut moves, which no layer's turn or move follows, so
   Figma's timeline has nothing to key. Its soft and grain wrap it as the site paints them (figmaFinish). */
import {
  FIGMA_FINISH,
  FIGMA_PAGE,
  type FigmaFinish,
  type FigmaNode,
  figmaBlur,
  figmaFinish,
  figmaLayers,
  figmaPasteHtml,
  figmaPathLoops,
  figmaScene,
  figmaSolid,
  figmaVector
} from "./figma-paste.ts";
import type { Underlay } from "./fx-finish.ts";
import type { Palette } from "./palette.ts";
import { papercutScene } from "./papercut.ts";
import { papercutFileCuts } from "./papercut-svg.ts";

/** A papercut to paste: its palette and look, the frame's size and name, and its soft and grain. */
export interface FigmaPapercutView {
  palette: Palette;
  angle: number;
  shape: number | null;
  width: number;
  height: number;
  name: string;
  finish?: FigmaFinish | null;
  /** the gradient a soft papercut's edges go to (fx-finish.ts effectUnderlay), none for none */
  underlay?: Underlay | null;
}

/* a blur's radius as Figma draws a Gaussian of `sigma` */
const blurOf = (sigma: number) => figmaBlur(Math.round(FIGMA_FINISH.blur * sigma * 1000) / 1000);

/** The papercut's layers as Figma's scene (figmaScene), and the vector networks they name. */
export function figmaPapercutNodes(view: FigmaPapercutView): {
  nodes: FigmaNode[];
  blobs: Uint8Array[];
} {
  const { width: W, height: H } = view;
  const m = papercutScene(
    view.palette,
    { angle: view.angle, shape: view.shape },
    { width: W, height: H }
  );
  const cuts = papercutFileCuts(m);
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
  const sheets = group("papercut", into.parent, into.index, 0, 0, W, H);
  add("RECTANGLE", "ground", sheets, 0, W, H, 0, 0, { fillPaints: [figmaSolid(m.hex[0])] });
  let index = 1;
  for (let k = 1; k < m.n; k++) {
    const cut = cuts[k - 1];
    if (cut === null) continue;
    const layers = [
      {
        name: "shadow",
        loops: figmaPathLoops(cut.shadow),
        extra: {
          fillPaints: [figmaSolid(m.shadowHex[k])],
          opacity: m.alpha[k],
          effects: [blurOf(m.sigma[k])]
        }
      },
      {
        name: "contact",
        loops: figmaPathLoops(cut.cut),
        extra: {
          fillPaints: [figmaSolid(m.shadowHex[k])],
          opacity: m.calpha,
          effects: [blurOf(m.csigma)]
        }
      },
      {
        name: "wall",
        loops: figmaPathLoops(cut.cut),
        extra: { fillPaints: [figmaSolid(m.wallHex[k])] }
      },
      {
        name: "face",
        loops: figmaPathLoops(cut.face),
        extra: { fillPaints: [figmaSolid(m.hex[k])] }
      }
    ];
    /* the sheet's group fits its layers' loops, which it places its layers from */
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const l of layers)
      for (const loop of l.loops)
        for (const c of loop)
          for (const [x, y] of c) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
    const sheet = group(`sheet ${k}`, sheets, index++, x0, y0, x1 - x0, y1 - y0);
    layers.forEach((l, i) => {
      const moved = l.loops.map(loop =>
        loop.map(c => c.map(([x, y]) => [x - x0, y - y0] as const))
      ) as unknown as typeof l.loops;
      figmaVector(add, blobs, l.name, sheet, i, moved, l.extra);
    });
  }
  return { nodes: figmaScene(nodes), blobs };
}

/** The clipboard's text/html of a papercut, which a paste into Figma reads as its layers. */
export function figmaPapercutHtml(
  view: FigmaPapercutView,
  pasteID = Math.floor(Math.random() * 0x7fffffff)
): string {
  const { nodes, blobs } = figmaPapercutNodes(view);
  return figmaPasteHtml(nodes, pasteID, "grabientPastePapercut01", blobs);
}
