import { createFileRoute } from '@tanstack/react-router'
import { usePaginatedQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useRef, useEffect, useState } from 'react'
import { Filter, Loader2, Sliders } from 'lucide-react'
import type { Id } from '../../../convex/_generated/dataModel'
import { deserializeCoeffs } from '@repo/data-ops/serialization'
import { analyzeCoefficients, tagsToArray, isValidPaletteColors, generatePaletteEmojis, type PaletteTags } from '@repo/data-ops/gradient-gen'
import {
  computeLabSamples,
  comparePalettes,
  type PaletteForDedup,
} from '@repo/data-ops/similarity'

export const Route = createFileRoute('/_layout/generate_/refine')({
  component: RefinePage,
})

const ITEMS_PER_PAGE = 2500
const PRELOAD_PAGES = 1

type GeneratedPalette = {
  _id: Id<'generated_palettes'>
  colors: string[]
  theme?: string
  tag: string
  seed?: string
}

type PaletteWithData = GeneratedPalette & PaletteForDedup & {
  themes: string[]
}
type PaletteWithDupes = PaletteWithData & {
  duplicates: Array<PaletteWithData & { distance: number; reversed: boolean }>
}

function deduplicatePalettes(
  palettes: PaletteWithData[],
  threshold: number
): { unique: PaletteWithDupes[]; duplicateCount: number } {
  const unique: PaletteWithDupes[] = []
  let duplicateCount = 0

  for (const palette of palettes) {
    let matchIndex = -1
    let matchDistance = Infinity
    let matchReversed = false

    for (let i = 0; i < unique.length; i++) {
      const { distance, reversed } = comparePalettes(
        palette.labSamples,
        unique[i].labSamples,
        unique[i].labSamplesReversed
      )
      if (distance < threshold) {
        if (distance < matchDistance) {
          matchIndex = i
          matchDistance = distance
          matchReversed = reversed
        }
        break
      }
    }

    if (matchIndex >= 0) {
      const existing = unique[matchIndex]
      if (palette.theme && !existing.themes.includes(palette.theme)) {
        existing.themes = [...existing.themes, palette.theme]
      }
      existing.duplicates.push({ ...palette, distance: matchDistance, reversed: matchReversed })
      duplicateCount++
    } else {
      unique.push({
        ...palette,
        themes: palette.theme ? [palette.theme] : [],
        duplicates: []
      })
    }
  }

  return { unique, duplicateCount }
}

