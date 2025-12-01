import { Store } from "@tanstack/react-store";
import type { AppPalette } from "@/queries/palettes";

interface UndoAction {
    seed: string;
    steps: number;
    style: string;
    angle: number;
    timestamp: number;
    palette: AppPalette;
}

interface UndoState {
    undoHistory: UndoAction[];
}

export const undoStore = new Store<UndoState>({
    undoHistory: [],
});

export function addUndoAction(action: Omit<UndoAction, "timestamp">) {
    undoStore.setState((state) => ({
        ...state,
        undoHistory: [
            ...state.undoHistory,
            { ...action, timestamp: Date.now() }
        ],
    }));
}

export function popUndoAction(): UndoAction | null {
    const state = undoStore.state;
    if (state.undoHistory.length === 0) return null;

    const lastAction = state.undoHistory[state.undoHistory.length - 1];
    if (!lastAction) return null;

    undoStore.setState({
        ...state,
        undoHistory: state.undoHistory.slice(0, -1),
    });

    return lastAction;
}

export function clearUndoHistory() {
    undoStore.setState((state) => ({
        ...state,
        undoHistory: [],
    }));
}

export function removeExpiredActions() {
    const now = Date.now();
    const TEN_SECONDS = 10000;

    undoStore.setState((state) => ({
        ...state,
        undoHistory: state.undoHistory.filter(
            action => now - action.timestamp < TEN_SECONDS
        ),
    }));
}
