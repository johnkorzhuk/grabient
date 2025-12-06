import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
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

function ConfigPanel() {
  const config = useQuery(api.config.get, {});
  const setAnalysisCount = useMutation(api.config.setTagAnalysisCount);
  const [localCount, setLocalCount] = useState<number | null>(null);

  useEffect(() => {
    if (config && localCount === null) {
      setLocalCount(config.tagAnalysisCount);
    }
  }, [config, localCount]);

  const handleSave = async () => {
    if (localCount !== null) {
      await setAnalysisCount({ count: localCount });
    }
  };

  const hasChanges = config && localCount !== config.tagAnalysisCount;

  return (
    <div className="mb-4 p-3 rounded-md bg-muted/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Analysis Count</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={localCount ?? 1}
            onChange={(e) => setLocalCount(Number(e.target.value))}
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
          {hasChanges && (
            <button
              onClick={handleSave}
              className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Each palette will be tagged {localCount ?? 1}× per provider
      </p>
    </div>
  );
}

// --- Batches Display ---

function BatchesSection() {
  const recentBatches = useQuery(api.backfill.getRecentBatches, { limit: 15 });
  const cancelBatch = useAction(api.backfillActions.cancelBatch);
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(null);

  const handleCancel = async (provider: string, batchId: string, model: string) => {
    setCancellingBatchId(batchId);
    try {
      await cancelBatch({ provider, batchId, model });
    } catch (err) {
      console.error("Failed to cancel batch:", err);
    } finally {
      setCancellingBatchId(null);
    }
  };

  if (!recentBatches || recentBatches.length === 0) return null;

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

  const getModelShortName = (model: string) => {
    // Shorten model names for display
    if (model.includes("/")) return model.split("/").pop() ?? model;
    return model.replace("-20241022", "").replace("-versatile", "");
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="mb-4">
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
                  <span className="text-muted-foreground">
                    {batch.completedAt
                      ? formatTime(batch.completedAt)
                      : formatTime(batch.createdAt)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
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
  const startBackfill = useAction(api.backfillActions.startBackfill);
  const pollBatches = useAction(api.backfillActions.pollActiveBatches);

  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Auto-poll when there are active batches
  const hasActiveBatches = status && status.activeBatches > 0;

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
      const result = await startBackfill({});
      setLastResult(
        `Cycle ${result.cycle}: Started ${result.batchesCreated} batches with ${result.totalRequests.toLocaleString()} requests`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsStarting(false);
    }
  };

  const isLoading = status === undefined;

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
        {hasActiveBatches && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            {status.activeBatches} active
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : (
        <>
          {/* Config */}
          <ConfigPanel />

          {/* Batches */}
          <BatchesSection />

          {/* Controls */}
          <button
            onClick={handleStartBackfill}
            disabled={isStarting || hasActiveBatches}
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
                Start Backfill
              </>
            )}
          </button>

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
