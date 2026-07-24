import { PALETTE_STYLES } from "@repo/data-ops/valibot-schema/grabient";
import type { ExportItemData } from "../palette";

export const EXPORT_LIST_KEY = "export-list";
export const EXPORT_LIST_VERSION = 1;
export const MAX_EXPORT_ITEMS = 50;

function validItem(value: unknown): value is ExportItemData {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.seed === "string" &&
    typeof item.style === "string" &&
    (PALETTE_STYLES as readonly string[]).includes(item.style) &&
    typeof item.steps === "number" &&
    Number.isFinite(item.steps) &&
    typeof item.angle === "number" &&
    Number.isFinite(item.angle) &&
    Array.isArray(item.coeffs) &&
    item.coeffs.length === 4 &&
    Array.isArray(item.globals) &&
    item.globals.length === 4 &&
    Array.isArray(item.hexColors) &&
    item.hexColors.every((hex) => typeof hex === "string")
  );
}

export function readExportList(): ExportItemData[] {
  try {
    const raw = localStorage.getItem(EXPORT_LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: unknown; items?: unknown };
    if (
      !parsed ||
      parsed.version !== EXPORT_LIST_VERSION ||
      !Array.isArray(parsed.items)
    ) {
      localStorage.removeItem(EXPORT_LIST_KEY);
      return [];
    }
    return parsed.items.filter(validItem).slice(0, MAX_EXPORT_ITEMS);
  } catch {
    return [];
  }
}

export function writeExportList(items: ExportItemData[]): void {
  try {
    localStorage.setItem(
      EXPORT_LIST_KEY,
      JSON.stringify({
        version: EXPORT_LIST_VERSION,
        items: items.slice(0, MAX_EXPORT_ITEMS),
      }),
    );
  } catch {}
}

export function toggleExportItem(
  item: ExportItemData,
  current = readExportList(),
): { items: ExportItemData[]; selected: boolean; dropped: boolean } {
  const index = current.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    const items = current.filter((_, itemIndex) => itemIndex !== index);
    writeExportList(items);
    return { items, selected: false, dropped: false };
  }
  const items = [...current, item];
  const dropped = items.length > MAX_EXPORT_ITEMS;
  if (dropped) items.shift();
  writeExportList(items);
  return { items, selected: true, dropped };
}
