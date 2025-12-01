import { useHotkeys } from "@mantine/hooks";
import { useTheme } from "@/components/theme/theme-provider";

export function useThemeToggle() {
    const { toggle } = useTheme();

    useHotkeys([
        [
            "mod+k",
            () => {
                toggle();
            },
        ],
    ]);
}
