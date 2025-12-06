import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, Tag, Sparkles, Database, RefreshCw, Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme";

interface TaggingStatus {
  currentRun: number;
  promptVersion: string;
  totalSeeds: number;
  completedThisRun: number;
  pendingThisRun: number;
  providersPerSeed: number;
}

interface RefinementStatus {
  sourcePromptVersion: string;
  refinementPromptVersion: string;
  totalTagged: number;
  refined: number;
  pending: number;
  errors: number;
}

interface GenerationResult {
  runNumber: number;
  processed: number;
  successful: number;
  failed: number;
}

interface BatchSubmitResult {
  batchId?: string;
  seedCount?: number;
  seedMapping?: Record<string, string>;
  message?: string;
}

interface BatchStatusResult {
  status: string;
  requestCounts?: {
    succeeded?: number;
    errored?: number;
    processing?: number;
  };
}

interface BatchProcessResult {
  processed: number;
  stored: number;
  errors: number;
}

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <StatusPanel />
          <RefinementStatusPanel />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <TagGenerationPanel />
          <BatchRefinementPanel />
        </div>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-border px-6 py-4">
      <div className="mx-auto max-w-6xl flex items-center justify-between">
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
            className="text-sm font-medium text-foreground"
          >
            Dashboard
          </Link>
          <Link
            to="/tags"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Tag Viewer
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

function StatusPanel() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tagging-status"],
    queryFn: async (): Promise<TaggingStatus> => {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json() as Promise<TaggingStatus>;
    },
    refetchInterval: 30000,
  });

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">Tagging Status</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Failed to load status</p>
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <StatusRow label="Current Run" value={data?.currentRun ?? 0} />
          <StatusRow label="Prompt Version" value={data?.promptVersion?.slice(0, 8) ?? "—"} mono />
          <StatusRow label="Total Seeds" value={data?.totalSeeds ?? 0} />
          <StatusRow label="Completed" value={data?.completedThisRun ?? 0} highlight="green" />
          <StatusRow label="Pending" value={data?.pendingThisRun ?? 0} highlight={(data?.pendingThisRun ?? 0) > 0 ? "yellow" : undefined} />
          <StatusRow label="Providers/Seed" value={data?.providersPerSeed ?? 0} />
        </div>
      )}
    </div>
  );
}

function RefinementStatusPanel() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["refinement-status"],
    queryFn: async (): Promise<RefinementStatus> => {
      const res = await fetch("/api/refine/status");
      if (!res.ok) throw new Error("Failed to fetch refinement status");
      return res.json() as Promise<RefinementStatus>;
    },
    refetchInterval: 30000,
  });

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">Refinement Status</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Failed to load status</p>
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <StatusRow label="Source Version" value={data?.sourcePromptVersion?.slice(0, 8) ?? "—"} mono />
          <StatusRow label="Refinement Version" value={data?.refinementPromptVersion ?? "—"} mono />
          <StatusRow label="Total Tagged" value={data?.totalTagged ?? 0} />
          <StatusRow label="Refined" value={data?.refined ?? 0} highlight="green" />
          <StatusRow label="Pending" value={data?.pending ?? 0} highlight={(data?.pending ?? 0) > 0 ? "yellow" : undefined} />
          <StatusRow label="Errors" value={data?.errors ?? 0} highlight={(data?.errors ?? 0) > 0 ? "red" : undefined} />
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

