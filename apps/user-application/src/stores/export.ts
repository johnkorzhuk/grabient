import { Store } from "@tanstack/react-store";
import * as v from "valibot";
import type { ExportItem } from "@/queries/palettes";
import { createExportItemId } from "@/lib/paletteUtils";
import { analytics } from "@/integrations/tracking/events";
import {
    coeffsSchema,
    globalsSchema,
    paletteStyleValidator,
    stepsValidator,
    angleValidator,
} from "@repo/data-ops/valibot-schema/grabient";

export type SizeType = "auto" | [number, number];

const EXPORT_OPTIONS_STORAGE_KEY = "export-options";
const EXPORT_LIST_STORAGE_KEY = "export-list";
const EXPORT_OPTIONS_VERSION = 1;
const EXPORT_LIST_VERSION = 1;

const exportOptionsSchema = v.object({
    version: v.number(),
    containerDimensions: v.object({
        width: v.pipe(v.number(), v.minValue(1), v.maxValue(6000)),
        height: v.pipe(v.number(), v.minValue(1), v.maxValue(6000)),
    }),
    gap: v.pipe(v.number(), v.minValue(0), v.maxValue(200)),
    borderRadius: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
    columns: v.pipe(v.number(), v.minValue(1), v.maxValue(10)),
});

const exportItemSchema = v.object({
    id: v.string(),
    coeffs: coeffsSchema,
    globals: globalsSchema,
    style: paletteStyleValidator,
    steps: stepsValidator,
    angle: angleValidator,
    seed: v.string(),
    hexColors: v.array(v.string()),
});

const exportListSchema = v.object({
    version: v.number(),
    items: v.array(exportItemSchema),
});

type ExportOptions = v.InferOutput<typeof exportOptionsSchema>;

interface ExportStore {
    exportList: ExportItem[];
    containerDimensions: { width: number; height: number };
    gap: number;
    borderRadius: number;
    columns: number;
}

const defaultExportOptions: ExportOptions = {
    version: EXPORT_OPTIONS_VERSION,
    containerDimensions: { width: 800, height: 400 },
    gap: 40,
    borderRadius: 0,
    columns: 5,
};

function loadExportOptionsFromStorage(): ExportOptions {
    if (typeof window === "undefined") {
        return defaultExportOptions;
    }

    try {
        const stored = localStorage.getItem(EXPORT_OPTIONS_STORAGE_KEY);
        if (!stored) {
            return defaultExportOptions;
        }

        const parsed = JSON.parse(stored);
        const result = v.safeParse(exportOptionsSchema, parsed);

        if (!result.success) {
            console.warn(
                "Invalid export options in localStorage, resetting:",
                result.issues,
            );
            localStorage.removeItem(EXPORT_OPTIONS_STORAGE_KEY);
            return defaultExportOptions;
        }

        if (result.output.version !== EXPORT_OPTIONS_VERSION) {
            console.info("Export options version mismatch, resetting");
            localStorage.removeItem(EXPORT_OPTIONS_STORAGE_KEY);
            return defaultExportOptions;
        }

        return result.output;
    } catch (error) {
        console.error("Failed to load export options:", error);
        return defaultExportOptions;
    }
}

function saveExportOptionsToStorage(options: Omit<ExportOptions, "version">): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        const toSave: ExportOptions = {
            version: EXPORT_OPTIONS_VERSION,
            ...options,
        };
        localStorage.setItem(EXPORT_OPTIONS_STORAGE_KEY, JSON.stringify(toSave));
    } catch (error) {
        console.error("Failed to save export options:", error);
    }
}

function loadExportListFromStorage(): ExportItem[] {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        const stored = localStorage.getItem(EXPORT_LIST_STORAGE_KEY);
        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);
        const result = v.safeParse(exportListSchema, parsed);

        if (!result.success) {
            console.warn(
                "Invalid export list in localStorage, resetting:",
                result.issues,
            );
            localStorage.removeItem(EXPORT_LIST_STORAGE_KEY);
            return [];
        }

        if (result.output.version !== EXPORT_LIST_VERSION) {
            console.info("Export list version mismatch, resetting");
            localStorage.removeItem(EXPORT_LIST_STORAGE_KEY);
            return [];
        }

        return result.output.items;
    } catch (error) {
        console.error("Failed to load export list:", error);
        return [];
    }
}

