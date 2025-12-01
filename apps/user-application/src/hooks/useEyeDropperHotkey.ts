import { useHotkeys, useEyeDropper, useClipboard } from "@mantine/hooks";
import { analytics } from "@/integrations/tracking/events";

export function useEyeDropperHotkey(onColorSelect?: (color: string) => void) {
    const { supported, open } = useEyeDropper();
    const clipboard = useClipboard({ timeout: 1000 });

    useHotkeys([
        [
            "mod+e",
            async () => {
                if (!supported) return;
                try {
                    const result = await open();
                    if (result) {
                        clipboard.copy(result.sRGBHex);
                        analytics.eyedropper.selectColor({ color: result.sRGBHex });
                        if (onColorSelect) {
                            onColorSelect(result.sRGBHex);
                        }
                    }
                } catch (error) {
                    // User cancelled or error occurred
                }
            },
        ],
    ]);
}
