import { Store } from "@tanstack/react-store";
import type { ExportItem } from "@/queries/palettes";
import { createExportItemId } from "@/lib/paletteUtils";
import { analytics } from "@/integrations/tracking/events";

export type SizeType = "auto" | [number, number];

interface ExportStore {
    exportList: ExportItem[];
    containerDimensions: { width: number; height: number };
    gap: number;
    borderRadius: number;
    columns: number;
}

export const exportStore = new Store<ExportStore>({
    exportList: [],
    containerDimensions: { width: 800, height: 400 },
    gap: 40,
    borderRadius: 0,
    columns: 5,
});

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

        return { ...state, exportList: newList };
    });
};

export const removeFromExportList = (exportItemId: string) => {
    exportStore.setState((state) => ({
        ...state,
        exportList: state.exportList.filter((item) => item.id !== exportItemId),
    }));
};

export const clearExportList = () => {
    const currentCount = exportStore.state.exportList.length;

    exportStore.setState((state) => ({ ...state, exportList: [] }));

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

export const setContainerDimensions = (dimensions: {
    width: number;
    height: number;
}) => {
    exportStore.setState((state) => ({
        ...state,
        containerDimensions: dimensions,
    }));
};

export const setGap = (gap: number) => {
    exportStore.setState((state) => ({
        ...state,
        gap,
    }));
};

export const setBorderRadius = (borderRadius: number) => {
    exportStore.setState((state) => ({
        ...state,
        borderRadius,
    }));
};

export const setColumns = (columns: number) => {
    exportStore.setState((state) => ({
        ...state,
        columns,
    }));
};
