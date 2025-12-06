import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Model, Provider } from "../../../convex/lib/providers.types";
import { useState, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import {
  Sparkles,
  Database,
  Loader2,
  Play,
  Settings,
  X,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
        <SeedButton />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <BackfillControlPanel />
        <RefinementStatusPanel />
      </div>
    </div>
  );
}

function SeedButton() {
  const paletteCount = useQuery(api.seed.getPaletteCount, {});
  const importFromD1 = useAction(api.seed.importFromD1);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleImport = async () => {
    setIsImporting(true);
    setMessage(null);
    try {
      const result = await importFromD1({});
      if (result.imported > 0) {
        setMessage({ type: "success", text: `Added ${result.imported} palettes` });
      } else {
        setMessage({ type: "success", text: "No new palettes" });
      }
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={cn(
          "text-xs",
          message.type === "success" ? "text-green-600 dark:text-green-400" : "text-destructive"
        )}>
          {message.text}
        </span>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {paletteCount?.count ?? "..."} palettes
        </span>
        <button
          onClick={handleImport}
          disabled={isImporting}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5",
            "border border-input bg-background hover:bg-accent",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          )}
        >
          {isImporting ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <Database className="h-3 w-3" />
              Sync D1
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function RefinementStatusPanel() {
  const status = useQuery(api.status.refinementStatus, {});

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Refinement Status</h3>
        </div>
        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Live
        </span>
      </div>

      {status === undefined ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <StatusRow label="Total Palettes" value={status.totalPalettes} />
          <StatusRow label="Tagged" value={status.totalTagged} />
          <StatusRow label="Refined" value={status.refined} highlight="green" />
          <StatusRow label="Pending" value={status.pending} highlight={status.pending > 0 ? "yellow" : undefined} />
          <StatusRow label="Errors" value={status.errors} highlight={status.errors > 0 ? "red" : undefined} />
        </div>
      )}
    </div>
  );
}

function StatusRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  highlight?: "green" | "yellow" | "red";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-medium",
          mono && "font-mono",
          highlight === "green" && "text-green-600 dark:text-green-400",
          highlight === "yellow" && "text-yellow-600 dark:text-yellow-400",
          highlight === "red" && "text-red-600 dark:text-red-400",
          !highlight && "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// --- Config Panel ---

function AnalysisCountSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (count: number) => void;
}) {
  return (
    <div className="mb-4 p-3 rounded-md bg-muted/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Analysis Count</span>
        </div>
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "px-2 py-1 text-sm rounded border border-input bg-background",
            "focus:outline-none focus:ring-2 focus:ring-ring/70"
          )}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Each palette will be tagged {value}× per model
      </p>
    </div>
  );
}

// --- Batches Display ---

