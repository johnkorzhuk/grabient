/* The export column's settings, apart from the grid they are drawn on (exportgrid.ts): a page that holds a selection
   keeps its numbers from its start, and the drawing comes with the export screen. */

/** Width and Height are each palette's size: its pixels, or auto, which follows the other side at Auto's shape (both
    auto with `preset` auto is Auto itself). `preset` names the row the size is: auto, a preset, screen or custom. Gap,
    padding and corners are percentages of a palette's shorter side. */
export interface ExportSettings {
  preset: string;
  width: number | "auto";
  height: number | "auto";
  /** auto: the count of columns that suits the size */
  columns: number | "auto";
  gap: number;
  padding: number;
  corners: number;
}
export const EXPORT_DEFAULTS: ExportSettings = {
  preset: "auto",
  width: "auto",
  height: "auto",
  columns: "auto",
  gap: 10,
  padding: 15,
  corners: 29
};