function TagGenerationPanel() {
  const queryClient = useQueryClient();
  const [logs, setLogs] = useState<string[]>([]);

  const generateMutation = useMutation({
    mutationFn: async (): Promise<GenerationResult> => {
      setLogs(["Starting tag generation..."]);
      const res = await fetch("/api/generate", { method: "POST" });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || "Generation failed");
      }
      return res.json() as Promise<GenerationResult>;
    },
    onSuccess: (data: GenerationResult) => {
      setLogs((prev) => [
        ...prev,
        `Run ${data.runNumber}: Processed ${data.processed} seeds`,
        `Successful: ${data.successful}, Failed: ${data.failed}`,
      ]);
      queryClient.invalidateQueries({ queryKey: ["tagging-status"] });
    },
    onError: (error: Error) => {
      setLogs((prev) => [...prev, `Error: ${error.message}`]);
    },
  });

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Tag className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-foreground">Tag Generation</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Generate AI tags for pending palettes using multi-model consensus.
      </p>

      <Button
        onClick={() => generateMutation.mutate()}
        disabled={generateMutation.isPending}
        className="w-full"
      >
        {generateMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Generating...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Generate Tags
          </>
        )}
      </Button>

      {logs.length > 0 && (
        <div className="mt-4 p-3 bg-muted/50 rounded-md">
          <div className="space-y-1 font-mono text-xs">
            {logs.map((log, i) => (
              <div key={i} className="text-muted-foreground">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BatchRefinementPanel() {
  const queryClient = useQueryClient();
  const [batchId, setBatchId] = useState<string | null>(null);
  const [seedMapping, setSeedMapping] = useState<Record<string, string> | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [limit, setLimit] = useState(10);

  const submitMutation = useMutation({
    mutationFn: async (): Promise<BatchSubmitResult> => {
      setLogs(["Submitting batch refinement..."]);
      const res = await fetch("/api/refine/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || "Submission failed");
      }
      return res.json() as Promise<BatchSubmitResult>;
    },
    onSuccess: (data: BatchSubmitResult) => {
      if (data.message && !data.batchId) {
        setLogs((prev) => [...prev, data.message!]);
        return;
      }
      setBatchId(data.batchId ?? null);
      setSeedMapping(data.seedMapping ?? null);
      setLogs((prev) => [
        ...prev,
        `Batch ${data.batchId} submitted with ${data.seedCount} seeds`,
        "Polling for completion...",
      ]);
    },
    onError: (error: Error) => {
      setLogs((prev) => [...prev, `Error: ${error.message}`]);
    },
  });

  const { data: batchStatus } = useQuery({
    queryKey: ["batch-status", batchId],
    queryFn: async (): Promise<BatchStatusResult> => {
      const res = await fetch(`/api/refine/batch/${batchId}`);
      if (!res.ok) throw new Error("Failed to check batch status");
      return res.json() as Promise<BatchStatusResult>;
    },
    enabled: !!batchId,
    refetchInterval: (query) => {
      const status = (query.state.data as BatchStatusResult | undefined)?.status;
      return status === "ended" ? false : 5000;
    },
  });

  const processMutation = useMutation({
    mutationFn: async (): Promise<BatchProcessResult> => {
      setLogs((prev) => [...prev, "Processing batch results..."]);
      const res = await fetch(`/api/refine/batch/${batchId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seedMapping }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || "Processing failed");
      }
      return res.json() as Promise<BatchProcessResult>;
    },
    onSuccess: (data: BatchProcessResult) => {
      setLogs((prev) => [
        ...prev,
        `Processed: ${data.processed}, Stored: ${data.stored}, Errors: ${data.errors}`,
      ]);
      setBatchId(null);
      setSeedMapping(null);
      queryClient.invalidateQueries({ queryKey: ["refinement-status"] });
    },
    onError: (error: Error) => {
      setLogs((prev) => [...prev, `Error: ${error.message}`]);
    },
  });

  const isReady = batchStatus?.status === "ended";

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-foreground">Batch Refinement</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Submit palettes to Opus 4.5 for tag refinement (50% cost savings with batch API).
      </p>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-muted-foreground">Limit:</label>
        <input
          type="number"
          min={1}
          max={100}
          value={limit}
          onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
          className="w-20 px-2 py-1 text-sm border border-input rounded bg-background"
          disabled={!!batchId}
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending || !!batchId}
          className="flex-1"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            "Submit Batch"
          )}
        </Button>

        <Button
          onClick={() => processMutation.mutate()}
          disabled={!isReady || processMutation.isPending}
          variant="outline"
          className="flex-1"
        >
          {processMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Processing...
            </>
          ) : (
            "Process Results"
          )}
        </Button>
      </div>

      {batchId && batchStatus && (
        <div className="mt-4 p-3 bg-muted/50 rounded-md">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Batch Status:</span>
            <span
              className={cn(
                "font-medium",
                batchStatus.status === "ended"
                  ? "text-green-600 dark:text-green-400"
                  : "text-yellow-600 dark:text-yellow-400"
              )}
            >
              {batchStatus.status}
            </span>
          </div>
          {batchStatus.requestCounts && (
            <div className="mt-2 text-xs text-muted-foreground space-y-1">
              <div>Succeeded: {batchStatus.requestCounts.succeeded ?? 0}</div>
              <div>Errored: {batchStatus.requestCounts.errored ?? 0}</div>
              <div>Processing: {batchStatus.requestCounts.processing ?? 0}</div>
            </div>
          )}
        </div>
      )}

      {logs.length > 0 && (
        <div className="mt-4 p-3 bg-muted/50 rounded-md">
          <div className="space-y-1 font-mono text-xs">
            {logs.map((log, i) => (
              <div key={i} className="text-muted-foreground">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
