import { generateSvgGradient } from "@repo/data-ops/gradient-gen";
import type { ExportItem } from "@/queries/palettes";

export interface SVGGridOptions {
  exportList: ExportItem[];
  itemWidth: number;
  itemHeight: number;
}

/**
 * Generate angular gradient content in LOCAL coordinates (0,0 origin).
 * The caller wraps this in a translate group for positioning.
 * This matches how the single SVG generator works and ensures Figma compatibility.
 */
function generateAngularGradientForGrid(
  hexColors: string[],
  angle: number,
  width: number,
  height: number,
  index: number
): { content: string; defs: string } {
  // Build color stops for CSS conic-gradient
  const colorStops = hexColors.map((color, i) => {
    const position = ((i / (hexColors.length - 1)) * 360).toFixed(6);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 1) ${position}deg`;
  });

  // Center position in LOCAL coordinates (the translate group handles positioning)
  const centerX = width / 2;
  const centerY = height / 2;

  // Use the diagonal to ensure full coverage of rectangular shapes
  const diagonal = Math.sqrt(width * width + height * height);
  const foreignObjectSize = diagonal * 4;
  const foreignObjectHalf = foreignObjectSize / 2;

  // Scale factor
  const scale = diagonal / foreignObjectSize;

  // Rotation calculation
  const rotationDeg = angle - 90;
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  // Transform matrix centered at local center
  const a = scale * cos;
  const b = scale * sin;
  const c = -scale * sin;
  const d = scale * cos;

  const clipPathId = `paint${index}_angular_clip_path`;

  // Clip path in LOCAL coordinates (0,0 to width,height)
  const clipDef = `<clipPath id="${clipPathId}"><rect width="${width}" height="${height}"/></clipPath>`;

  // Build Figma gradient metadata
  const gradientStops = hexColors
    .map((color, i) => {
      const position = i / (hexColors.length - 1);
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const bVal = parseInt(color.slice(5, 7), 16) / 255;
      return `{&quot;color&quot;:{&quot;r&quot;:${r},&quot;g&quot;:${g},&quot;b&quot;:${bVal},&quot;a&quot;:1},&quot;position&quot;:${position}}`;
    })
    .join(",");

  // Figma's transform - m02/m12 are the center in local coordinates
  const figmaScale = Math.max(width, height);
  const m00 = figmaScale * cos;
  const m01 = -figmaScale * sin;
  const m02 = centerX;
  const m10 = figmaScale * sin;
  const m11 = figmaScale * cos;
  const m12 = centerY;

  const gradientFillData = `{&quot;type&quot;:&quot;GRADIENT_ANGULAR&quot;,&quot;stops&quot;:[${gradientStops}],&quot;stopsVar&quot;:[${gradientStops}],&quot;transform&quot;:{&quot;m00&quot;:${m00.toFixed(6)},&quot;m01&quot;:${m01.toFixed(6)},&quot;m02&quot;:${m02.toFixed(6)},&quot;m10&quot;:${m10.toFixed(6)},&quot;m11&quot;:${m11.toFixed(6)},&quot;m12&quot;:${m12.toFixed(6)}},&quot;opacity&quot;:1.0,&quot;blendMode&quot;:&quot;NORMAL&quot;,&quot;visible&quot;:true}`;

  // Content in LOCAL coordinates - rect at (0,0)
  const content = `<g clip-path="url(#${clipPathId})" data-figma-skip-parse="true"><g transform="matrix(${a.toFixed(6)} ${b.toFixed(6)} ${c.toFixed(6)} ${d.toFixed(6)} ${centerX.toFixed(6)} ${centerY.toFixed(6)})"><foreignObject x="${-foreignObjectHalf}" y="${-foreignObjectHalf}" width="${foreignObjectSize}" height="${foreignObjectSize}"><div xmlns="http://www.w3.org/1999/xhtml" style="background:conic-gradient(from 90deg,${colorStops.join(",")});height:100%;width:100%;opacity:1"></div></foreignObject></g></g><rect width="${width}" height="${height}" data-figma-gradient-fill="${gradientFillData}"/>`;

  return { content, defs: clipDef };
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

  const allDefs: string[] = [];
  const allContent: string[] = [];

  for (let index = 0; index < exportList.length; index++) {
    const item = exportList[index];
    if (!item) continue;

    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = padding + column * (itemWidth + gapX);
    const y = padding + row * (itemHeight + gapY);

    if (item.style === "angularGradient") {
      // Generate angular gradient in local coordinates, then wrap in translate group
      const { content, defs } = generateAngularGradientForGrid(
        item.hexColors,
        item.angle,
        itemWidth,
        itemHeight,
        index
      );
      // Wrap in translate group just like other gradient types
      allContent.push(`<g transform="translate(${x}, ${y})">${content}</g>`);
      allDefs.push(defs);
    } else {
      // Other styles use the standard approach
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
        let innerSVG = svgMatch[1];

        // Extract defs from inner SVG
        const defsMatch = innerSVG.match(/<defs>([\s\S]*?)<\/defs>/);
        if (defsMatch && defsMatch[1]) {
          allDefs.push(defsMatch[1]);
          innerSVG = innerSVG.replace(/<defs>[\s\S]*?<\/defs>/, "");
        }

        allContent.push(`<g transform="translate(${x}, ${y})">${innerSVG}</g>`);
      }
    }
  }

  let svgContent = `<svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" fill="none" xmlns="http://www.w3.org/2000/svg">`;

  // Add all content first (like Figma does)
  svgContent += allContent.join("\n");

  // Add defs at the end (like Figma does)
  if (allDefs.length > 0) {
    svgContent += `\n<defs>\n${allDefs.join("\n")}\n</defs>`;
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
