import { generateSvgGradient } from "@repo/data-ops/gradient-gen";
import type { ExportItem } from "@/queries/palettes";

export interface SVGGridOptions {
  exportList: ExportItem[];
  itemWidth: number;
  itemHeight: number;
}

export function generateSVGGrid(options: SVGGridOptions): string {
  const { exportList, itemWidth, itemHeight } = options;

  const gapX = 40;
  const gapY = 80;
  const padding = 56;
  const columns = Math.min(exportList.length, 5);
  const rows = Math.ceil(exportList.length / columns);

  const totalWidth = columns * itemWidth + (columns - 1) * gapX + padding * 2;
  const totalHeight = rows * itemHeight + (rows - 1) * gapY + padding * 2;

  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`;

  for (let index = 0; index < exportList.length; index++) {
    const item = exportList[index];
    if (!item) continue;

    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = padding + column * (itemWidth + gapX);
    const y = padding + row * (itemHeight + gapY);

    const itemSVG = generateSvgGradient(
      item.hexColors,
      item.style,
      item.angle,
      { seed: item.seed, searchString: "" },
      null,
      { width: itemWidth, height: itemHeight, gridItemIndex: index }
    );

    const svgMatch = itemSVG.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    if (svgMatch && svgMatch[1]) {
      const innerSVG = svgMatch[1];
      svgContent += `\n<g transform="translate(${x}, ${y})">${innerSVG}</g>`;
    }
  }

  svgContent += `\n</svg>`;
  return svgContent;
}

export function downloadSVGGrid(options: SVGGridOptions): void {
  const svgString = generateSVGGrid(options);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `grabient-grid-${Date.now()}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function copySVGGridToClipboard(options: SVGGridOptions): Promise<void> {
  const svgString = generateSVGGrid(options);
  try {
    await navigator.clipboard.writeText(svgString);
  } catch (error) {
    throw new Error(`SVG grid copy to clipboard failed: ${error}`);
  }
}
