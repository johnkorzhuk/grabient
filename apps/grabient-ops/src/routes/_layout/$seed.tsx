import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";
import { cn } from "~/lib/utils";
import {
  Tag,
  Sparkles,
  Check,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// Type for the structured tag response from providers
// Some fields can be string or array depending on model output
interface StructuredTags {
  mood: string[];
  style: string[];
  dominant_colors: string[];
  temperature: string | string[];
  contrast: string | string[];
  brightness: string | string[];
  saturation: string | string[];
  seasonal: string[];
  associations: string[];
}

// Helper to extract string from field that might be array
function asString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

// Helper to get all values as array for aggregation
function asStringArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

export const Route = createFileRoute("/_layout/$seed")({
  loader: async ({ context, params }) => {
    // Check if seed exists in Convex
    const exists = await context.queryClient.fetchQuery(
      convexQuery(api.palettes.seedExists, { seed: params.seed })
    );

    if (!exists) {
      throw redirect({ to: "/" });
    }

    return { seed: params.seed };
  },
  component: SeedDetailPage,
});

function SeedDetailPage() {
  const { seed } = Route.useParams();
  const palette = useQuery(api.palettes.getPaletteWithTags, { seed });

  const isLoading = palette === undefined;
  const notFound = palette === null;

  return (
    <div className="flex h-[calc(100dvh-57px)]">
      {/* Panel 1: Provider Tags */}
      <div className="flex-1 border-r border-border p-4 overflow-y-auto">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notFound ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Palette not found</p>
          </div>
        ) : (
          <ProviderTagsContent seed={seed} rawTags={palette.rawTags} />
        )}
      </div>

      {/* Panel 2: Refinement Results */}
      <div className="flex-1 p-4 overflow-y-auto">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notFound ? (
          <div className="h-full flex items-center justify-center" />
        ) : (
          <RefinementContent refinedTags={palette.refinedTags} />
        )}
      </div>
    </div>
  );
}

