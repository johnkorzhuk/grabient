import { createFileRoute } from '@tanstack/react-router'
import { usePaginatedQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useRef, useEffect } from 'react'
import { Filter, Loader2 } from 'lucide-react'
import type { Id } from '../../../convex/_generated/dataModel'

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

  const observer = useRef<IntersectionObserver | null>(null)
  const hasPreloaded = useRef(false)

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
            {results.length > 0 && `${results.length.toLocaleString()} loaded`}
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
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <p className="text-muted-foreground">No staged palettes found</p>
              <p className="text-sm text-muted-foreground">
                Run the deduplication action to populate this table
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {results.map((palette, index) => (
                  <div
                    key={palette._id}
                    ref={index === results.length - 1 ? lastElementRef : null}
                  >
                    <PaletteCard palette={palette} />
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
                    All {results.length.toLocaleString()} palettes loaded
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Panel - Empty */}
        <div className="w-1/2 overflow-y-auto p-4 bg-muted/20">
          {/* Empty for now */}
        </div>
      </div>
    </div>
  )
}

function PaletteCard({ palette }: { palette: StagedPalette }) {
  return (
    <div className="rounded-lg overflow-hidden border border-border hover:border-primary/50 hover:shadow-md transition-all cursor-pointer">
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
