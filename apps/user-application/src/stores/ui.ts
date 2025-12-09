import { Store } from "@tanstack/react-store";
import type { PALETTE_STYLES } from "@repo/data-ops/valibot-schema/grabient";
import type * as v from "valibot";
import { coeffsSchema } from "@repo/data-ops/valibot-schema/grabient";
import type { SizeType } from "@/stores/export";

type PaletteStyle = (typeof PALETTE_STYLES)[number];
type CosineCoeffs = v.InferOutput<typeof coeffsSchema>;
type Globals = [number, number, number, number];

export interface LivePaletteData {
    coeffs: CosineCoeffs;
    globals: Globals;
}

interface UIState {
    activePaletteSeed: string | null;
    previewStyle: PaletteStyle | null;
    previewAngle: number | null;
    previewSteps: number | null;
    previewSize: SizeType | null;
    isAdvancedOpen: boolean;
    isDragging: boolean;
    customCoeffs: Map<string, CosineCoeffs>;
    livePaletteData: LivePaletteData | null;
    openCopyMenuId: string | null;
    navSelect: string;
    previousRouteHref: string | null;
    showGraph: boolean;
}

export const uiStore = new Store<UIState>({
    activePaletteSeed: null,
    previewStyle: null,
    previewAngle: null,
    previewSteps: null,
    previewSize: null,
    isAdvancedOpen: false,
    isDragging: false,
    customCoeffs: new Map(),
    livePaletteData: null,
    openCopyMenuId: null,
    navSelect: "/",
    previousRouteHref: null,
    showGraph: false,
});

// Action helpers
export const setActivePaletteSeed = (seed: string | null) => {
    uiStore.setState((state) => ({
        ...state,
        activePaletteSeed: seed,
    }));
};

// Backwards compatibility alias
export const setActivePaletteId = setActivePaletteSeed;

export const setPreviewStyle = (style: PaletteStyle | null) => {
    uiStore.setState((state) => ({
        ...state,
        previewStyle: style,
    }));
};

export const setPreviewAngle = (angle: number | null) => {
    uiStore.setState((state) => ({
        ...state,
        previewAngle: angle,
    }));
};

export const setPreviewSteps = (steps: number | null) => {
    uiStore.setState((state) => ({
        ...state,
        previewSteps: steps,
    }));
};

export const setPreviewSize = (size: SizeType | null) => {
    uiStore.setState((state) => ({
        ...state,
        previewSize: size,
    }));
};

export const setIsAdvancedOpen = (isOpen: boolean) => {
    uiStore.setState((state) => ({
        ...state,
        isAdvancedOpen: isOpen,
    }));
};

export const toggleIsAdvancedOpen = () => {
    uiStore.setState((state) => ({
        ...state,
        isAdvancedOpen: !state.isAdvancedOpen,
    }));
};

export const setIsDragging = (isDragging: boolean) => {
    uiStore.setState((state) => ({
        ...state,
        isDragging,
    }));
};

export const setCustomCoeffs = (seed: string, coeffs: CosineCoeffs) => {
    uiStore.setState((state) => {
        const newCustomCoeffs = new Map(state.customCoeffs);
        newCustomCoeffs.set(seed, coeffs);
        return {
            ...state,
            customCoeffs: newCustomCoeffs,
        };
    });
};

export const clearCustomCoeffs = (seed: string) => {
    uiStore.setState((state) => {
        const newCustomCoeffs = new Map(state.customCoeffs);
        newCustomCoeffs.delete(seed);
        return {
            ...state,
            customCoeffs: newCustomCoeffs,
        };
    });
};

export const setOpenCopyMenuId = (id: string | null) => {
    uiStore.setState((state) => ({
        ...state,
        openCopyMenuId: id,
    }));
};

export const setNavSelect = (path: string) => {
    uiStore.setState((state) => ({
        ...state,
        navSelect: path,
    }));
};

export const setPreviousRouteHref = (href: string) => {
    uiStore.setState((state) => ({
        ...state,
        previousRouteHref: href,
    }));
};

export const setLivePaletteData = (data: LivePaletteData | null) => {
    uiStore.setState((state) => ({
        ...state,
        livePaletteData: data,
    }));
};

export const setShowGraph = (show: boolean) => {
    uiStore.setState((state) => ({
        ...state,
        showGraph: show,
    }));
};

export const toggleShowGraph = () => {
    uiStore.setState((state) => ({
        ...state,
        showGraph: !state.showGraph,
    }));
};

export const resetUIState = () => {
    uiStore.setState({
        activePaletteSeed: null,
        previewStyle: null,
        previewAngle: null,
        previewSteps: null,
        previewSize: null,
        isAdvancedOpen: false,
        isDragging: false,
        customCoeffs: new Map(),
        livePaletteData: null,
        openCopyMenuId: null,
        navSelect: "/",
        previousRouteHref: null,
        showGraph: false,
    });
};

export const resetPreviewState = () => {
    uiStore.setState((state) => ({
        ...state,
        previewStyle: null,
        previewAngle: null,
        previewSteps: null,
        previewSize: null,
    }));
};
