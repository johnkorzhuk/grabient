/**
 * Shared preview-strip builder: fetches true site renders from the public
 * /api/png endpoint (style/steps/angle honored, no logo) and composites them
 * into labeled 8-row strips for visual review by judge/audit/caption
 * sessions. Falls back to a locally rendered dense linear gradient when the
 * fetch fails, so strips always exist.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { cosineGradient, rgbToHex } from "@repo/data-ops/gradient-gen";
import { toCosineCoeffs } from "../src/lib/features";

// Public endpoint, no secret; env override for staging/local testing.
const PNG_BASE = process.env.PNG_BASE_URL || "https://grabient.com";

export const ROW_H = 96;
export const ROW_W = 960;
export const LABEL_W = 40;
export const PER_IMAGE = 8;
const PANEL_W = ROW_W - LABEL_W - 4;
const PANEL_H = ROW_H - 8;
const FETCH_TIMEOUT_MS = 15000;

export interface StripRow {
  seed: string;
  style?: string | null;
  steps?: number | null;
  angle?: number | null;
  coeffs?: number[];
  hexStops?: string[];
}

async function fetchSitePng(row: StripRow): Promise<Buffer | null> {
  const params = new URLSearchParams({ seed: row.seed });
  if (row.style) params.set("style", row.style);
  if (row.steps != null) params.set("steps", String(row.steps));
  if (row.angle != null) params.set("angle", String(row.angle));
  params.set("w", String(PANEL_W));
  params.set("h", String(PANEL_H));
  try {
    const res = await fetch(`${PNG_BASE}/api/png?${params}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function fallbackStops(row: StripRow): string[] | null {
  if (row.coeffs && row.coeffs.length === 12) {
    try {
      return cosineGradient(48, toCosineCoeffs(row.coeffs)).map(([r, g, b]) =>
        rgbToHex(r, g, b),
      );
    } catch {
      /* fall through */
    }
  }
  return row.hexStops && row.hexStops.length > 0 ? row.hexStops : null;
}

async function fallbackPng(row: StripRow): Promise<Buffer> {
  const stops = fallbackStops(row) ?? ["#333333", "#666666"];
  const stopsSvg = stops
    .map(
      (hex, i) =>
        `<stop offset="${((i / Math.max(1, stops.length - 1)) * 100).toFixed(1)}%" stop-color="${hex}"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_W}" height="${PANEL_H}">
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">${stopsSvg}</linearGradient>
    <rect width="${PANEL_W}" height="${PANEL_H}" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Composites rows into <outDir>/<n>.png, PER_IMAGE rows per file, each row
 *  index-labeled. Returns how many rows used the site render. */
export async function buildStrips(
  rows: StripRow[],
  outDir: string,
): Promise<{ siteRendered: number }> {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const panels = await Promise.all(
    rows.map(async (row) => {
      const site = await fetchSitePng(row);
      return { buf: site ?? (await fallbackPng(row)), site: site !== null };
    }),
  );

  for (let i = 0; i < rows.length; i += PER_IMAGE) {
    const chunk = panels.slice(i, i + PER_IMAGE);
    const height = chunk.length * ROW_H;
    const labelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ROW_W}" height="${height}">
      <rect width="${ROW_W}" height="${height}" fill="#111"/>
      ${chunk
        .map(
          (_, j) =>
            `<text x="${LABEL_W / 2}" y="${j * ROW_H + ROW_H / 2 + 6}" font-family="monospace" font-size="18" fill="#fff" text-anchor="middle">${i + j}</text>`,
        )
        .join("\n")}
    </svg>`;
    const composites = await Promise.all(
      chunk.map(async (p, j) => ({
        input: await sharp(p.buf)
          .resize(PANEL_W, PANEL_H, { fit: "fill" })
          .png()
          .toBuffer(),
        left: LABEL_W,
        top: j * ROW_H + 4,
      })),
    );
    await sharp(Buffer.from(labelSvg))
      .composite(composites)
      .png()
      .toFile(join(outDir, `${Math.floor(i / PER_IMAGE)}.png`));
  }

  return { siteRendered: panels.filter((p) => p.site).length };
}

export function writeQueue(outDir: string, queue: unknown): void {
  writeFileSync(join(outDir, "queue.json"), JSON.stringify(queue, null, 2));
}
