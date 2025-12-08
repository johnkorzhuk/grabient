import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
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
import { z } from "zod";
import { BLACKLISTED_REFINEMENT_MODELS } from "../../../convex/lib/providers.types";

// Type for the structured tag response from providers
// Some fields can be string or array depending on model output
interface StructuredTags {
  mood: string[];
  style: string[];
  dominant_colors: string[];
  harmony: string[];
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

// Search params schema for refinement model persistence
const searchValidatorSchema = z.object({
  refinementModel: z.string().optional(),
});

export const Route = createFileRoute("/_layout/$seed")({
  validateSearch: searchValidatorSchema,
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
  const { refinementModel } = Route.useSearch();
  const navigate = Route.useNavigate();
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
          <ProviderTagsContent seed={seed} rawTags={palette.rawTags} availableVersions={palette.availableVersions} />
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
          <RefinementContent
            allRefinedTags={palette.allRefinedTags}
            selectedModel={refinementModel}
            onModelChange={(model) => {
              navigate({
                search: (prev) => ({ ...prev, refinementModel: model }),
                replace: true,
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

function ProviderTagsContent({
  rawTags,
  availableVersions,
}: {
  seed: string;
  rawTags: Array<{
    provider: string;
    model: string;
    promptVersion: string;
    analysisIndex?: number;
    runNumber?: number;
    tags: unknown;
    error?: string;
    usage?: { inputTokens: number; outputTokens: number };
  }>;
  availableVersions: string[];
}) {
  const [view, setView] = useState<"summary" | "providers">("summary");
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const versionDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const latestVersion = availableVersions[0];

  // Get unique models from rawTags, grouped by provider
  const modelsByProvider = rawTags.reduce((acc, t) => {
    if (!acc.has(t.provider)) {
      acc.set(t.provider, new Set());
    }
    acc.get(t.provider)!.add(t.model);
    return acc;
  }, new Map<string, Set<string>>());

  const allModelKeys = rawTags.map(t => `${t.provider}/${t.model}`);
  const uniqueModelKeys = [...new Set(allModelKeys)].sort();

  // Set default to latest version on first load
  useEffect(() => {
    if (latestVersion && selectedVersions.size === 0) {
      setSelectedVersions(new Set([latestVersion]));
    }
  }, [latestVersion]);

  // Set default to all models on first load
  useEffect(() => {
    if (uniqueModelKeys.length > 0 && selectedModels.size === 0) {
      setSelectedModels(new Set(uniqueModelKeys));
    }
  }, [uniqueModelKeys.length]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (versionDropdownRef.current && !versionDropdownRef.current.contains(event.target as Node)) {
        setVersionDropdownOpen(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter tags by selected versions and models
  const filteredTags = rawTags.filter(t => {
    const versionMatch = selectedVersions.size === 0 || selectedVersions.has(t.promptVersion);
    const modelKey = `${t.provider}/${t.model}`;
    const modelMatch = selectedModels.size === 0 || selectedModels.has(modelKey);
    return versionMatch && modelMatch;
  });

  const errorCount = filteredTags.filter((t) => t.error).length;
  const successCount = filteredTags.filter((t) => !t.error).length;

  // Toggle version selection
  const toggleVersion = (version: string) => {
    const newSet = new Set(selectedVersions);
    if (newSet.has(version)) {
      newSet.delete(version);
    } else {
      newSet.add(version);
    }
    setSelectedVersions(newSet);
  };

  const selectAllVersions = () => setSelectedVersions(new Set(availableVersions));
  const selectLatestVersion = () => setSelectedVersions(latestVersion ? new Set([latestVersion]) : new Set());

  // Toggle model selection
  const toggleModel = (modelKey: string) => {
    const newSet = new Set(selectedModels);
    if (newSet.has(modelKey)) {
      newSet.delete(modelKey);
    } else {
      newSet.add(modelKey);
    }
    setSelectedModels(newSet);
  };

  // Toggle all models for a provider
  const toggleProvider = (provider: string) => {
    const providerModels = modelsByProvider.get(provider);
    if (!providerModels) return;

    const providerModelKeys = [...providerModels].map(m => `${provider}/${m}`);
    const allSelected = providerModelKeys.every(k => selectedModels.has(k));

    const newSet = new Set(selectedModels);
    if (allSelected) {
      // Deselect all models for this provider
      providerModelKeys.forEach(k => newSet.delete(k));
    } else {
      // Select all models for this provider
      providerModelKeys.forEach(k => newSet.add(k));
    }
    setSelectedModels(newSet);
  };

  // Helper to get short model name for display
  const getModelShortName = (modelKey: string) => {
    const model = modelKey.split("/").pop() ?? modelKey;
    if (model.includes("/")) return model.split("/").pop() ?? model;
    return model.replace("-20241022", "").replace("-versatile", "");
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Provider Tags</h3>
          {filteredTags.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({successCount} successful, {errorCount} errors)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Version dropdown */}
          {availableVersions.length > 0 && (
            <div className="relative" ref={versionDropdownRef}>
              <button
                onClick={() => setVersionDropdownOpen(!versionDropdownOpen)}
                className={cn(
                  "text-xs px-2 py-1 rounded border border-input bg-background",
                  "text-muted-foreground hover:text-foreground",
                  "outline-none focus:ring-2 focus:ring-ring/70",
                  "flex items-center gap-1.5 min-w-[100px]",
                  versionDropdownOpen && "border-muted-foreground/30 text-foreground"
                )}
              >
                <span>
                  {selectedVersions.size === availableVersions.length
                    ? "All versions"
                    : selectedVersions.size === 1 && selectedVersions.has(latestVersion ?? "")
                    ? "Latest"
                    : `${selectedVersions.size} version${selectedVersions.size > 1 ? "s" : ""}`}
                </span>
                <ChevronDown
                  className={cn("w-3 h-3 transition-transform", versionDropdownOpen && "rotate-180")}
                />
              </button>
              {versionDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 right-0 bg-background/95 backdrop-blur-sm border border-input rounded-md shadow-lg min-w-[140px] max-h-[300px] overflow-y-auto">
                  <div className="p-1.5 border-b border-input flex gap-1">
                    <button
                      onClick={selectLatestVersion}
                      className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                    >
                      Latest
                    </button>
                    <button
                      onClick={selectAllVersions}
                      className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                    >
                      All
                    </button>
                  </div>
                  <div className="p-1">
                    {availableVersions.map((version) => {
                      const isSelected = selectedVersions.has(version);
                      const isLatest = version === latestVersion;
                      return (
                        <button
                          key={version}
                          onClick={() => toggleVersion(version)}
                          className={cn(
                            "w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2",
                            "hover:bg-muted transition-colors",
                            isSelected ? "text-foreground" : "text-muted-foreground"
                          )}
                        >
                          <span className={cn(
                            "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-input"
                          )}>
                            {isSelected && (
                              <Check className="w-2.5 h-2.5 text-primary-foreground" />
                            )}
                          </span>
                          <span className="font-mono">{version.slice(0, 8)}</span>
                          {isLatest && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary ml-auto">
                              latest
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Model/Provider dropdown */}
          {uniqueModelKeys.length > 0 && (
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className={cn(
                  "text-xs px-2 py-1 rounded border border-input bg-background",
                  "text-muted-foreground hover:text-foreground",
                  "outline-none focus:ring-2 focus:ring-ring/70",
                  "flex items-center gap-1.5 min-w-[100px]",
                  modelDropdownOpen && "border-muted-foreground/30 text-foreground"
                )}
              >
                <span>
                  {selectedModels.size === uniqueModelKeys.length
                    ? "All models"
                    : selectedModels.size === 0
                    ? "No models"
                    : `${selectedModels.size} model${selectedModels.size > 1 ? "s" : ""}`}
                </span>
                <ChevronDown
                  className={cn("w-3 h-3 transition-transform", modelDropdownOpen && "rotate-180")}
                />
              </button>
              {modelDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 right-0 bg-background/95 backdrop-blur-sm border border-input rounded-md shadow-lg min-w-[200px] max-h-[400px] overflow-y-auto">
                  <div className="p-1">
                    {[...modelsByProvider.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([provider, models]) => {
                      const providerModelKeys = [...models].map(m => `${provider}/${m}`);
                      const allSelected = providerModelKeys.every(k => selectedModels.has(k));
                      const someSelected = providerModelKeys.some(k => selectedModels.has(k));

                      return (
                        <div key={provider} className="mb-1">
                          {/* Provider header */}
                          <button
                            onClick={() => toggleProvider(provider)}
                            className={cn(
                              "w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2",
                              "hover:bg-muted transition-colors font-medium",
                              allSelected || someSelected ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            <span className={cn(
                              "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                              allSelected
                                ? "bg-primary border-primary"
                                : someSelected
                                ? "bg-primary/50 border-primary"
                                : "border-input"
                            )}>
                              {(allSelected || someSelected) && (
                                <Check className="w-2.5 h-2.5 text-primary-foreground" />
                              )}
                            </span>
                            <span className="capitalize">{provider}</span>
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {providerModelKeys.filter(k => selectedModels.has(k)).length}/{models.size}
                            </span>
                          </button>
                          {/* Models under provider */}
                          <div className="ml-4">
                            {[...models].sort().map((model) => {
                              const modelKey = `${provider}/${model}`;
                              const isSelected = selectedModels.has(modelKey);
                              return (
                                <button
                                  key={modelKey}
                                  onClick={() => toggleModel(modelKey)}
                                  className={cn(
                                    "w-full text-left text-xs px-2 py-1 rounded flex items-center gap-2",
                                    "hover:bg-muted transition-colors",
                                    isSelected ? "text-foreground" : "text-muted-foreground"
                                  )}
                                >
                                  <span className={cn(
                                    "w-3 h-3 rounded border flex items-center justify-center shrink-0",
                                    isSelected
                                      ? "bg-primary border-primary"
                                      : "border-input"
                                  )}>
                                    {isSelected && (
                                      <Check className="w-2 h-2 text-primary-foreground" />
                                    )}
                                  </span>
                                  <span className="font-mono text-[11px]">{getModelShortName(model)}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {filteredTags.length > 0 && (
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

      {filteredTags.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <Tag className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {rawTags.length === 0 ? "No tags generated yet" : "No tags for selected filters"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {rawTags.length === 0
              ? "Use the Dashboard to start a backfill for all palettes"
              : "Try adjusting version or model filters"}
          </p>
        </div>
      ) : view === "summary" ? (
        <ConsensusView rawTags={filteredTags} />
      ) : (
        <ProviderListView rawTags={filteredTags} />
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
    harmony: new Map(),
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
    for (const harmony of tags.harmony ?? []) addTag("harmony", harmony, shortModel);
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
      <CategoryConsensus label="Harmony" values={categories.harmony} total={totalModels} />
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
        {(tags.harmony?.length ?? 0) > 0 && (
          <TagRow label="Harmony" tags={tags.harmony} />
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

// Type for refined tags structure
interface RefinedTagsData {
  temperature: string;
  contrast: string;
  brightness: string;
  saturation: string;
  harmony: string[];
  mood: string[];
  style: string[];
  dominant_colors: string[];
  seasonal: string[];
  associations: string[];
  mappings?: Record<string, string[]>;
  embed_text: string;
}

function isRefinedTags(tags: unknown): tags is RefinedTagsData {
  return (
    typeof tags === "object" &&
    tags !== null &&
    "temperature" in tags &&
    "mood" in tags &&
    "embed_text" in tags
  );
}

type RefinedTagRecord = {
  _id: string;
  model: string;
  cycle: number;
  promptVersion: string;
  sourcePromptVersions?: string[];
  tags: unknown;
  embedText: string;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
  _creationTime: number;
};

function RefinementContent({
  allRefinedTags,
  selectedModel,
  onModelChange,
}: {
  allRefinedTags: RefinedTagRecord[];
  selectedModel?: string;
  onModelChange: (model: string) => void;
}) {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [cycleDropdownOpen, setCycleDropdownOpen] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const cycleDropdownRef = useRef<HTMLDivElement>(null);

  // Group refinements by model, sorted by creation time (newest first within each model)
  // Excludes blacklisted models from display
  const refinementsByModel = (() => {
    const grouped = new Map<string, RefinedTagRecord[]>();
    for (const ref of allRefinedTags) {
      // Skip blacklisted models
      if (BLACKLISTED_REFINEMENT_MODELS.has(ref.model as any)) continue;
      const existing = grouped.get(ref.model) ?? [];
      existing.push(ref);
      grouped.set(ref.model, existing);
    }
    // Sort each model's runs by creation time (newest first)
    for (const [model, runs] of grouped) {
      grouped.set(model, runs.sort((a, b) => b._creationTime - a._creationTime));
    }
    return grouped;
  })();

  // Get runs for the current model
  const currentModelRuns = (() => {
    if (selectedModel) {
      return refinementsByModel.get(selectedModel) ?? [];
    }
    // If no model selected, get runs for the model with the latest refinement
    if (allRefinedTags.length > 0) {
      const latest = allRefinedTags.reduce((a, b) =>
        a._creationTime > b._creationTime ? a : b
      );
      return refinementsByModel.get(latest.model) ?? [];
    }
    return [];
  })();

  // Find the selected refinement - use selected cycle or default to latest
  const selectedRefinement = (() => {
    if (currentModelRuns.length === 0) return null;

    if (selectedCycle !== null) {
      const found = currentModelRuns.find(r => r.cycle === selectedCycle);
      if (found) return found;
    }
    // Default to latest run (first in sorted array)
    return currentModelRuns[0];
  })();

  // Reset cycle selection when model changes
  useEffect(() => {
    setSelectedCycle(null);
  }, [selectedModel]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
      if (cycleDropdownRef.current && !cycleDropdownRef.current.contains(event.target as Node)) {
        setCycleDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get short model name helper
  const getModelShortName = (model: string) => {
    return model
      .replace("claude-opus-4-5-20251101", "opus-4.5")
      .replace("gpt-4.1-mini", "gpt-4.1-mini")
      .replace("gpt-5-mini", "gpt-5-mini")
      .replace("qwen/qwen3-32b", "qwen3-32b")
      .replace("openai/gpt-oss-120b", "gpt-oss-120b")
      .replace("openai/gpt-oss-20b", "gpt-oss-20b")
      .replace("moonshotai/kimi-k2-instruct", "kimi-k2")
      .replace("gemini-2.5-flash-lite", "gemini-2.5-lite")
      .replace("gemini-2.0-flash", "gemini-2.0");
  };

  if (allRefinedTags.length === 0) {
    return (
      <>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Refinement</h3>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Not yet refined</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use the Dashboard to start refinement
          </p>
        </div>
      </>
    );
  }

  // Use the computed selected refinement
  const refinedTags = selectedRefinement ?? allRefinedTags[0];

  const hasError = !!refinedTags?.error;
  const tags = refinedTags && isRefinedTags(refinedTags.tags) ? refinedTags.tags : null;

  // Count successes and errors
  const successCount = allRefinedTags.filter(r => !r.error).length;
  const errorCount = allRefinedTags.filter(r => r.error).length;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Refinement</h3>
          {allRefinedTags.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({successCount} successful{errorCount > 0 ? `, ${errorCount} errors` : ""})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Model dropdown */}
          {allRefinedTags.length > 0 && (
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className={cn(
                  "text-xs px-2 py-1 rounded border border-input bg-background",
                  "text-muted-foreground hover:text-foreground",
                  "outline-none focus:ring-2 focus:ring-ring/70",
                  "flex items-center gap-1.5",
                  modelDropdownOpen && "border-muted-foreground/30 text-foreground"
                )}
              >
                <span>
                  {refinedTags ? getModelShortName(refinedTags.model) : "Select model"}
                </span>
                <ChevronDown
                  className={cn("w-3 h-3 transition-transform", modelDropdownOpen && "rotate-180")}
                />
              </button>
              {modelDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 right-0 bg-background/95 backdrop-blur-sm border border-input rounded-md shadow-lg min-w-[180px] max-h-[400px] overflow-y-auto">
                  <div className="p-1">
                    {Array.from(refinementsByModel.entries())
                      .sort((a, b) => {
                        const aLatest = a[1][0]?._creationTime ?? 0;
                        const bLatest = b[1][0]?._creationTime ?? 0;
                        return bLatest - aLatest;
                      })
                      .map(([model, runs]) => {
                        const isModelSelected = refinedTags?.model === model;
                        return (
                          <button
                            key={model}
                            onClick={() => {
                              onModelChange(model);
                              setModelDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full text-left text-xs px-2 py-1.5 rounded",
                              "hover:bg-muted transition-colors",
                              isModelSelected ? "text-foreground bg-muted/50" : "text-muted-foreground"
                            )}
                          >
                            {getModelShortName(model)}
                            <span className="text-[10px] text-muted-foreground ml-1">
                              ({runs.length})
                            </span>
                            {isModelSelected && (
                              <Check className="inline-block w-3 h-3 ml-1 text-green-500" />
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cycle dropdown - show if model has any runs */}
          {currentModelRuns.length > 0 && (
            <div className="relative" ref={cycleDropdownRef}>
              <button
                onClick={() => setCycleDropdownOpen(!cycleDropdownOpen)}
                className={cn(
                  "text-xs px-2 py-1 rounded border border-input bg-background",
                  "text-muted-foreground hover:text-foreground",
                  "outline-none focus:ring-2 focus:ring-ring/70",
                  "flex items-center gap-1.5",
                  cycleDropdownOpen && "border-muted-foreground/30 text-foreground"
                )}
              >
                <span>c{refinedTags?.cycle ?? "?"}</span>
                <ChevronDown
                  className={cn("w-3 h-3 transition-transform", cycleDropdownOpen && "rotate-180")}
                />
              </button>
              {cycleDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 right-0 bg-background/95 backdrop-blur-sm border border-input rounded-md shadow-lg min-w-[140px] max-h-[300px] overflow-y-auto">
                  <div className="p-1">
                    {currentModelRuns.map((run, idx) => {
                      const isSelected = refinedTags?._id === run._id;
                      const isLatest = idx === 0;
                      return (
                        <button
                          key={run._id}
                          onClick={() => {
                            setSelectedCycle(run.cycle);
                            setCycleDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2",
                            "hover:bg-muted transition-colors",
                            isSelected ? "text-foreground bg-muted/50" : "text-muted-foreground"
                          )}
                        >
                          <span className="font-mono">c{run.cycle}</span>
                          <span className="text-muted-foreground/70 text-[10px]">
                            {new Date(run._creationTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                          {run.error && (
                            <AlertCircle className="w-3 h-3 text-destructive ml-auto" />
                          )}
                          {isLatest && !run.error && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary ml-auto">
                              latest
                            </span>
                          )}
                          {isSelected && !isLatest && !run.error && (
                            <Check className="w-3 h-3 text-green-500 ml-auto" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {refinedTags && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <span>{new Date(refinedTags._creationTime).toLocaleDateString()}</span>
          {refinedTags.usage && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>{(refinedTags.usage.inputTokens + refinedTags.usage.outputTokens).toLocaleString()} tokens</span>
            </>
          )}
        </div>
      )}

      {hasError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <h4 className="text-xs font-medium text-destructive">Refinement Failed</h4>
          </div>
          <p className="text-xs text-destructive/80">{refinedTags.error}</p>
        </div>
      ) : tags ? (
        <div className="space-y-4">
          {/* Properties */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
              Properties
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <RefinedProperty label="Temperature" value={tags.temperature} />
              <RefinedProperty label="Contrast" value={tags.contrast} />
              <RefinedProperty label="Brightness" value={tags.brightness} />
              <RefinedProperty label="Saturation" value={tags.saturation} />
            </div>
          </div>

          {/* Tags by category */}
          <RefinedCategory label="Mood" tags={tags.mood} />
          <RefinedCategory label="Style" tags={tags.style} />
          <RefinedCategory label="Dominant Colors" tags={tags.dominant_colors} />
          <RefinedCategory label="Harmony" tags={tags.harmony ?? []} />
          <RefinedCategory label="Seasonal" tags={tags.seasonal} />
          <RefinedCategory label="Associations" tags={tags.associations} />

          {/* Embed Text */}
          {tags.embed_text && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Embedding Text
              </h4>
              <p className="text-sm text-foreground leading-relaxed">
                {tags.embed_text}
              </p>
            </div>
          )}

          {/* Mappings (if present) */}
          {tags.mappings && Object.keys(tags.mappings).length > 0 && (
            <RefinedMappings mappings={tags.mappings} />
          )}

          {/* Source versions */}
          {refinedTags.sourcePromptVersions && refinedTags.sourcePromptVersions.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Source versions: {refinedTags.sourcePromptVersions.map(v => v.slice(0, 8)).join(", ")}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Raw Output</h4>
          <pre className="text-xs text-foreground bg-muted p-2 rounded-md overflow-auto max-h-60">
            {JSON.stringify(refinedTags.tags, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}

function RefinedProperty({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
        {value}
      </span>
    </div>
  );
}

function RefinedCategory({ label, tags }: { label: string; tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
        {label}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="inline-block px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function RefinedMappings({ mappings }: { mappings: Record<string, string[]> }) {
  const entries = Object.entries(mappings).filter(([, variants]) => variants.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
        Synonym Mappings
      </h4>
      <div className="space-y-2">
        {entries.map(([canonical, variants]) => (
          <div key={canonical} className="flex items-start gap-2 text-xs">
            <span className="font-medium text-primary shrink-0">{canonical}</span>
            <span className="text-muted-foreground">←</span>
            <span className="text-muted-foreground">{variants.join(", ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