function ProviderTagsContent({
  rawTags,
}: {
  seed: string;
  rawTags: Array<{
    provider: string;
    model: string;
    analysisIndex?: number;
    runNumber?: number;
    tags: unknown;
    error?: string;
    usage?: { inputTokens: number; outputTokens: number };
  }>;
}) {
  const [view, setView] = useState<"summary" | "providers">("summary");

  const errorCount = rawTags.filter((t) => t.error).length;
  const successCount = rawTags.filter((t) => !t.error).length;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Provider Tags</h3>
          {rawTags.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({successCount} successful, {errorCount} errors)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {rawTags.length > 0 && (
            <div className="flex rounded border border-input overflow-hidden">
              <button
                onClick={() => setView("summary")}
                className={cn(
                  "text-xs px-2.5 py-1 transition-colors",
                  view === "summary"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                Summary
              </button>
              <button
                onClick={() => setView("providers")}
                className={cn(
                  "text-xs px-2.5 py-1 transition-colors",
                  view === "providers"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                By Provider
              </button>
            </div>
          )}
        </div>
      </div>

      {rawTags.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <Tag className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No tags generated yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use the Dashboard to start a backfill for all palettes
          </p>
        </div>
      ) : view === "summary" ? (
        <ConsensusView rawTags={rawTags} />
      ) : (
        <ProviderListView rawTags={rawTags} />
      )}
    </>
  );
}

function isStructuredTags(tags: unknown): tags is StructuredTags {
  return (
    typeof tags === "object" &&
    tags !== null &&
    "mood" in tags &&
    "style" in tags
  );
}

// Track which models generated each tag value
type TagWithModels = {
  count: number;
  models: string[];
};

function ConsensusView({
  rawTags,
}: {
  rawTags: Array<{ tags: unknown; error?: string; provider: string; model: string }>;
}) {
  // Filter to only successful structured tags
  const validTags = rawTags.filter(
    (t) => !t.error && isStructuredTags(t.tags)
  ) as Array<{ tags: StructuredTags; provider: string; model: string }>;

  const totalModels = validTags.length;
  const errorCount = rawTags.filter((t) => t.error).length;

  if (validTags.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No valid tags yet</p>
        {errorCount > 0 && (
          <p className="text-xs text-destructive mt-1">
            {errorCount} model(s) failed
          </p>
        )}
      </div>
    );
  }

  // Aggregate by category with model tracking
  const categories: Record<string, Map<string, TagWithModels>> = {
    mood: new Map(),
    style: new Map(),
    dominant_colors: new Map(),
    temperature: new Map(),
    contrast: new Map(),
    brightness: new Map(),
    saturation: new Map(),
    seasonal: new Map(),
    associations: new Map(),
  };

  const addTag = (category: string, value: string, model: string) => {
    const key = value.toLowerCase();
    const existing = categories[category].get(key);
    if (existing) {
      existing.count++;
      if (!existing.models.includes(model)) {
        existing.models.push(model);
      }
    } else {
      categories[category].set(key, { count: 1, models: [model] });
    }
  };

  // Get short model name for display
  const getShortModel = (model: string) => {
    return model.split("/").pop()?.replace("-versatile", "").replace("-20241022", "") ?? model;
  };

  for (const { tags, model } of validTags) {
    const shortModel = getShortModel(model);

    // Array fields
    for (const mood of tags.mood) addTag("mood", mood, shortModel);
    for (const style of tags.style) addTag("style", style, shortModel);
    for (const color of tags.dominant_colors) addTag("dominant_colors", color, shortModel);
    for (const season of tags.seasonal) addTag("seasonal", season, shortModel);
    for (const assoc of tags.associations) addTag("associations", assoc, shortModel);

    // Property fields (can be string or array)
    for (const temp of asStringArray(tags.temperature)) addTag("temperature", temp, shortModel);
    for (const contrast of asStringArray(tags.contrast)) addTag("contrast", contrast, shortModel);
    for (const brightness of asStringArray(tags.brightness)) addTag("brightness", brightness, shortModel);
    for (const saturation of asStringArray(tags.saturation)) addTag("saturation", saturation, shortModel);
  }

  return (
    <div className="space-y-4">
      {/* Properties row */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
          Properties
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <PropertyConsensus label="Temperature" values={categories.temperature} total={totalModels} />
          <PropertyConsensus label="Contrast" values={categories.contrast} total={totalModels} />
          <PropertyConsensus label="Brightness" values={categories.brightness} total={totalModels} />
          <PropertyConsensus label="Saturation" values={categories.saturation} total={totalModels} />
        </div>
      </div>

      {/* Tags by category */}
      <CategoryConsensus label="Mood" values={categories.mood} total={totalModels} />
      <CategoryConsensus label="Style" values={categories.style} total={totalModels} />
      <CategoryConsensus label="Dominant Colors" values={categories.dominant_colors} total={totalModels} />
      <CategoryConsensus label="Seasonal" values={categories.seasonal} total={totalModels} />
      <CategoryConsensus label="Associations" values={categories.associations} total={totalModels} />
    </div>
  );
}

function PropertyConsensus({
  label,
  values,
  total,
}: {
  label: string;
  values: Map<string, TagWithModels>;
  total: number;
}) {
  const sorted = Array.from(values.entries()).sort((a, b) => b[1].count - a[1].count);
  const winner = sorted[0];

  if (!winner) return null;

  const percentage = Math.round((winner[1].count / total) * 100);

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span
          title={winner[1].models.join("\n")}
          className={cn(
            "text-xs font-medium px-1.5 py-0.5 rounded cursor-help",
            percentage >= 70
              ? "bg-green-500/15 text-green-700 dark:text-green-400"
              : percentage >= 50
                ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
                : "bg-muted text-muted-foreground"
          )}
        >
          {winner[0]}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {percentage}%
        </span>
      </div>
    </div>
  );
}

function CategoryConsensus({
  label,
  values,
  total,
}: {
  label: string;
  values: Map<string, TagWithModels>;
  total: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const sorted = Array.from(values.entries()).sort((a, b) => b[1].count - a[1].count);

  if (sorted.length === 0) return null;

  const highConsensus = sorted.filter(([, data]) => data.count / total >= 0.5);
  const medConsensus = sorted.filter(([, data]) => data.count / total >= 0.3 && data.count / total < 0.5);
  const lowConsensus = sorted.filter(([, data]) => data.count / total < 0.3);

  const visibleLowConsensus = showAll ? lowConsensus : lowConsensus.slice(0, 10);
  const hiddenCount = lowConsensus.length - 10;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
        {label}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {highConsensus.map(([tag, data]) => (
          <span
            key={tag}
            title={data.models.join("\n")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-500/15 text-green-700 dark:text-green-400 cursor-help"
          >
            {tag}
            <span className="text-[10px] text-green-600/70 dark:text-green-400/70">
              {data.count}/{total}
            </span>
          </span>
        ))}
        {medConsensus.map(([tag, data]) => (
          <span
            key={tag}
            title={data.models.join("\n")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 cursor-help"
          >
            {tag}
            <span className="text-[10px] text-yellow-600/70 dark:text-yellow-400/70">
              {data.count}/{total}
            </span>
          </span>
        ))}
        {visibleLowConsensus.map(([tag, data]) => (
          <span
            key={tag}
            title={data.models.join("\n")}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-muted text-muted-foreground cursor-help"
          >
            {tag}
            <span className="text-[10px] text-muted-foreground/70">
              {data.count}/{total}
            </span>
          </span>
        ))}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-primary hover:text-primary/80 px-2 py-1 hover:bg-primary/10 rounded transition-colors"
          >
            {showAll ? "Show less" : `+${hiddenCount} more`}
          </button>
        )}
      </div>
    </div>
  );
}

function ProviderListView({
  rawTags,
}: {
  rawTags: Array<{
    provider: string;
    model: string;
    analysisIndex?: number;
    runNumber?: number;
    tags: unknown;
    error?: string;
    usage?: { inputTokens: number; outputTokens: number };
  }>;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Group by model and aggregate
  const modelGroups = new Map<string, typeof rawTags>();
  for (const tag of rawTags) {
    const model = tag.model.split("/").pop() ?? tag.model;
    const existing = modelGroups.get(model) ?? [];
    existing.push(tag);
    modelGroups.set(model, existing);
  }

  const sortedModels = Array.from(modelGroups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Model</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Runs</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tokens</th>
            <th className="text-center px-3 py-2 font-medium text-muted-foreground w-12">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sortedModels.map(([model, tags], groupIdx) => {
            const successCount = tags.filter(t => !t.error && isStructuredTags(t.tags)).length;
            const errorCount = tags.filter(t => t.error).length;
            const totalTokens = tags.reduce((sum, t) => sum + (t.usage?.inputTokens ?? 0) + (t.usage?.outputTokens ?? 0), 0);
            const isExpanded = expandedIndex === groupIdx;

            return (
              <tr
                key={model}
                onClick={() => setExpandedIndex(isExpanded ? null : groupIdx)}
                className={cn(
                  "cursor-pointer transition-colors",
                  isExpanded ? "bg-muted/30" : "hover:bg-muted/20",
                  errorCount > 0 && successCount === 0 && "bg-destructive/5"
                )}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-medium text-foreground truncate">
                      {model.replace("-versatile", "").replace("-20241022", "")}
                    </span>
                  </div>
                  {isExpanded && tags.length > 0 && (
                    <div className="mt-2 ml-5 space-y-1">
                      {tags.map((tag, i) => (
                        <div key={i} className="text-[10px] text-muted-foreground">
                          {tag.error ? (
                            <span className="text-destructive">Error: {tag.error.slice(0, 50)}...</span>
                          ) : isStructuredTags(tag.tags) ? (
                            <StructuredTagDisplay tags={tag.tags as StructuredTags} />
                          ) : (
                            <span>Invalid format</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground align-top">
                  {tags.length}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground align-top">
                  {totalTokens.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-center align-top">
                  {errorCount > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {errorCount > 1 && <span>{errorCount}</span>}
                    </span>
                  ) : successCount > 0 ? (
                    <Check className="h-3 w-3 text-green-500 mx-auto" />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StructuredTagDisplay({ tags }: { tags: StructuredTags }) {
  return (
    <div className="mt-2 space-y-2">
      {/* Properties row */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400">
          {asString(tags.temperature)}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-400">
          {asString(tags.contrast)} contrast
        </span>
        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400">
          {asString(tags.brightness)}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-700 dark:text-pink-400">
          {asString(tags.saturation)}
        </span>
      </div>

      {/* Tag arrays */}
      <div className="space-y-1.5">
        {tags.mood.length > 0 && (
          <TagRow label="Mood" tags={tags.mood} />
        )}
        {tags.style.length > 0 && (
          <TagRow label="Style" tags={tags.style} />
        )}
        {tags.dominant_colors.length > 0 && (
          <TagRow label="Colors" tags={tags.dominant_colors} />
        )}
        {tags.seasonal.length > 0 && (
          <TagRow label="Season" tags={tags.seasonal} />
        )}
        {tags.associations.length > 0 && (
          <TagRow label="Assoc" tags={tags.associations} />
        )}
      </div>
    </div>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-muted-foreground w-12 shrink-0 pt-1">{label}</span>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function RefinementContent({
  refinedTags,
}: {
  refinedTags: {
    tags: unknown;
    embedText: string;
    usage?: { inputTokens: number; outputTokens: number };
  } | null;
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Refinement</h3>
      </div>

      {refinedTags === null ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Not yet refined</p>
          <p className="text-xs text-muted-foreground mt-1">
            Refinement uses Opus 4.5 to consolidate provider tags
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Refined Tags */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Check className="h-4 w-4 text-green-500" />
              <h4 className="text-xs font-medium text-foreground">Canonical Tags</h4>
            </div>
            <TagDisplay tags={refinedTags.tags} variant="refined" />
          </div>

          {/* Embed Text */}
          {refinedTags.embedText && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Embedding Text
              </h4>
              <p className="text-sm text-foreground leading-relaxed">
                {refinedTags.embedText}
              </p>
            </div>
          )}

          {/* Usage */}
          {refinedTags.usage && (
            <div className="text-xs text-muted-foreground">
              Refinement: {refinedTags.usage.inputTokens.toLocaleString()} in / {refinedTags.usage.outputTokens.toLocaleString()} out
            </div>
          )}
        </div>
      )}
    </>
  );
}

function TagDisplay({ tags, variant = "raw" }: { tags: unknown; variant?: "refined" | "raw" }) {
  if (!tags) return null;

  if (typeof tags === "string") {
    return <p className="text-sm text-foreground">{tags}</p>;
  }

  if (Array.isArray(tags)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag, i) => (
          <span
            key={i}
            className={cn(
              "inline-block px-2 py-1 text-xs rounded-md",
              variant === "refined"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {typeof tag === "string" ? tag : JSON.stringify(tag)}
          </span>
        ))}
      </div>
    );
  }

  if (typeof tags === "object") {
    return (
      <pre className="text-xs text-foreground bg-muted p-2 rounded-md overflow-auto max-h-40">
        {JSON.stringify(tags, null, 2)}
      </pre>
    );
  }

  return <p className="text-sm text-foreground">{String(tags)}</p>;
}
