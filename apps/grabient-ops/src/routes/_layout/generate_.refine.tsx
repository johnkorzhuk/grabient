import { createFileRoute } from '@tanstack/react-router'
import { usePaginatedQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useRef, useEffect, useState } from 'react'
import { Filter, Loader2 } from 'lucide-react'
import type { Id } from '../../../convex/_generated/dataModel'
import { deserializeCoeffs } from '@repo/data-ops/serialization'
import { analyzeCoefficients, tagsToArray, isValidPaletteColors, type PaletteTags } from '@repo/data-ops/gradient-gen'

export const Route = createFileRoute('/_layout/generate_/refine')({
  component: RefinePage,
})

const ITEMS_PER_PAGE = 50
const PRELOAD_PAGES = 2

type StagedPalette = {
  _id: Id<'staged_palettes'>
  colors: string[]
  themes: string[]
  tag: string
  seed: string
}

function RefinePage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.generate.getStagedPalettes,
    {},
    { initialNumItems: ITEMS_PER_PAGE }
  )

  const [selectedPalette, setSelectedPalette] = useState<StagedPalette | null>(null)
  const [paletteTags, setPaletteTags] = useState<PaletteTags | null>(null)

  const observer = useRef<IntersectionObserver | null>(null)
  const hasPreloaded = useRef(false)

  // Analyze tags when palette is selected
  const handleSelectPalette = (palette: StagedPalette) => {
    setSelectedPalette(palette)
    try {
      const { coeffs } = deserializeCoeffs(palette.seed)
      const tags = analyzeCoefficients(coeffs)
      setPaletteTags(tags)
    } catch {
      setPaletteTags(null)
    }
  }

  // Preload 2 pages after initial load
  useEffect(() => {
    if (status === 'CanLoadMore' && !hasPreloaded.current && results.length === ITEMS_PER_PAGE) {
      hasPreloaded.current = true
      loadMore(ITEMS_PER_PAGE * PRELOAD_PAGES)
    }
  }, [status, results.length, loadMore])

  // Callback ref for the last element - triggers load more when visible
  const lastElementRef = (node: HTMLDivElement | null) => {
    if (status === 'LoadingMore' || status === 'LoadingFirstPage') return
    if (observer.current) observer.current.disconnect()

    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && status === 'CanLoadMore') {
          loadMore(ITEMS_PER_PAGE * PRELOAD_PAGES)
        }
      },
      { threshold: 0.1, rootMargin: '400px' }
    )

    if (node) observer.current.observe(node)
  }

  const isLoading = status === 'LoadingFirstPage'

  // Filter out corrupted palettes (solid black, empty, etc.)
  const validPalettes = results.filter(p => isValidPaletteColors(p.colors))
  const corruptedCount = results.length - validPalettes.length

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Filter className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Refine Palettes</h2>
          </div>
          <div className="text-sm text-muted-foreground">
            {validPalettes.length > 0 && `${validPalettes.length.toLocaleString()} valid`}
            {corruptedCount > 0 && ` • ${corruptedCount} filtered`}
            {status === 'CanLoadMore' && ' • Scroll for more'}
            {status === 'Exhausted' && ' • All loaded'}
          </div>
        </div>
      </div>

      {/* Split Content - 50/50 */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Staged Palettes */}
        <div className="w-1/2 overflow-y-auto p-4 border-r border-border">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading staged palettes...</p>
            </div>
          ) : validPalettes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <p className="text-muted-foreground">No staged palettes found</p>
              <p className="text-sm text-muted-foreground">
                Run the deduplication action to populate this table
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {validPalettes.map((palette, index) => (
                  <div
                    key={palette._id}
                    ref={index === validPalettes.length - 1 ? lastElementRef : null}
                  >
                    <PaletteCard
                      palette={palette}
                      isSelected={selectedPalette?._id === palette._id}
                      onClick={() => handleSelectPalette(palette)}
                    />
                  </div>
                ))}
              </div>

              {status === 'LoadingMore' && (
                <div className="py-8 flex justify-center">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading more...</span>
                  </div>
                </div>
              )}

              {status === 'Exhausted' && (
                <div className="py-8 flex justify-center">
                  <span className="text-sm text-muted-foreground">
                    All {validPalettes.length.toLocaleString()} valid palettes loaded
                    {corruptedCount > 0 && ` (${corruptedCount} corrupted filtered)`}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Panel - Palette Details */}
        <div className="w-1/2 overflow-y-auto p-4 bg-muted/20">
          {selectedPalette && paletteTags ? (
            <div className="space-y-6">
              {/* Large Preview */}
              <div>
                <div
                  className="h-32 w-full rounded-lg"
                  style={{
                    background: `linear-gradient(to right, ${selectedPalette.colors.join(', ')})`,
                  }}
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedPalette.themes[0] || selectedPalette.tag}
                </p>
              </div>

              {/* Tags */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Palette Character
                </h3>
                <div className="space-y-3">
                  {/* Dominant Colors */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Colors</span>
                    <div className="flex gap-1.5">
                      {paletteTags.dominantColors.map((color) => (
                        <span
                          key={color}
                          className="text-xs px-2 py-1 rounded bg-background border border-border"
                        >
                          {color}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Texture */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Texture</span>
                    <span className="text-xs px-2 py-1 rounded bg-background border border-border">
                      {paletteTags.texture}
                    </span>
                  </div>

                  {/* Warmth */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Warmth</span>
                    <span className="text-xs px-2 py-1 rounded bg-background border border-border">
                      {paletteTags.warmth}
                    </span>
                  </div>

                  {/* Journey */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Journey</span>
                    <span className="text-xs px-2 py-1 rounded bg-background border border-border">
                      {paletteTags.journey}
                    </span>
                  </div>

                  {/* Contrast */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Contrast</span>
                    <span className="text-xs px-2 py-1 rounded bg-background border border-border">
                      {paletteTags.contrast}
                    </span>
                  </div>
                </div>
              </div>

              {/* All Tags as Array */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  All Tags
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {tagsToArray(paletteTags).map((tag, i) => (
                    <span
                      key={`${tag}-${i}`}
                      className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Click a palette to view its tags
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PaletteCard({
  palette,
  isSelected,
  onClick,
}: {
  palette: StagedPalette
  isSelected?: boolean
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg overflow-hidden border hover:border-primary/50 hover:shadow-md transition-all cursor-pointer ${
        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
      }`}
    >
      <div
        className="h-20 w-full"
        style={{
          background:
            palette.colors.length > 0
              ? `linear-gradient(to right, ${palette.colors.join(', ')})`
              : '#ccc',
        }}
      />
      <div className="px-2 py-1.5 bg-background">
        <p
          className="text-xs text-foreground font-medium truncate"
          title={palette.themes.join(', ') || palette.tag}
        >
          {palette.themes.length > 0 ? palette.themes[0] : palette.tag}
        </p>
        {palette.themes.length > 1 && (
          <p className="text-[10px] text-muted-foreground">
            +{palette.themes.length - 1} more themes
          </p>
        )}
      </div>
    </div>
  )
}
