import { useSearch, useLocation, useRouter } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { exportStore, type SizeType } from "@/stores/export";
import { useDebouncedCallback } from "@mantine/hooks";

export function useDimensions() {
    const router = useRouter();
    const location = useLocation();
    const search = useSearch({ strict: false }) as { size?: SizeType };
    const containerDimensions = useStore(
        exportStore,
        (state) => state.containerDimensions,
    );

    const size = search.size ?? "auto";

    const actualWidth = size === "auto" ? containerDimensions.width : size[0];
    const actualHeight = size === "auto" ? containerDimensions.height : size[1];

    const setSize = (newSize: SizeType) => {
        router.navigate({
            to: location.pathname,
            search: (prev) => ({ ...prev, size: newSize }),
            replace: true,
            resetScroll: false,
        });
    };

    const setSizeDebounced = useDebouncedCallback(setSize, 300);

    return {
        size,
        containerDimensions,
        actualWidth,
        actualHeight,
        setSize,
        setSizeDebounced,
    };
}
