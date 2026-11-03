/* The gradient a soft effect's edges go to (engine/fx-finish.ts effectUnderlay), which Copy for Figma lays under a soft
   paste (formats.ts figmaHtml), in a module of its own that the press loads for a soft view alone: a dynamic import
   keeps every export of the module it names, and fx-finish.ts's took the grain's tiles into every page's start. */
export { effectUnderlay } from "@grabient/engine/fx-finish.ts";