function saveExportListToStorage(items: ExportItem[]): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        const toSave = {
            version: EXPORT_LIST_VERSION,
            items,
        };
        localStorage.setItem(EXPORT_LIST_STORAGE_KEY, JSON.stringify(toSave));
    } catch (error) {
        console.error("Failed to save export list:", error);
    }
}

const defaultExportState: ExportStore = {
    exportList: [],
    containerDimensions: defaultExportOptions.containerDimensions,
    gap: defaultExportOptions.gap,
    borderRadius: defaultExportOptions.borderRadius,
    columns: defaultExportOptions.columns,
};

export const exportStore = new Store<ExportStore>(defaultExportState);

let hasHydrated = false;

export function hydrateExportStore(): void {
    if (hasHydrated) return;
    hasHydrated = true;

    const options = loadExportOptionsFromStorage();
    const exportList = loadExportListFromStorage();

    exportStore.setState(() => ({
        exportList,
        containerDimensions: options.containerDimensions,
        gap: options.gap,
        borderRadius: options.borderRadius,
        columns: options.columns,
    }));
}

const MAX_EXPORT_ITEMS = 50;

export const addToExportList = (exportItem: ExportItem) => {
    if (!exportItem || !exportItem.id) {
        console.warn("Attempted to add invalid export item:", exportItem);
        return;
    }

    exportStore.setState((state) => {
        if (state.exportList.some((item) => item.id === exportItem.id))
            return state;

        const newList = [...state.exportList, exportItem];
        if (newList.length > MAX_EXPORT_ITEMS) {
            newList.shift();
        }

        analytics.exportList.add({
            seed: exportItem.seed,
            style: exportItem.style,
            angle: exportItem.angle,
            steps: exportItem.steps,
            newExportCount: newList.length,
        });

        saveExportListToStorage(newList);
        return { ...state, exportList: newList };
    });
};

export const removeFromExportList = (exportItemId: string) => {
    exportStore.setState((state) => {
        const newList = state.exportList.filter((item) => item.id !== exportItemId);
        saveExportListToStorage(newList);
        return { ...state, exportList: newList };
    });
};

export const clearExportList = () => {
    const currentCount = exportStore.state.exportList.length;

    exportStore.setState((state) => ({ ...state, exportList: [] }));
    saveExportListToStorage([]);

    analytics.exportList.clear({
        exportCount: currentCount,
    });
};

export const isInExportList = (exportItemId: string): boolean => {
    return exportStore.state.exportList.some(
        (item) => item.id === exportItemId,
    );
};

export const checkExportItemInList = (
    data: Omit<ExportItem, "id" | "hexColors">,
): boolean => {
    const id = createExportItemId(data);
    return exportStore.state.exportList.some((item) => item.id === id);
};

function persistOptions(): void {
    const { containerDimensions, gap, borderRadius, columns } = exportStore.state;
    saveExportOptionsToStorage({ containerDimensions, gap, borderRadius, columns });
}

export const setContainerDimensions = (dimensions: {
    width: number;
    height: number;
}) => {
    exportStore.setState((state) => ({
        ...state,
        containerDimensions: dimensions,
    }));
    persistOptions();
};

export const setGap = (gap: number) => {
    exportStore.setState((state) => ({
        ...state,
        gap,
    }));
    persistOptions();
};

export const setBorderRadius = (borderRadius: number) => {
    exportStore.setState((state) => ({
        ...state,
        borderRadius,
    }));
    persistOptions();
};

export const setColumns = (columns: number) => {
    exportStore.setState((state) => ({
        ...state,
        columns,
    }));
    persistOptions();
};

export function getUniqueSeedsFromExportList(exportList: ExportItem[]): string[] {
    const seen = new Set<string>();
    const uniqueSeeds: string[] = [];
    for (const item of exportList) {
        if (!seen.has(item.seed)) {
            seen.add(item.seed);
            uniqueSeeds.push(item.seed);
        }
    }
    return uniqueSeeds;
}
