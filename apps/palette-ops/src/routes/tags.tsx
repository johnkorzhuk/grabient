import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Database, ChevronLeft, ChevronRight, Heart, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminLikedPalettesQueryOptions, type AdminLikedPalette } from "@/queries/palettes";
import { PaletteTagsPanel } from "@/components/palette-tags-panel";
import { GradientSwatch, GradientSwatchCompact } from "@/components/gradient-swatch";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";

const ITEMS_PER_PAGE = 20;

export const Route = createFileRoute("/tags")({
  component: TagViewerPage,
});

function TagViewerPage() {
  const [selectedPalette, setSelectedPalette] = useState<AdminLikedPalette | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery(
    adminLikedPalettesQueryOptions(page, ITEMS_PER_PAGE)
  );

  const palettes = data?.palettes ?? [];
  const totalPages = data?.totalPages ?? 0;
  const total = data?.total ?? 0;

  // Filter palettes by search query
  const filteredPalettes = searchQuery
    ? palettes.filter((p) =>
        p.seed.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : palettes;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar with palette list */}
        <aside className="w-80 border-r border-border flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by seed..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/70"
              />
            </div>
            {!isLoading && (
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Heart className="h-3 w-3" />
                  {total} validated palettes
                </span>
                <span>Page {page} of {totalPages}</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-6 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-4">
                <p className="text-sm text-destructive">Failed to load palettes</p>
              </div>
            ) : filteredPalettes.length === 0 ? (
              <div className="p-4">
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? "No matching palettes" : "No validated palettes yet"}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredPalettes.map((palette) => (
                  <button
                    key={palette.seed}
                    onClick={() => setSelectedPalette(palette)}
                    className={cn(
                      "w-full text-left p-2 rounded-md transition-colors",
                      selectedPalette?.seed === palette.seed
                        ? "bg-primary/10"
                        : "hover:bg-muted"
                    )}
                  >
                    <GradientSwatchCompact seed={palette.seed} steps={palette.steps} />
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground truncate max-w-[180px]">
                        {palette.seed}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {palette.steps}s · {palette.angle}°
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-border flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1">
                {generatePageNumbers(page, totalPages).map((p, i) =>
                  p === "..." ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "ghost"}
                      size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  )
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {selectedPalette ? (
            <div className="max-w-4xl">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground mb-3">
                  Palette Preview (as LLMs see it)
                </h2>
                <GradientSwatch
                  seed={selectedPalette.seed}
                  steps={selectedPalette.steps}
                  className="mb-4"
                />
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="font-mono">{selectedPalette.seed}</span>
                  <span>Style: {selectedPalette.style}</span>
                  <span>Steps: {selectedPalette.steps}</span>
                  <span>Angle: {selectedPalette.angle}°</span>
                </div>
              </div>
              <div className="border-t border-border pt-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">
                  Generated Tags
                </h2>
                <PaletteTagsPanel seed={selectedPalette.seed} />
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Database className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Palette Selected</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Select a palette from the sidebar to view its gradient preview and generated tags.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">Palette Ops</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Admin
          </span>
        </div>
        <nav className="flex items-center gap-4">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
          <Link
            to="/tags"
            className="text-sm font-medium text-foreground"
          >
            Tag Viewer
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

/**
 * Generate page numbers with ellipsis for pagination
 */
function generatePageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [];

  if (current <= 3) {
    pages.push(1, 2, 3, 4, "...", total);
  } else if (current >= total - 2) {
    pages.push(1, "...", total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, "...", current - 1, current, current + 1, "...", total);
  }

  return pages;
}
