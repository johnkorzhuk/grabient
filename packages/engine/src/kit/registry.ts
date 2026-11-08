/* The field effects the site plays (kit/kinds.ts), each its own file in kit/fields/ and nothing more: their
   definitions, read at once where code draws one in step (the Worker's files, cards and clips, the stills' chunk,
   engine/fx-still.ts, which pages load on demand). Each one's kernel in GLSL and WGSL loads apart (kit/kernels.ts). No
   page's start loads this. */
import strata from "./fields/strata.ts";
import zen from "./fields/zen.ts";
import type { KitKind } from "./kinds.ts";
import type { FieldEffect } from "./types.ts";

const EFFECTS: Readonly<Record<KitKind, FieldEffect>> = { zen, strata };

/** A kit effect's definition. */
export const kitEffect = (kind: KitKind): FieldEffect => EFFECTS[kind];
