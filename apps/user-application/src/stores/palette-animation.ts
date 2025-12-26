import { Store } from "@tanstack/react-store";

interface PaletteAnimationState {
    currentIndex: number;
    normalizedColors: string[];
}

export const paletteAnimationStore = new Store<PaletteAnimationState>({
    currentIndex: 0,
    normalizedColors: [],
});

export function updatePaletteAnimation(index: number, colors: string[]) {
    paletteAnimationStore.setState(() => ({
        currentIndex: index,
        normalizedColors: colors,
    }));
}
