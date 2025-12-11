import { useQuery, useMutation } from '@tanstack/react-query'
import { generatePNGGridBlobAsync, type PNGGridOptions } from '@/lib/generatePNGGridAsync'

function createGridCacheKey(options: Omit<PNGGridOptions, 'onProgress'>): string {
  return JSON.stringify({
    exportList: options.exportList.map(item => ({
      seed: item.seed,
      style: item.style,
      angle: item.angle,
      steps: item.steps,
    })),
    itemWidth: options.itemWidth,
    itemHeight: options.itemHeight,
    quality: options.quality,
  })
}

export function usePNGGridCache(
  options: Omit<PNGGridOptions, 'onProgress'> | null,
  onProgress?: (progress: number) => void,
) {
  return useQuery({
    queryKey: options ? ['png-grid-blob', createGridCacheKey(options)] : ['png-grid-blob', 'disabled'],
    queryFn: () => {
      if (!options) throw new Error('Options required')
      return generatePNGGridBlobAsync({
        ...options,
        onProgress,
      })
    },
    enabled: false,
    staleTime: Infinity,
    gcTime: 1000 * 30,
  })
}

export function useCopyPNGGrid() {
  return useMutation({
    mutationFn: async (blob: Blob) => {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
    },
  })
}

export function useDownloadPNGGrid() {
  return useMutation({
    mutationFn: async (blob: Blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `grabient-grid-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    },
  })
}
