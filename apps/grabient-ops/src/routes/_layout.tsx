import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useMemo } from "react";
import { cn } from "~/lib/utils";
import {
  Database,
  ChevronLeft,
  ChevronRight,
  Search,
  ExternalLink,
} from "lucide-react";
import { ThemeToggle } from "~/components/theme";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import {
  applyGlobals,
  cosineGradient,
  rgbToHex,
  generateCssGradient,
} from "@repo/data-ops/gradient-gen";

export const Route = createFileRoute("/_layout")({
  component: LayoutComponent,
});

function LayoutComponent() {
  return (
    <div className="bg-background flex flex-col">
      <Header />
      <div className="flex h-[calc(100dvh-57px)]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-border px-6 py-4 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">Grabient Ops</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Admin
          </span>
        </div>
        <nav className="flex items-center gap-4">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors [&.active]:font-medium [&.active]:text-foreground"
          >
            Dashboard
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

type FilterType = "all" | "needs_tags" | "needs_refinement";

function Sidebar() {
  const params = useParams({ strict: false });
  const selectedSeed = (params as { seed?: string }).seed ?? null;

  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const limit = 30;
  const offset = (page - 1) * limit;

  const paletteList = useQuery(api.palettes.listPalettesWithStatus, {
    limit,
    offset,
    filter,
  });

  const totalPages = paletteList ? Math.ceil(paletteList.total / limit) : 1;

  // Filter palettes by search query (client-side text filter)
  const filteredPalettes = paletteList?.palettes.filter((p) =>
    searchQuery ? p.seed.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  // Reset page when filter changes
  const handleFilterChange = (newFilter: FilterType) => {
    setFilter(newFilter);
    setPage(1);
  };

  return (
    <aside className="w-72 border-r border-border flex flex-col overflow-hidden shrink-0">
      <div className="p-3 border-b border-border space-y-3">
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

        <div className="flex rounded border border-input overflow-hidden">
          <button
            onClick={() => handleFilterChange("all")}
            className={cn(
              "flex-1 text-xs px-2 py-1.5 transition-colors",
              filter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            All
          </button>
          <button
            onClick={() => handleFilterChange("needs_tags")}
            className={cn(
              "flex-1 text-xs px-2 py-1.5 transition-colors border-l border-input",
              filter === "needs_tags"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            Tagged
          </button>
          <button
            onClick={() => handleFilterChange("needs_refinement")}
            className={cn(
              "flex-1 text-xs px-2 py-1.5 transition-colors border-l border-input",
              filter === "needs_refinement"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            Unrefined
          </button>
        </div>

        {paletteList && (
          <p className="text-xs text-muted-foreground">
            {paletteList.total} palettes
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {paletteList === undefined ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="h-14 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : filteredPalettes?.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No palettes found
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredPalettes?.map((palette) => (
              <PaletteListItem
                key={palette._id}
                palette={palette}
                isSelected={selectedSeed === palette.seed}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-border flex items-center justify-between shrink-0">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className={cn(
              "p-1.5 rounded border border-input",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "hover:bg-accent"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className={cn(
              "p-1.5 rounded border border-input",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "hover:bg-accent"
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
}

const SIDEBAR_GRADIENT_STEPS = 11;

function getGradientStyle(seed: string): string {
  try {
    const { coeffs, globals } = deserializeCoeffs(seed);
    const appliedCoeffs = applyGlobals(coeffs, globals);
    const rgbColors = cosineGradient(SIDEBAR_GRADIENT_STEPS, appliedCoeffs);
    const hexColors = rgbColors.map((color) => rgbToHex(color[0], color[1], color[2]));
    const { gradientString } = generateCssGradient(
      hexColors,
      "linearSwatches",
      90,
      { seed, searchString: "" }
    );
    return gradientString;
  } catch {
    return "linear-gradient(90deg, #888, #aaa)";
  }
}

function PaletteListItem({
  palette,
  isSelected,
}: {
  palette: {
    _id: string;
    seed: string;
    imageUrl: string;
    tagCount: number;
    isRefined: boolean;
  };
  isSelected: boolean;
}) {
  const grabientUrl = `https://grabient.com/${palette.seed}`;
  const gradientStyle = useMemo(() => getGradientStyle(palette.seed), [palette.seed]);

  return (
    <div
      className={cn(
        "group relative rounded-md transition-colors overflow-hidden",
        isSelected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-border"
      )}
    >
      <Link
        to="/$seed"
        params={{ seed: palette.seed }}
        className="block"
      >
        {/* Full-width gradient swatch rendered with CSS */}
        <div
          className="w-full h-12"
          style={{
            backgroundImage: gradientStyle,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />

        {/* Overlay with metadata */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent">
          <div className="absolute bottom-1 left-2 right-8 flex items-center gap-1.5">
            {palette.tagCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/80 text-white">
                {palette.tagCount}
              </span>
            )}
            {palette.isRefined && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/80 text-white">
                R
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* External link button */}
      <a
        href={grabientUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded",
          "bg-black/40 text-white/80 hover:bg-black/60 hover:text-white",
          "opacity-0 group-hover:opacity-100 transition-opacity"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
