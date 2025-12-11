import { useQuery, useMutation } from "@tanstack/react-query";
import { generatePNGBlob, type PNGGenerationOptions } from "@/lib/generatePNG";

function createCacheKey(options: PNGGenerationOptions): string {
    return JSON.stringify({
        style: options.style,
        angle: options.angle,
        width: options.width,
        height: options.height,
        quality: options.quality,
        seed: options.seed,
        steps: options.steps,
        hexColors: options.hexColors,
    });
}

export function usePNGCache(options: PNGGenerationOptions | null) {
    return useQuery({
        queryKey: options
            ? ["png-blob", createCacheKey(options)]
            : ["png-blob", "disabled"],
        queryFn: () => {
            if (!options) throw new Error("Options required");
            return generatePNGBlob(options);
        },
        enabled: false,
        staleTime: Infinity,
        gcTime: 1000 * 30,
    });
}

export function useCopyPNG() {
    return useMutation({
        mutationFn: async (blob: Blob) => {
            await navigator.clipboard.write([
                new ClipboardItem({ "image/png": blob }),
            ]);
        },
    });
}

export function useDownloadPNG() {
    return useMutation({
        mutationFn: async (blob: Blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `gradient-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },
    });
}
