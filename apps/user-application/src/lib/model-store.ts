import { Store } from "@tanstack/react-store";
import { AVAILABLE_MODELS, type ModelKey } from "./model-config";

const STORAGE_KEY = "hidden-models";

// Load hidden models from localStorage
function loadHiddenModels(): Set<ModelKey> {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as ModelKey[];
            return new Set(parsed);
        }
    } catch {}
    return new Set();
}

// Save hidden models to localStorage
function saveHiddenModels(hidden: Set<ModelKey>): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
    } catch {}
}

// Store state interface
interface ModelStoreState {
    hiddenModels: Set<ModelKey>;
}

// Create the store with initial state from localStorage
export const modelStore = new Store<ModelStoreState>({
    hiddenModels: typeof window !== "undefined" ? loadHiddenModels() : new Set(),
});

// Actions
export function hideModel(modelKey: ModelKey): void {
    modelStore.setState((state) => {
        const newHidden = new Set(state.hiddenModels);
        newHidden.add(modelKey);
        saveHiddenModels(newHidden);
        return { ...state, hiddenModels: newHidden };
    });
}

export function showModel(modelKey: ModelKey): void {
    modelStore.setState((state) => {
        const newHidden = new Set(state.hiddenModels);
        newHidden.delete(modelKey);
        saveHiddenModels(newHidden);
        return { ...state, hiddenModels: newHidden };
    });
}

export function showAllModels(): void {
    modelStore.setState((state) => {
        const newHidden = new Set<ModelKey>();
        saveHiddenModels(newHidden);
        return { ...state, hiddenModels: newHidden };
    });
}

// Selectors
export function getVisibleModels(state: ModelStoreState): [ModelKey, typeof AVAILABLE_MODELS[ModelKey]][] {
    return (Object.entries(AVAILABLE_MODELS) as [ModelKey, typeof AVAILABLE_MODELS[ModelKey]][])
        .filter(([key]) => !state.hiddenModels.has(key));
}

export function getHiddenModels(state: ModelStoreState): [ModelKey, typeof AVAILABLE_MODELS[ModelKey]][] {
    return (Object.entries(AVAILABLE_MODELS) as [ModelKey, typeof AVAILABLE_MODELS[ModelKey]][])
        .filter(([key]) => state.hiddenModels.has(key));
}
