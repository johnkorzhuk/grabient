import type { PaletteStyle } from "@repo/data-ops/valibot-schema/grabient";
import { cssSnippet, renderPalette, svgSnippet, type RenderedPalette } from "../palette";

const WIDTH = 800;
const HEIGHT = 400;
const CHECK =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const timers = new WeakMap<HTMLElement, number>();

function announce(message: string): void {
  const live = document.getElementById("live");
  if (!live) return;
  live.textContent = "";
  live.textContent = message;
}

function flashCopied(trigger: HTMLElement): void {
  if (!trigger.hasAttribute("data-copy-markup"))
    trigger.setAttribute("data-copy-markup", trigger.innerHTML);
  trigger.innerHTML = CHECK;
  clearTimeout(timers.get(trigger));
  timers.set(
    trigger,
    window.setTimeout(() => {
      trigger.innerHTML = trigger.getAttribute("data-copy-markup") ?? "";
    }, 1200),
  );
}

function addStops(
  gradient: CanvasGradient,
  colors: string[],
  swatches: boolean,
): void {
  if (swatches) {
    colors.forEach((color, index) => {
      gradient.addColorStop(index / colors.length, color);
      gradient.addColorStop((index + 1) / colors.length, color);
    });
  } else if (colors.length === 1) {
    gradient.addColorStop(0, colors[0]!);
  } else {
    colors.forEach((color, index) =>
      gradient.addColorStop(index / (colors.length - 1), color),
    );
  }
}

function pngBlob(palette: RenderedPalette): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas unavailable"));
      return;
    }

    let gradient: CanvasGradient;
    if (palette.style.startsWith("angular")) {
      if (typeof ctx.createConicGradient !== "function") {
        reject(new Error("Conic gradients unavailable"));
        return;
      }
      gradient = ctx.createConicGradient(
        ((palette.angle - 90) * Math.PI) / 180,
        WIDTH / 2,
        HEIGHT / 2,
      );
    } else if (palette.style.startsWith("radial")) {
      gradient = ctx.createRadialGradient(
        WIDTH / 2,
        HEIGHT / 2,
        0,
        WIDTH / 2,
        HEIGHT / 2,
        Math.hypot(WIDTH, HEIGHT) / 2,
      );
    } else {
      const radians = (palette.angle * Math.PI) / 180;
      const dx = Math.sin(radians);
      const dy = -Math.cos(radians);
      const length = Math.abs(WIDTH * dx) + Math.abs(HEIGHT * dy) || 1;
      gradient = ctx.createLinearGradient(
        WIDTH / 2 - (dx * length) / 2,
        HEIGHT / 2 - (dy * length) / 2,
        WIDTH / 2 + (dx * length) / 2,
        HEIGHT / 2 + (dy * length) / 2,
      );
    }

    addStops(gradient, palette.hexColors, palette.style.endsWith("Swatches"));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))),
      "image/png",
    );
  });
}

function paletteFor(trigger: HTMLElement): RenderedPalette | null {
  const card = trigger.closest<HTMLElement>("[data-palette-card]");
  const seed = card?.dataset.paletteSeed;
  const style = card?.dataset.paletteStyle as PaletteStyle | undefined;
  const steps = Number(card?.dataset.paletteSteps);
  const angle = Number(card?.dataset.paletteAngle);
  if (!card || !seed || !style || !Number.isFinite(steps) || !Number.isFinite(angle))
    return null;
  return renderPalette(seed, style, steps, angle);
}

export async function copyPaletteCard(trigger: HTMLElement): Promise<void> {
  if (trigger.dataset.copying === "true") return;
  const kind = trigger.dataset.paletteCopy;
  const palette = paletteFor(trigger);
  if (!palette || !kind) {
    announce("Could not prepare this gradient");
    return;
  }

  trigger.dataset.copying = "true";
  try {
    if (kind === "css") {
      await navigator.clipboard.writeText(cssSnippet(palette, ""));
    } else if (kind === "svg") {
      await navigator.clipboard.writeText(svgSnippet(palette, "", [WIDTH, HEIGHT]));
    } else if (kind === "png") {
      if (!navigator.clipboard.write || typeof ClipboardItem === "undefined")
        throw new Error("Image clipboard unavailable");
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob(palette) }),
      ]);
    } else {
      return;
    }
    flashCopied(trigger);
    announce(`${kind.toUpperCase()} copied to clipboard`);
  } catch {
    announce(`Could not copy ${kind.toUpperCase()} — clipboard unavailable`);
  } finally {
    delete trigger.dataset.copying;
  }
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadPaletteCard(
  trigger: HTMLElement,
  kind: "svg" | "png",
): Promise<void> {
  if (trigger.dataset.downloading === "true") return;
  const palette = paletteFor(trigger);
  if (!palette) {
    announce("Could not prepare this gradient");
    return;
  }
  trigger.dataset.downloading = "true";
  try {
    const name = `grabient-${palette.seed.slice(0, 16)}.${kind}`;
    if (kind === "svg") {
      downloadBlob(
        new Blob([svgSnippet(palette, "", [WIDTH, HEIGHT])], {
          type: "image/svg+xml;charset=utf-8",
        }),
        name,
      );
    } else {
      downloadBlob(await pngBlob(palette), name);
    }
    announce(`${kind.toUpperCase()} download started`);
  } catch {
    announce(`Could not download ${kind.toUpperCase()}`);
  } finally {
    delete trigger.dataset.downloading;
  }
}
