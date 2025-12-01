import { generateSvgGradient } from "@repo/data-ops/gradient-gen";
import type { ExportItem } from "@/queries/palettes";

export interface SVGGridOptions {
  exportList: ExportItem[];
  itemWidth: number;
  itemHeight: number;
}

export interface PNGGridOptions extends SVGGridOptions {
  quality?: number;
}

async function renderGradientToCanvas(
  ctx: CanvasRenderingContext2D,
  item: ExportItem,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  if (item.style === "angularGradient") {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const angleRad = ((item.angle - 90) * Math.PI) / 180;

    const gradient = ctx.createConicGradient(angleRad, centerX, centerY);

    item.hexColors.forEach((color, index) => {
      const position = index / (item.hexColors.length - 1);
      gradient.addColorStop(position, color);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
  } else {
    const svgString = generateSvgGradient(
      item.hexColors,
      item.style,
      item.angle,
      { seed: item.seed, searchString: "" },
      null,
      { width, height },
    );

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, x, y, width, height);
        img.src = "";
        resolve();
      };
      img.onerror = () => {
        img.src = "";
        reject(new Error(`Failed to load gradient SVG for item ${item.id}`));
      };
      const svgDataUrl = `data:image/svg+xml;base64,${btoa(
        unescape(encodeURIComponent(svgString)),
      )}`;
      img.src = svgDataUrl;
    });
  }
}

export async function generatePNGGridBlob(
  options: PNGGridOptions,
): Promise<Blob> {
  const { exportList, itemWidth, itemHeight, quality = 1 } = options;

  const gapX = 40;
  const gapY = 80;
  const padding = 56;
  const columns = Math.min(exportList.length, 5);
  const rows = Math.ceil(exportList.length / columns);

  const totalWidth = columns * itemWidth + (columns - 1) * gapX + padding * 2;
  const totalHeight = rows * itemHeight + (rows - 1) * gapY + padding * 2;

  const canvas = document.createElement("canvas");
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  ctx.clearRect(0, 0, totalWidth, totalHeight);

  for (let index = 0; index < exportList.length; index++) {
    const item = exportList[index];
    if (!item) continue;

    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = padding + column * (itemWidth + gapX);
    const y = padding + row * (itemHeight + gapY);

    await renderGradientToCanvas(ctx, item, x, y, itemWidth, itemHeight);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to generate PNG grid blob"));
        }
      },
      "image/png",
      quality,
    );
  });
}

export async function downloadPNGGrid(options: PNGGridOptions): Promise<void> {
  try {
    const blob = await generatePNGGridBlob(options);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `grabient-grid-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(`PNG grid download failed: ${error}`);
  }
}

export async function copyPNGGridToClipboard(
  options: PNGGridOptions,
): Promise<void> {
  try {
    const blob = await generatePNGGridBlob(options);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch (error) {
    throw new Error(`PNG grid copy to clipboard failed: ${error}`);
  }
}
