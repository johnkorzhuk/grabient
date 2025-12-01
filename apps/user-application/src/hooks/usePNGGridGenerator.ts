import { useState, useCallback } from "react";
import {
  generatePNGGridBlobAsync,
  type PNGGridOptions,
} from "@/lib/generatePNGGridAsync";

interface UsePNGGridGeneratorResult {
  isGenerating: boolean;
  progress: number;
  generatePNG: (options: Omit<PNGGridOptions, "onProgress">) => Promise<Blob>;
}

export function usePNGGridGenerator(): UsePNGGridGeneratorResult {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const generatePNG = useCallback(
    async (options: Omit<PNGGridOptions, "onProgress">): Promise<Blob> => {
      setIsGenerating(true);
      setProgress(0);

      try {
        const blob = await generatePNGGridBlobAsync({
          ...options,
          onProgress: (p) => setProgress(p),
        });
        return blob;
      } finally {
        setIsGenerating(false);
        setProgress(0);
      }
    },
    [],
  );

  return {
    isGenerating,
    progress,
    generatePNG,
  };
}