function RefinePage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.generate.getGeneratedPalettesPaginated,
    {},
    { initialNumItems: ITEMS_PER_PAGE }
  )

  const [selectedPalette, setSelectedPalette] = useState<PaletteWithDupes | null>(null)
  const [paletteTags, setPaletteTags] = useState<PaletteTags | null>(null)
  // Default threshold: average deltaE of 8 (very similar colors)
  // deltaE < 2.3: imperceptible, 2.3-5: noticeable, 5-10: obvious, 10+: different
  const [similarityThreshold, setSimilarityThreshold] = useState(8)
  const [enableDedup, setEnableDedup] = useState(true)
  const [sortByDupes, setSortByDupes] = useState(false)

  const observer = useRef<IntersectionObserver | null>(null)
  const hasPreloaded = useRef(false)

  // Analyze tags when palette is selected
  const handleSelectPalette = (palette: PaletteWithDupes) => {
    setSelectedPalette(palette)
    if (!palette.seed) {
      setPaletteTags(null)
      return
    }
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

  // Filter out corrupted palettes and pre-compute LAB samples for fast comparison
  const validPalettes: PaletteWithData[] = []
  let corruptedCount = 0
  let noSeedCount = 0

  for (const p of results) {
    // Skip palettes with no colors or invalid colors
    if (!p.colors || p.colors.length === 0 || !isValidPaletteColors(p.colors)) {
      corruptedCount++
      continue
    }
    // Track palettes without seeds (still valid for color comparison)
    if (!p.seed) {
      noSeedCount++
    }
    // Pre-compute normalized LAB samples (and reversed) for O(1) comparison
    const labSamples = computeLabSamples(p.colors)
    validPalettes.push({
      ...p,
      labSamples,
      labSamplesReversed: [...labSamples].reverse(),
      themes: p.theme ? [p.theme] : [],
    })
  }

  // Apply deduplication if enabled
  const { unique: dedupedPalettes, duplicateCount } = enableDedup
    ? deduplicatePalettes(validPalettes, similarityThreshold)
    : { unique: validPalettes.map(p => ({ ...p, duplicates: [] })), duplicateCount: 0 }

  // Sort by duplicate count if enabled
  const displayPalettes = sortByDupes
    ? [...dedupedPalettes].sort((a, b) => b.duplicates.length - a.duplicates.length)
    : dedupedPalettes

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
            {displayPalettes.length > 0 && `${displayPalettes.length.toLocaleString()} shown`}
            {enableDedup && duplicateCount > 0 && ` • ${duplicateCount} dupes removed`}
            {corruptedCount > 0 && ` • ${corruptedCount} corrupted`}
            {status === 'CanLoadMore' && ' • Scroll for more'}
            {status === 'Exhausted' && ' • All loaded'}
          </div>
        </div>

        {/* Dedup Controls */}
        <div className="mt-3 flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enableDedup}
              onChange={(e) => setEnableDedup(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-muted-foreground">Enable deduplication</span>
          </label>

          {enableDedup && (
            <>
              <div className="flex items-center gap-3">
                <Sliders className="h-4 w-4 text-muted-foreground" />
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">ΔE Threshold:</span>
                  <input
                    type="range"
                    min="2"
                    max="25"
                    step="1"
                    value={similarityThreshold}
                    onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                    className="w-32"
                  />
                  <input
                    type="number"
                    min="1"
                    max="50"
                    step="1"
                    value={similarityThreshold}
                    onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value) || 8)}
                    className="w-16 px-2 py-1 text-xs rounded border border-border bg-background"
                  />
                </label>
                <span className="text-xs text-muted-foreground">
                  (higher = more aggressive dedup)
                </span>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sortByDupes}
                  onChange={(e) => setSortByDupes(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-muted-foreground">Sort by most dupes</span>
              </label>
            </>
          )}
        </div>

        {/* Stats */}
        {enableDedup && validPalettes.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            {validPalettes.length} valid → {dedupedPalettes.length} unique ({Math.round((1 - dedupedPalettes.length / validPalettes.length) * 100)}% reduction)
            {noSeedCount > 0 && ` • ${noSeedCount} missing seeds`}
          </div>
        )}
      </div>

      {/* Split Content - 50/50 */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Generated Palettes */}
        <div className="w-1/2 overflow-y-auto p-4 border-r border-border">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading generated palettes...</p>
            </div>
          ) : displayPalettes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <p className="text-muted-foreground">No generated palettes found</p>
              <p className="text-sm text-muted-foreground">
                Run the generation pipeline to create palettes
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {displayPalettes.map((palette, index) => (
                  <div
                    key={palette._id}
                    ref={index === displayPalettes.length - 1 ? lastElementRef : null}
                  >
                    <PaletteCard
                      palette={palette}
                      isSelected={selectedPalette?._id === palette._id}
                      onClick={() => handleSelectPalette(palette)}
                      showDupeCount={enableDedup}
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
                    All {displayPalettes.length.toLocaleString()} unique palettes shown
                    {enableDedup && ` (${duplicateCount} duplicates removed)`}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Panel - Palette Details */}
        <div className="w-1/2 overflow-y-auto p-4 bg-muted/20">
          {selectedPalette ? (
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
                {selectedPalette.seed && (
                  <p className="mt-1 text-[10px] text-muted-foreground font-mono truncate">
                    seed: {selectedPalette.seed}
                  </p>
                )}
              </div>

              {/* Tags (only if seed exists and was parsed) */}
              {paletteTags && (
                <>
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      Palette Character
                    </h3>
                    <div className="space-y-3">
                      {/* Vibe Emojis */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16">Vibe</span>
                        <div className="flex gap-1 px-3 py-1.5 rounded bg-background border border-border">
                          {generatePaletteEmojis(paletteTags).map((emoji, i) => (
                            <span key={i} className="text-base">{emoji}</span>
                          ))}
                        </div>
                      </div>

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

                  {/* Embed Text Preview */}
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      Embed Text (Vectorize Input)
                    </h3>
                    {(() => {
                      const emojis = generatePaletteEmojis(paletteTags)
                      const tags = tagsToArray(paletteTags)
                      const themes = selectedPalette.themes
                      // Dedupe all tokens (emojis are unique, but tags/themes may overlap)
                      const allTokens = [...emojis, ...tags, ...themes]
                      const uniqueTokens = [...new Set(allTokens)]
                      return (
                        <>
                          <div className="p-3 rounded-lg bg-background border border-border font-mono text-xs text-foreground/80 whitespace-pre-wrap break-words">
                            {uniqueTokens.join(' ')}
                          </div>
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            {uniqueTokens.length} tokens ({allTokens.length - uniqueTokens.length} dupes removed)
                          </p>
                        </>
                      )
                    })()}
                  </div>
                </>
              )}

              {/* Duplicates */}
              {selectedPalette.duplicates.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Duplicates Merged ({selectedPalette.duplicates.length})
                  </h3>
                  <div className="space-y-2">
                    {/* Show the original/kept palette first */}
                    <div className="p-2 rounded border border-primary bg-primary/5">
                      <div
                        className="h-12 w-full rounded"
                        style={{
                          background: `linear-gradient(to right, ${selectedPalette.colors.join(', ')})`,
                        }}
                      />
                      <p className="mt-1 text-[10px] text-primary font-medium">
                        ✓ Kept (original)
                      </p>
                    </div>
                    {/* Show all merged duplicates */}
                    {selectedPalette.duplicates.map((dupe, i) => (
                      <div key={dupe._id} className="p-2 rounded border border-border bg-background">
                        <div
                          className="h-12 w-full rounded"
                          style={{
                            background: `linear-gradient(to right, ${dupe.colors.join(', ')})`,
                          }}
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          #{i + 1} — ΔE: {dupe.distance.toFixed(1)} {dupe.reversed && '(reversed)'} — {dupe.theme || dupe.tag}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Click a palette to view its details
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
  showDupeCount,
}: {
  palette: PaletteWithDupes
  isSelected?: boolean
  onClick?: () => void
  showDupeCount?: boolean
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg overflow-hidden border hover:border-primary/50 hover:shadow-md transition-all cursor-pointer ${
        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
      }`}
    >
      <div
        className="h-20 w-full relative"
        style={{
          background:
            palette.colors.length > 0
              ? `linear-gradient(to right, ${palette.colors.join(', ')})`
              : '#ccc',
        }}
      >
        {showDupeCount && palette.duplicates.length > 0 && (
          <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] font-bold bg-primary text-primary-foreground rounded">
            +{palette.duplicates.length}
          </span>
        )}
      </div>
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
