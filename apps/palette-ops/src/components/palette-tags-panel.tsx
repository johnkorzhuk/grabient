import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { paletteTagsQueryOptions, type PaletteTagResult } from "@/queries/palettes";
import { cn } from "@/lib/utils";

interface PaletteTagsPanelProps {
  seed: string;
}

export function PaletteTagsPanel({ seed }: PaletteTagsPanelProps) {
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);
  const versionDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"summary" | "providers">("summary");

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
      if (versionDropdownRef.current && !versionDropdownRef.current.contains(event.target as Node)) {
        setVersionDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data, isLoading, error } = useQuery(paletteTagsQueryOptions(seed));

  const tags = data?.tags ?? [];
  const availableVersions = data?.availableVersions ?? [];
  const latestVersion = availableVersions[0];

  // Set default to latest version on first load
  useEffect(() => {
    if (latestVersion && selectedVersions.size === 0) {
      setSelectedVersions(new Set([latestVersion]));
    }
  }, [latestVersion]);

  if (isLoading) {
    return (
      <div className="p-4 border border-input rounded-md bg-background/50">
        <p className="text-sm text-muted-foreground">Loading tags...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-input rounded-md bg-background/50">
        <p className="text-sm text-destructive">Failed to load tags</p>
      </div>
    );
  }

  if (tags.length === 0 && availableVersions.length === 0) {
    return (
      <div className="p-4 border border-input rounded-md bg-background/50">
        <p className="text-sm text-muted-foreground">No tags generated for this palette yet.</p>
      </div>
    );
  }

  // Get available models from all tags
  const availableModels = [...new Set(tags.filter(t => t.model).map(t => t.model))].sort();

  // Filter tags with valid data, by selected versions and models
  const validTags = tags.filter(t =>
    t.tags &&
    (t.promptVersion && selectedVersions.has(t.promptVersion)) &&
    (selectedModels.size === 0 || selectedModels.has(t.model))
  );

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

  // Select/deselect all versions
  const selectAllVersions = () => setSelectedVersions(new Set(availableVersions));
  const selectLatestVersion = () => setSelectedVersions(latestVersion ? new Set([latestVersion]) : new Set());

  // Toggle model selection
  const toggleModel = (model: string) => {
    const newSet = new Set(selectedModels);
    if (newSet.has(model)) {
      newSet.delete(model);
    } else {
      newSet.add(model);
    }
    setSelectedModels(newSet);
  };

  // Select/deselect all models
  const selectAllModels = () => setSelectedModels(new Set());
  const deselectAllModels = () => setSelectedModels(new Set(availableModels));

  // Get run stats
  const runNumbers = [...new Set(validTags.map(t => t.runNumber))].sort((a, b) => a - b);
  const totalRuns = runNumbers.length;
  const totalResponses = validTags.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">AI Tags</h3>
        <div className="flex items-center gap-3">
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
                <svg
                  className={cn("w-3 h-3 transition-transform", versionDropdownOpen && "rotate-180")}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
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
                              <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          <span className="font-mono">{version}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {availableModels.length > 0 && (
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
                  {selectedModels.size === 0
                    ? "All models"
                    : `${selectedModels.size} model${selectedModels.size > 1 ? "s" : ""}`}
                </span>
                <svg
                  className={cn("w-3 h-3 transition-transform", modelDropdownOpen && "rotate-180")}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {modelDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 right-0 bg-background/95 backdrop-blur-sm border border-input rounded-md shadow-lg min-w-[180px] max-h-[300px] overflow-y-auto">
                  <div className="p-1.5 border-b border-input flex gap-1">
                    <button
                      onClick={selectAllModels}
                      className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                    >
                      All
                    </button>
                    <button
                      onClick={deselectAllModels}
                      className="text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                    >
                      None
                    </button>
                  </div>
                  <div className="p-1">
                    {availableModels.map((model) => {
                      const isSelected = selectedModels.size === 0 || selectedModels.has(model);
                      return (
                        <button
                          key={model}
                          onClick={() => toggleModel(model)}
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
                              <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          <span className="truncate">{model}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex rounded border border-input overflow-hidden">
            <button
              onClick={() => setView("summary")}
              className={cn(
                "text-xs px-2 py-1 transition-colors",
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
                "text-xs px-2 py-1 transition-colors",
                view === "providers"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              Providers
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            Run {totalRuns > 1 ? `1-${runNumbers[runNumbers.length - 1]}` : runNumbers[0] ?? 0} | {totalResponses} providers
          </span>
        </div>
      </div>

      {validTags.length === 0 ? (
        <div className="p-4 border border-input rounded-md bg-background/50">
          <p className="text-sm text-muted-foreground">No tags for this version.</p>
        </div>
      ) : view === "summary" ? (
        <TagsSummaryView tags={validTags} />
      ) : (
        <ProvidersView tags={validTags} />
      )}
    </div>
  );
}

// Model info for tooltip
interface ModelInfo {
  model: string;
  version: string | null;
}

// Tag data with model tracking
interface TagData {
  count: number;
  models: ModelInfo[];
}

// Aggregate data from all providers
function aggregateTagData(tags: PaletteTagResult[]) {
  const validTags = tags.filter(t => t.tags);
  const total = validTags.length;

  const enums = {
    temperature: {} as Record<string, TagData>,
    contrast: {} as Record<string, TagData>,
    brightness: {} as Record<string, TagData>,
    saturation: {} as Record<string, TagData>,
  };

  const arrays = {
    mood: {} as Record<string, TagData>,
    style: {} as Record<string, TagData>,
    dominant_colors: {} as Record<string, TagData>,
    seasonal: {} as Record<string, TagData>,
    associations: {} as Record<string, TagData>,
  };

  const addTag = (record: Record<string, TagData>, key: string, model: string, version: string | null) => {
    if (!record[key]) {
      record[key] = { count: 0, models: [] };
    }
    record[key].count += 1;
    record[key].models.push({ model, version });
  };

  for (const tag of validTags) {
    if (!tag.tags) continue;

    addTag(enums.temperature, tag.tags.temperature, tag.model, tag.promptVersion);
    addTag(enums.contrast, tag.tags.contrast, tag.model, tag.promptVersion);
    addTag(enums.brightness, tag.tags.brightness, tag.model, tag.promptVersion);
    addTag(enums.saturation, tag.tags.saturation, tag.model, tag.promptVersion);

    for (const m of tag.tags.mood) addTag(arrays.mood, m, tag.model, tag.promptVersion);
    for (const s of tag.tags.style) addTag(arrays.style, s, tag.model, tag.promptVersion);
    const colors = tag.tags.dominant_colors ?? tag.tags.color_family ?? [];
    for (const c of colors) addTag(arrays.dominant_colors, c, tag.model, tag.promptVersion);
    for (const s of tag.tags.seasonal) addTag(arrays.seasonal, s, tag.model, tag.promptVersion);
    for (const a of tag.tags.associations) addTag(arrays.associations, a, tag.model, tag.promptVersion);
  }

  return { enums, arrays, total };
}

// Format models for tooltip
function formatModelsTooltip(models: ModelInfo[]): string {
  const grouped = models.reduce((acc, { model, version }) => {
    const key = model;
    if (!acc[key]) acc[key] = { count: 0, versions: new Set<string>() };
    acc[key].count += 1;
    if (version) acc[key].versions.add(version.slice(0, 8));
    return acc;
  }, {} as Record<string, { count: number; versions: Set<string> }>);

  return Object.entries(grouped)
    .map(([model, { count, versions }]) => {
      const versionStr = versions.size > 0 ? ` (${[...versions].join(", ")})` : "";
      return `${model}${count > 1 ? ` ×${count}` : ""}${versionStr}`;
    })
    .join("\n");
}

function TagsSummaryView({ tags }: { tags: PaletteTagResult[] }) {
  const [copied, setCopied] = useState(false);
  const { enums, arrays, total } = aggregateTagData(tags);

  const enumConsensus = Object.values(enums).map(data => {
    const counts = Object.values(data).map(d => d.count);
    const max = counts.length > 0 ? Math.max(...counts) : 0;
    return total > 0 ? max / total : 0;
  });
  const overallConsensus = enumConsensus.length > 0
    ? Math.round((enumConsensus.reduce((a, b) => a + b, 0) / enumConsensus.length) * 100)
    : 0;

  const generateSummaryText = () => {
    const formatTagData = (data: Record<string, TagData>) => {
      return Object.entries(data)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([tag, { count }]) => `${tag} (${count}/${total})`)
        .join(", ");
    };

    const getWinner = (data: Record<string, TagData>) => {
      const entries = Object.entries(data).sort((a, b) => b[1].count - a[1].count);
      const first = entries[0];
      if (!first) return "none";
      const [value, { count }] = first;
      return `${value} (${Math.round((count / total) * 100)}%)`;
    };

    const lines = [
      `# Palette Tag Summary`,
      ``,
      `## Consensus: ${overallConsensus}% (${total} models)`,
      ``,
      `## Categorical Attributes`,
      `- Temperature: ${getWinner(enums.temperature)}`,
      `- Contrast: ${getWinner(enums.contrast)}`,
      `- Brightness: ${getWinner(enums.brightness)}`,
      `- Saturation: ${getWinner(enums.saturation)}`,
      ``,
      `## Descriptive Tags`,
      `- Mood: ${formatTagData(arrays.mood) || "none"}`,
      `- Style: ${formatTagData(arrays.style) || "none"}`,
      `- Dominant Colors: ${formatTagData(arrays.dominant_colors) || "none"}`,
      `- Associations: ${formatTagData(arrays.associations) || "none"}`,
    ];

    if (Object.keys(arrays.seasonal).length > 0) {
      lines.push(`- Seasonal: ${formatTagData(arrays.seasonal)}`);
    }

    return lines.join("\n");
  };

  const copyToClipboard = async () => {
    const text = generateSummaryText();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-3 border border-input rounded-md bg-background/50">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold",
            overallConsensus >= 80 ? "bg-green-500/20 text-green-600 dark:text-green-400" :
            overallConsensus >= 60 ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400" :
            "bg-red-500/20 text-red-600 dark:text-red-400"
          )}>
            {overallConsensus}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Provider Consensus</p>
            <p className="text-xs text-muted-foreground">Agreement on categorical attributes</p>
          </div>
        </div>
        <button
          onClick={copyToClipboard}
          className={cn(
            "text-xs px-2.5 py-1.5 rounded border transition-colors",
            copied
              ? "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400"
              : "border-input bg-background text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
          )}
        >
          {copied ? "Copied!" : "Copy for LLM"}
        </button>
      </div>

      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Categorical Attributes
        </h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <EnumVote label="Temperature" data={enums.temperature} total={total} />
          <EnumVote label="Contrast" data={enums.contrast} total={total} />
          <EnumVote label="Brightness" data={enums.brightness} total={total} />
          <EnumVote label="Saturation" data={enums.saturation} total={total} />
        </div>
      </div>

      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Descriptive Tags
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TagDistribution label="Mood" data={arrays.mood} total={total} />
          <TagDistribution label="Style" data={arrays.style} total={total} />
          <TagDistribution label="Dominant Colors" data={arrays.dominant_colors} total={total} />
          <TagDistribution label="Associations" data={arrays.associations} total={total} />
          {Object.keys(arrays.seasonal).length > 0 && (
            <TagDistribution label="Seasonal" data={arrays.seasonal} total={total} />
          )}
        </div>
      </div>
    </div>
  );
}

function EnumVote({ label, data, total }: { label: string; data: Record<string, TagData>; total: number }) {
  const sorted = Object.entries(data)
    .map(([value, tagData]) => ({ value, count: tagData.count, models: tagData.models, pct: Math.round((tagData.count / total) * 100) }))
    .sort((a, b) => b.count - a.count);

  const winner = sorted[0];
  if (!winner) return null;

  const isUnanimous = winner.count === total;

  return (
    <div className="border border-input rounded-md p-3 bg-background/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {isUnanimous && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-600 dark:text-green-400">
            unanimous
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="text-lg font-semibold text-foreground capitalize cursor-help"
          title={formatModelsTooltip(winner.models)}
        >
          {winner.value}
        </span>
        <span className={cn(
          "text-sm font-medium",
          winner.pct >= 80 ? "text-green-600 dark:text-green-400" :
          winner.pct >= 60 ? "text-yellow-600 dark:text-yellow-400" :
          "text-muted-foreground"
        )}>
          {winner.pct}%
        </span>
      </div>

      <div className="h-2 rounded-full overflow-hidden flex bg-muted">
        {sorted.map(({ value, pct, models }, i) => (
          <div
            key={value}
            className={cn(
              "h-full transition-all cursor-help",
              i === 0 ? "bg-green-500" :
              i === 1 ? "bg-yellow-500" :
              "bg-red-400"
            )}
            style={{ width: `${pct}%` }}
            title={`${value}: ${pct}%\n${formatModelsTooltip(models)}`}
          />
        ))}
      </div>

      {!isUnanimous && sorted.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {sorted.slice(1).map(({ value, count, models }) => (
            <span
              key={value}
              className="text-[10px] text-muted-foreground cursor-help"
              title={formatModelsTooltip(models)}
            >
              {value}: {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TagDistribution({ label, data, total }: { label: string; data: Record<string, TagData>; total: number }) {
  const sorted = Object.entries(data)
    .map(([tag, tagData]) => ({ tag, count: tagData.count, models: tagData.models, pct: Math.round((tagData.count / total) * 100) }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length === 0) return null;

  const consensusTags = sorted.filter(t => t.pct > 50);

  return (
    <div className="border border-input rounded-md p-4 bg-background/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          {sorted.length} unique
        </span>
      </div>

      {consensusTags.length > 0 && (
        <div className="mb-3 pb-3 border-b border-input">
          <div className="flex flex-wrap gap-1.5">
            {consensusTags.map(({ tag, count, models }) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-500/15 text-green-700 dark:text-green-400 text-xs font-medium cursor-help"
                title={formatModelsTooltip(models)}
              >
                {tag}
                <span className="text-green-600/70 dark:text-green-400/70">{count}/{total}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {sorted.slice(0, 8).map(({ tag, count, pct, models }) => (
          <div key={tag} className="flex items-center gap-2 cursor-help" title={formatModelsTooltip(models)}>
            <span className="text-xs text-muted-foreground w-24 truncate shrink-0">
              {tag}
            </span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  pct > 50 ? "bg-green-500" :
                  pct >= 25 ? "bg-primary/60" :
                  "bg-primary/30"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">
              {count}/{total}
            </span>
          </div>
        ))}
      </div>

      {sorted.length > 8 && (
        <div className="mt-3 pt-2 border-t border-input">
          <div className="flex flex-wrap gap-1">
            {sorted.slice(8).map(({ tag, count, models }) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground cursor-help"
                title={`${count}/${total}\n${formatModelsTooltip(models)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProvidersView({ tags }: { tags: PaletteTagResult[] }) {
  return (
    <div className="space-y-3">
      {tags.map((tag) => (
        <TagCard key={tag.id} tag={tag} />
      ))}
    </div>
  );
}

function TagCard({ tag }: { tag: PaletteTagResult }) {
  if (tag.error) {
    return (
      <div className="p-3 border border-destructive/30 rounded-md bg-destructive/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground">{tag.provider}</span>
          <div className="flex items-center gap-2">
            {tag.promptVersion && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                {tag.promptVersion.slice(0, 8)}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{tag.model}</span>
          </div>
        </div>
        <p className="text-xs text-destructive">{tag.error}</p>
      </div>
    );
  }

  if (!tag.tags) {
    return null;
  }

  return (
    <div className="p-3 border border-input rounded-md bg-background/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-foreground">{tag.provider}</span>
        <div className="flex items-center gap-2">
          {tag.promptVersion && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
              {tag.promptVersion.slice(0, 8)}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{tag.model}</span>
        </div>
      </div>

      <div className="space-y-2">
        <TagRow label="Mood" values={tag.tags.mood} />
        <TagRow label="Style" values={tag.tags.style} />
        <TagRow label="Colors" values={tag.tags.dominant_colors ?? tag.tags.color_family ?? []} />
        <TagRow label="Seasonal" values={tag.tags.seasonal} />
        <TagRow label="Associations" values={tag.tags.associations} />

        <div className="flex flex-wrap gap-2 pt-2 border-t border-input">
          <TagBadge label="Temp" value={tag.tags.temperature} />
          <TagBadge label="Contrast" value={tag.tags.contrast} />
          <TagBadge label="Brightness" value={tag.tags.brightness} />
          <TagBadge label="Saturation" value={tag.tags.saturation} />
        </div>
      </div>
    </div>
  );
}

function TagRow({ label, values }: { label: string; values: string[] }) {
  if (!values || values.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 items-center">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}:</span>
      <div className="flex flex-wrap gap-1">
        {values.map((value, i) => (
          <span
            key={i}
            className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function TagBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
      {label}: {value}
    </span>
  );
}