function BatchesSection() {
  const allCycles = useQuery(api.backfill.getAllCycles, {});
  const currentCycle = useQuery(api.backfill.getCurrentCycle, {});
  const [selectedCycle, setSelectedCycle] = useState<number | undefined>(undefined);

  // Use selected cycle or default to current
  const effectiveCycle = selectedCycle ?? currentCycle;

  const recentBatches = useQuery(api.backfill.getRecentBatches, {
    limit: 15,
    cycle: effectiveCycle,
  });
  const cancelBatch = useAction(api.backfillActions.cancelBatch);
  const recheckBatch = useAction(api.backfillActions.recheckCancelledBatch);
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null);
  const [recheckingBatchId, setRecheckingBatchId] = useState<string | null>(null);
  const [recheckResult, setRecheckResult] = useState<{ batchId: string; message: string } | null>(null);

  const handleCancel = async (provider: Provider, batchId: string, model?: Model) => {
    setCancellingBatchId(batchId);
    try {
      await cancelBatch({ provider, batchId, model });
    } catch (err) {
      console.error("Failed to cancel batch:", err);
    } finally {
      setCancellingBatchId(null);
    }
  };

  const handleRecheck = async (provider: Provider, batchId: string, model: Model) => {
    setRecheckingBatchId(batchId);
    setRecheckResult(null);
    try {
      const result = await recheckBatch({ provider, batchId, model });
      if (result.status === "partial_results") {
        setRecheckResult({
          batchId,
          message: `Retrieved ${result.successCount} results (${result.failCount} failed)`,
        });
      } else if (result.status === "no_results") {
        setRecheckResult({ batchId, message: "No partial results available" });
      } else if (result.message) {
        setRecheckResult({ batchId, message: result.message });
      }
      setTimeout(() => setRecheckResult(null), 5000);
    } catch (err) {
      console.error("Failed to recheck batch:", err);
      setRecheckResult({ batchId, message: `Error: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setRecheckingBatchId(null);
    }
  };

  if (!recentBatches || recentBatches.length === 0) {
    // Still show cycle selector even if no batches in selected cycle
    if (allCycles && allCycles.length > 1) {
      return (
        <div className="mb-4">
          <CycleSelector
            cycles={allCycles}
            selectedCycle={effectiveCycle}
            onSelectCycle={setSelectedCycle}
          />
          <div className="p-3 rounded-md bg-muted/50 text-center text-sm text-muted-foreground">
            No batches in this cycle
          </div>
        </div>
      );
    }
    return null;
  }

  const activeBatches = recentBatches.filter(
    (b) => b.status === "pending" || b.status === "processing"
  );
  const completedBatches = recentBatches.filter((b) => b.status === "completed");
  const failedBatches = recentBatches.filter((b) => b.status === "failed");

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
      case "processing":
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case "completed":
        return <div className="h-3 w-3 rounded-full bg-green-500" />;
      case "failed":
        return <div className="h-3 w-3 rounded-full bg-red-500" />;
      default:
        return <div className="h-3 w-3 rounded-full bg-gray-400" />;
    }
  };

  const getModelShortName = (model?: string) => {
    // Shorten model names for display
    if (!model) return "unknown";
    if (model.includes("/")) return model.split("/").pop() ?? model;
    return model.replace("-20241022", "").replace("-versatile", "");
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="mb-4">
      {/* Cycle selector */}
      {allCycles && allCycles.length > 1 && (
        <CycleSelector
          cycles={allCycles}
          selectedCycle={effectiveCycle}
          onSelectCycle={setSelectedCycle}
        />
      )}

      {/* Active batches */}
      {activeBatches.length > 0 && (
        <div className="p-3 rounded-md bg-blue-500/10 border border-blue-500/20 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
              {activeBatches.length} Active Batches
            </span>
          </div>
          <div className="space-y-2">
            {activeBatches.map((batch) => (
              <div key={batch.batchId} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    {batch.provider}/{getModelShortName(batch.model)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {batch.completedCount}/{batch.requestCount}
                      {batch.failedCount > 0 && (
                        <span className="text-red-500 ml-1">
                          ({batch.failedCount} failed)
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => handleCancel(batch.provider, batch.batchId, batch.model)}
                      disabled={cancellingBatchId === batch.batchId}
                      className={cn(
                        "p-1 rounded hover:bg-red-500/20 text-red-500",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "transition-colors"
                      )}
                      title="Cancel batch"
                    >
                      {cancellingBatchId === batch.batchId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{
                      width: `${batch.requestCount > 0 ? (batch.completedCount / batch.requestCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors section */}
      <ErrorsSection />

      {/* Recent completed/failed batches */}
      {(completedBatches.length > 0 || failedBatches.length > 0) && (
        <div className="p-3 rounded-md bg-muted/50">
          <span className="text-xs font-medium text-muted-foreground mb-2 block">
            Recent Batches
          </span>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {recentBatches
              .filter((b) => b.status === "completed" || b.status === "failed")
              .slice(0, 10)
              .map((batch) => (
                <div
                  key={batch.batchId}
                  className="flex items-center gap-2 text-xs"
                >
                  {getStatusIcon(batch.status)}
                  <span className="font-medium min-w-[120px]">
                    {batch.provider}/{getModelShortName(batch.model)}
                  </span>
                  <span
                    className={cn(
                      "flex-1",
                      batch.status === "failed"
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {batch.status === "completed"
                      ? `${batch.completedCount} done${batch.failedCount > 0 ? `, ${batch.failedCount} failed` : ""}`
                      : batch.error ?? "Failed"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {batch.completedAt
                        ? formatTime(batch.completedAt)
                        : formatTime(batch.createdAt)}
                    </span>
                    {/* Recheck button for failed Google batches */}
                    {batch.status === "failed" && batch.provider === "google" && batch.model && (
                      <button
                        onClick={() => handleRecheck(batch.provider, batch.batchId, batch.model!)}
                        disabled={recheckingBatchId === batch.batchId}
                        className={cn(
                          "p-1 rounded hover:bg-primary/20 text-primary",
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                          "transition-colors"
                        )}
                        title="Recheck for partial results"
                      >
                        {recheckingBatchId === batch.batchId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
          {/* Recheck result message */}
          {recheckResult && (
            <div className="mt-2 p-2 rounded bg-primary/10 text-primary text-xs">
              {recheckResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Cycle Selector ---

function CycleSelector({
  cycles,
  selectedCycle,
  onSelectCycle,
}: {
  cycles: number[];
  selectedCycle: number | undefined;
  onSelectCycle: (cycle: number | undefined) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentCycle = cycles[0]; // cycles are sorted descending

  return (
    <div className="mb-3" ref={dropdownRef}>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full px-3 py-2 rounded-md text-sm flex items-center justify-between",
            "border border-input bg-background hover:bg-accent",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          )}
        >
          <span>
            Cycle {selectedCycle ?? currentCycle}
            {(selectedCycle ?? currentCycle) === currentCycle && (
              <span className="ml-1 text-xs text-muted-foreground">(latest)</span>
            )}
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-input bg-background shadow-lg max-h-48 overflow-y-auto">
            {cycles.map((cycle) => (
              <button
                key={cycle}
                onClick={() => {
                  onSelectCycle(cycle === currentCycle ? undefined : cycle);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center justify-between",
                  (selectedCycle ?? currentCycle) === cycle && "bg-accent"
                )}
              >
                <span>Cycle {cycle}</span>
                {cycle === currentCycle && (
                  <span className="text-xs text-muted-foreground">latest</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Errors Display ---

function ErrorsSection() {
  const currentCycle = useQuery(api.backfill.getCurrentCycle, {});
  const cyclesWithErrors = useQuery(api.backfill.getCyclesWithErrors, {});
  const [selectedCycle, setSelectedCycle] = useState<number | undefined>(undefined);

  // Auto-select current cycle when it has errors
  const currentCycleHasErrors = cyclesWithErrors?.includes(currentCycle ?? 0) ?? false;
  const effectiveCycle = selectedCycle ?? (currentCycleHasErrors ? currentCycle : undefined);

  const errorsByModel = useQuery(
    api.backfill.getErrorsByModel,
    effectiveCycle !== undefined ? { cycle: effectiveCycle } : { cycle: currentCycle ?? 1 }
  );
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [copiedModel, setCopiedModel] = useState<string | null>(null);

  // Don't render if current cycle has no errors or data not loaded
  if (!cyclesWithErrors || !currentCycleHasErrors) return null;
  if (!errorsByModel || errorsByModel.length === 0) return null;

  const totalErrors = errorsByModel.reduce((sum, m) => sum + m.errorCount, 0);

  const handleCopy = async (model: string, errors: Array<{ seed: string; analysisIndex: number; error: string }>) => {
    const text = errors
      .map((e) => `seed: ${e.seed}, index: ${e.analysisIndex}, error: ${e.error}`)
      .join("\n");

    const cycleLabel = effectiveCycle !== undefined ? ` (Cycle ${effectiveCycle})` : "";
    const fullText = `Errors for ${model}${cycleLabel} (${errors.length} total):\n\n${text}`;

    await navigator.clipboard.writeText(fullText);
    setCopiedModel(model);
    setTimeout(() => setCopiedModel(null), 2000);
  };

  const handleCopyAll = async () => {
    const sections = errorsByModel.map((m) => {
      const errorLines = m.errors
        .map((e) => `  seed: ${e.seed}, index: ${e.analysisIndex}, error: ${e.error}`)
        .join("\n");
      return `${m.model} (${m.errorCount} errors):\n${errorLines}`;
    });

    const cycleLabel = effectiveCycle !== undefined ? ` (Cycle ${effectiveCycle})` : "";
    const fullText = `All Errors${cycleLabel} (${totalErrors} total):\n\n${sections.join("\n\n")}`;

    await navigator.clipboard.writeText(fullText);
    setCopiedModel("all");
    setTimeout(() => setCopiedModel(null), 2000);
  };

  return (
    <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium text-red-700 dark:text-red-400">
            {totalErrors} Errors ({errorsByModel.length} models)
          </span>
          {cyclesWithErrors.length > 1 && (
            <select
              value={effectiveCycle ?? ""}
              onChange={(e) => setSelectedCycle(e.target.value ? Number(e.target.value) : undefined)}
              className={cn(
                "px-1.5 py-0.5 text-xs rounded border border-red-500/30 bg-transparent",
                "text-red-700 dark:text-red-400",
                "focus:outline-none focus:ring-1 focus:ring-red-500/50"
              )}
            >
              {cyclesWithErrors.map((c) => (
                <option key={c} value={c}>
                  Cycle {c}
                </option>
              ))}
            </select>
          )}
          {cyclesWithErrors.length === 1 && (
            <span className="text-xs text-red-600/60 dark:text-red-400/60">
              Cycle {cyclesWithErrors[0]}
            </span>
          )}
        </div>
        <button
          onClick={handleCopyAll}
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-xs rounded",
            "bg-red-500/20 hover:bg-red-500/30 text-red-700 dark:text-red-400",
            "transition-colors"
          )}
        >
          {copiedModel === "all" ? (
            <>
              <Check className="h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy All
            </>
          )}
        </button>
      </div>

      <div className="space-y-1">
        {errorsByModel.map((modelErrors) => (
          <div key={modelErrors.model} className="text-xs">
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setExpandedModel(
                    expandedModel === modelErrors.model ? null : modelErrors.model
                  )
                }
                className="flex items-center gap-1 hover:bg-red-500/10 rounded px-1 py-0.5 transition-colors"
              >
                {expandedModel === modelErrors.model ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="font-medium">{modelErrors.model}</span>
                <span className="text-muted-foreground">
                  ({modelErrors.errorCount})
                </span>
              </button>
              <button
                onClick={() => handleCopy(modelErrors.model, modelErrors.errors)}
                className="p-1 rounded hover:bg-red-500/20 text-red-500 transition-colors"
                title="Copy errors"
              >
                {copiedModel === modelErrors.model ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>

            {expandedModel === modelErrors.model && (
              <div className="ml-4 mt-1 space-y-1 max-h-32 overflow-y-auto">
                {modelErrors.errors.map((err, i) => (
                  <div
                    key={i}
                    className="text-muted-foreground font-mono text-[10px] break-all"
                  >
                    <span className="text-red-500">{err.error}</span>
                    <span className="ml-2 opacity-60">
                      (seed: {err.seed.slice(0, 20)}..., idx: {err.analysisIndex})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BackfillControlPanel() {
  const status = useQuery(api.backfill.getBackfillStatus, {});
  const currentCycle = useQuery(api.backfill.getCurrentCycle, {});
  const providerModels = useQuery(api.backfill.getProviderModels, {});
  const startBackfill = useAction(api.backfillActions.startBackfill);
  const pollBatches = useAction(api.backfillActions.pollActiveBatches);

  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [isNewJobMode, setIsNewJobMode] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [analysisCount, setAnalysisCount] = useState(1);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Auto-poll when there are active batches
  const hasActiveBatches = status && status.activeBatches > 0;

  // Initialize selected models when entering new job mode
  useEffect(() => {
    if (isNewJobMode && providerModels && selectedModels.size === 0) {
      // Select all models by default
      setSelectedModels(new Set(providerModels.models.map((m) => m.model)));
    }
  }, [isNewJobMode, providerModels, selectedModels.size]);

  useEffect(() => {
    if (hasActiveBatches && !pollIntervalRef.current) {
      // Poll every 10 seconds when there are active batches
      const poll = async () => {
        if (isPollingRef.current) return;
        isPollingRef.current = true;
        try {
          await pollBatches({});
        } catch (err) {
          console.error("Auto-poll error:", err);
        } finally {
          isPollingRef.current = false;
        }
      };

      // Initial poll after short delay
      setTimeout(poll, 1000);

      // Set up interval
      pollIntervalRef.current = setInterval(poll, 10000);
    } else if (!hasActiveBatches && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [hasActiveBatches, pollBatches]);

  const handleStartBackfill = async () => {
    setIsStarting(true);
    setError(null);
    setLastResult(null);

    try {
      const modelsToRun = selectedModels.size > 0 ? Array.from(selectedModels) : undefined;
      const result = await startBackfill({ selectedModels: modelsToRun, analysisCount });
      setLastResult(
        `Cycle ${result.cycle}: Started ${result.batchesCreated} batches with ${result.totalRequests.toLocaleString()} requests`
      );
      // Exit new job mode and reset selection after starting
      setIsNewJobMode(false);
      setSelectedModels(new Set());
      setAnalysisCount(1); // Reset to default
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsStarting(false);
    }
  };

  const toggleModel = (model: string) => {
    const newSet = new Set(selectedModels);
    if (newSet.has(model)) {
      newSet.delete(model);
    } else {
      newSet.add(model);
    }
    setSelectedModels(newSet);
  };

  const toggleProvider = (provider: string) => {
    if (!providerModels) return;
    const providerModelNames = providerModels.models
      .filter((m) => m.provider === provider)
      .map((m) => m.model);
    const allSelected = providerModelNames.every((m) => selectedModels.has(m));

    const newSet = new Set(selectedModels);
    if (allSelected) {
      // Deselect all from this provider
      providerModelNames.forEach((m) => newSet.delete(m));
    } else {
      // Select all from this provider
      providerModelNames.forEach((m) => newSet.add(m));
    }
    setSelectedModels(newSet);
  };

  const selectAll = () => {
    if (!providerModels) return;
    setSelectedModels(new Set(providerModels.models.map((m) => m.model)));
  };

  const selectNone = () => {
    setSelectedModels(new Set());
  };

  const isLoading = status === undefined;

  // New Job Mode UI
  if (isNewJobMode) {
    const modelsByProvider: Record<string, Array<{ provider: string; model: string }>> = {};
    if (providerModels) {
      for (const m of providerModels.models) {
        if (!modelsByProvider[m.provider]) {
          modelsByProvider[m.provider] = [];
        }
        modelsByProvider[m.provider].push(m);
      }
    }

    const getModelShortName = (model: string) => {
      if (model.includes("/")) return model.split("/").pop() ?? model;
      return model.replace("-20241022", "").replace("-versatile", "");
    };

    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsNewJobMode(false);
                setSelectedModels(new Set());
                setError(null);
              }}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <Database className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">New Job</h3>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={selectAll}
              className="text-primary hover:underline"
            >
              All
            </button>
            <span className="text-muted-foreground">/</span>
            <button
              onClick={selectNone}
              className="text-primary hover:underline"
            >
              None
            </button>
          </div>
        </div>

        {/* Analysis Count */}
        <AnalysisCountSelector value={analysisCount} onChange={setAnalysisCount} />

        {/* Model Selection */}
        <div className="space-y-3 mb-4">
          {Object.entries(modelsByProvider).map(([provider, models]) => {
            const allSelected = models.every((m) => selectedModels.has(m.model));
            const someSelected = models.some((m) => selectedModels.has(m.model));

            return (
              <div key={provider} className="p-3 rounded-md bg-muted/50">
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected;
                    }}
                    onChange={() => toggleProvider(provider)}
                    className="rounded border-input"
                  />
                  <span className="text-sm font-medium capitalize">{provider}</span>
                  <span className="text-xs text-muted-foreground">
                    ({models.filter((m) => selectedModels.has(m.model)).length}/{models.length})
                  </span>
                </label>
                <div className="ml-6 space-y-1">
                  {models.map((m) => (
                    <label
                      key={m.model}
                      className="flex items-center gap-2 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selectedModels.has(m.model)}
                        onChange={() => toggleModel(m.model)}
                        className="rounded border-input"
                      />
                      <span className="text-muted-foreground">
                        {getModelShortName(m.model)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartBackfill}
          disabled={isStarting || selectedModels.size === 0}
          className={cn(
            "w-full px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          )}
        >
          {isStarting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Start Job ({selectedModels.size} models)
            </>
          )}
        </button>

        {/* Error display */}
        {error && (
          <div className="mt-3 p-2 rounded bg-destructive/10 text-destructive text-xs">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Normal Mode UI
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Backfill Tags</h3>
          {currentCycle !== undefined && currentCycle > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              Cycle {currentCycle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveBatches && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              {status.activeBatches} active
            </span>
          )}
          <button
            onClick={() => setIsNewJobMode(true)}
            disabled={hasActiveBatches}
            className={cn(
              "px-2 py-1 rounded text-xs font-medium flex items-center gap-1",
              "border border-input bg-background hover:bg-accent",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            )}
          >
            <Plus className="h-3 w-3" />
            New Job
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : (
        <>
          {/* Batches */}
          <BatchesSection />

          {/* Result/Error display */}
          {lastResult && (
            <div className="mt-3 p-2 rounded bg-green-500/10 text-green-700 dark:text-green-400 text-xs">
              {lastResult}
            </div>
          )}
          {error && (
            <div className="mt-3 p-2 rounded bg-destructive/10 text-destructive text-xs">
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
