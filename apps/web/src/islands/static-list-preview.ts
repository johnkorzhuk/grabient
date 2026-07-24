import type { PaletteStyle } from "@repo/data-ops/valibot-schema/grabient";
import { exportItemData, renderPalette } from "../palette";
import type { ListSearch } from "../search";
import type { PaletteItem } from "./grid";

type PreviewParams = Pick<ListSearch, "style" | "steps" | "angle">;

/**
 * Repaint an SSR-only palette list (currently /saved) for transient option
 * previews without replacing its authenticated pagination with the public
 * palettes query used by GridIsland.
 */
export function applyStaticListPreview(items: PaletteItem[], params: PreviewParams): void {
  const bySeed = new Map(items.map((item) => [item.seed, item]));

  document.querySelectorAll<HTMLElement>("[data-palette-card]").forEach((card) => {
    const seed = card.dataset.paletteSeed;
    const item = seed ? bySeed.get(seed) : undefined;
    if (!seed || !item) return;

    const style = params.style === "auto" ? item.style : params.style;
    const steps = params.steps === "auto" ? item.steps : params.steps;
    const angle = params.angle === "auto" ? item.angle : params.angle;
    if (style == null || steps == null || angle == null) return;

    const rendered = renderPalette(seed, style as PaletteStyle, steps, angle);
    if (!rendered) return;

    card.dataset.paletteStyle = style;
    card.dataset.paletteSteps = String(steps);
    card.dataset.paletteAngle = String(angle);
    card.querySelectorAll<HTMLElement>(".card, .glow").forEach((el) => {
      el.style.background = rendered.background;
    });

    const toggle = card.querySelector<HTMLElement>("[data-export-toggle]");
    const exportItem = exportItemData(seed, style as PaletteStyle, steps, angle);
    if (toggle && exportItem) {
      toggle.dataset.exportId = exportItem.id;
      toggle.dataset.exportStyle = style;
      toggle.dataset.exportSteps = String(steps);
      toggle.dataset.exportAngle = String(angle);
    }

    const like = card.closest("li")?.querySelector<HTMLElement>("[data-like-seed]");
    if (like) {
      like.dataset.likeStyle = style;
      like.dataset.likeSteps = String(steps);
      like.dataset.likeAngle = String(angle);
    }
  });
}
