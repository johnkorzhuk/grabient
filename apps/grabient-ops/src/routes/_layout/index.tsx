import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useAction, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type {
  Model,
  Provider,
  RefinementModel,
} from '../../../convex/lib/providers.types'
import {
  REFINEMENT_MODELS,
  REFINEMENT_MODEL_PROVIDER,
} from '../../../convex/lib/providers.types'
import { useState, useEffect, useRef } from 'react'
import { cn } from '~/lib/utils'
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
  Trash2,
} from 'lucide-react'

export const Route = createFileRoute('/_layout/')({
  component: Dashboard,
})

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
  )
}

function SeedButton() {
  const paletteCount = useQuery(api.seed.getPaletteCount, {})
  const importFromD1 = useAction(api.seed.importFromD1)
  const [isImporting, setIsImporting] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const handleImport = async () => {
    setIsImporting(true)
    setMessage(null)
    try {
      const result = await importFromD1({})
      if (result.imported > 0) {
        setMessage({
          type: 'success',
          text: `Added ${result.imported} palettes`,
        })
      } else {
        setMessage({ type: 'success', text: 'No new palettes' })
      }
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Import failed',
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span
          className={cn(
            'text-xs',
            message.type === 'success'
              ? 'text-green-600 dark:text-green-400'
              : 'text-destructive',
          )}
        >
          {message.text}
        </span>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {paletteCount?.count ?? '...'} palettes
        </span>
        <button
          onClick={handleImport}
          disabled={isImporting}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5',
            'border border-input bg-background hover:bg-accent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
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
  )
}

function RefinementStatusPanel() {
  const status = useQuery(api.refinement.getRefinementStatus, {})
  const currentCycle = useQuery(api.refinement.getCurrentRefinementCycle, {})
  const recentBatches = useQuery(api.refinement.getRecentRefinementBatches, {
    limit: 10,
  })
  const availableVersions = useQuery(api.refinement.getAvailablePromptVersions, {})
  const startRefinement = useAction(api.refinementActions.startRefinement)
  const pollBatches = useAction(
    api.refinementActions.pollActiveRefinementBatches,
  )
  const cancelRefinement = useAction(api.refinementActions.cancelRefinement)
  const clearFailedRefinements = useMutation(api.refinement.clearFailedRefinements)

  const [isStarting, setIsStarting] = useState(false)
  const [clearingModel, setClearingModel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(
    null,
  )
  const [isNewJobMode, setIsNewJobMode] = useState(false)
  const [selectedModels, setSelectedModels] = useState<Set<RefinementModel>>(
    new Set(),
  )
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set())
  const [copiedErrorId, setCopiedErrorId] = useState<string | null>(null)
  const [expandedErrorModel, setExpandedErrorModel] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef(false)

  // Initialize selected models and versions when entering new job mode
  useEffect(() => {
    if (isNewJobMode && selectedModels.size === 0) {
      // Select all models by default
      setSelectedModels(new Set(REFINEMENT_MODELS))
    }
    if (isNewJobMode && selectedVersions.size === 0 && availableVersions && availableVersions.length > 0) {
      // Select only the latest version by default (first in sorted list)
      setSelectedVersions(new Set([availableVersions[0].version]))
    }
  }, [isNewJobMode, selectedModels.size, selectedVersions.size, availableVersions])

  const hasActiveBatches = status && status.activeBatches > 0

  // Auto-poll when there are active batches
  useEffect(() => {
    if (hasActiveBatches && !pollIntervalRef.current) {
      const poll = async () => {
        if (isPollingRef.current) return
        isPollingRef.current = true
        try {
          await pollBatches({})
        } catch (err) {
          console.error('Refinement poll error:', err)
        } finally {
          isPollingRef.current = false
        }
      }

      setTimeout(poll, 1000)
      pollIntervalRef.current = setInterval(poll, 10000)
    } else if (!hasActiveBatches && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [hasActiveBatches, pollBatches])

  const handleStartRefinement = async () => {
    if (selectedModels.size === 0) {
      setError('Please select at least one model')
      return
    }

    if (selectedVersions.size === 0) {
      setError('Please select at least one tag analysis version')
      return
    }

    setIsStarting(true)
    setError(null)
    setLastResult(null)

    try {
      const modelsArray = Array.from(selectedModels)
      const versionsArray = Array.from(selectedVersions)
      const results: Array<{
        model: RefinementModel
        cycle: number
        batchId: string | null
        requestCount: number
      }> = []

      // Submit batches for all selected models in parallel
      const promises = modelsArray.map(async (model) => {
        const result = await startRefinement({
          model,
          sourcePromptVersions: versionsArray,
        })
        return { model, ...result }
      })

      const allResults = await Promise.all(promises)
      results.push(...allResults)

      // Summarize results
      const successfulBatches = results.filter((r) => r.batchId)
      if (successfulBatches.length > 0) {
        const totalRequests = successfulBatches.reduce(
          (sum, r) => sum + r.requestCount,
          0,
        )
        const modelNames = successfulBatches
          .map((r) => getModelShortName(r.model))
          .join(', ')
        setLastResult(
          `Cycle ${successfulBatches[0].cycle}: Started ${successfulBatches.length} batch${successfulBatches.length > 1 ? 'es' : ''} (${modelNames}) with ${totalRequests} requests`,
        )
        setIsNewJobMode(false)
        setSelectedModels(new Set())
        setSelectedVersions(new Set())
      } else {
        setLastResult(`No palettes need refinement`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStarting(false)
    }
  }

  const handleCancel = async (batchId: string, model: string) => {
    setCancellingBatchId(batchId)
    try {
      await cancelRefinement({ batchId, model: model as any })
    } catch (err) {
      console.error('Failed to cancel refinement batch:', err)
    } finally {
      setCancellingBatchId(null)
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const copyError = async (batchId: string, error: string, model: string) => {
    const errorText = `Batch: ${batchId}\nModel: ${model}\nError: ${error}`
    await navigator.clipboard.writeText(errorText)
    setCopiedErrorId(batchId)
    setTimeout(() => setCopiedErrorId(null), 2000)
  }

  const copyAllErrors = async (model: string, errors: Array<{ seed: string; error: string }>) => {
    const errorText = `Model: ${model}\n\nFailed Refinements (${errors.length}):\n\n` +
      errors.map((e) => `Seed: ${e.seed}\nError: ${e.error}`).join('\n\n---\n\n')
    await navigator.clipboard.writeText(errorText)
    setCopiedErrorId(`all-${model}`)
    setTimeout(() => setCopiedErrorId(null), 2000)
  }

  // Query for expanded error details
  const failedErrors = useQuery(
    api.refinement.getFailedRefinementErrors,
    expandedErrorModel ? { model: expandedErrorModel as RefinementModel, limit: 50 } : 'skip'
  )

  const handleClearFailed = async (model: string) => {
    setClearingModel(model)
    try {
      const result = await clearFailedRefinements({ model: model as RefinementModel })
      setLastResult(`Cleared ${result.deleted} failed records for ${getModelShortName(model)}`)
      setExpandedErrorModel(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setClearingModel(null)
    }
  }

  const toggleModel = (model: RefinementModel) => {
    const newSet = new Set(selectedModels)
    if (newSet.has(model)) {
      newSet.delete(model)
    } else {
      newSet.add(model)
    }
    setSelectedModels(newSet)
  }

  const toggleProvider = (provider: 'anthropic' | 'openai' | 'groq' | 'google') => {
    const providerModelNames = REFINEMENT_MODELS.filter(
      (m) => REFINEMENT_MODEL_PROVIDER[m] === provider,
    )
    const allSelected = providerModelNames.every((m) => selectedModels.has(m))

    const newSet = new Set(selectedModels)
    if (allSelected) {
      // Deselect all from this provider
      providerModelNames.forEach((m) => newSet.delete(m))
    } else {
      // Select all from this provider
      providerModelNames.forEach((m) => newSet.add(m))
    }
    setSelectedModels(newSet)
  }

  const selectAllModels = () => {
    setSelectedModels(new Set(REFINEMENT_MODELS))
  }

  const selectNoModels = () => {
    setSelectedModels(new Set())
  }

  const toggleVersion = (version: string) => {
    const newSet = new Set(selectedVersions)
    if (newSet.has(version)) {
      newSet.delete(version)
    } else {
      newSet.add(version)
    }
    setSelectedVersions(newSet)
  }

  const selectAllVersions = () => {
    if (availableVersions) {
      setSelectedVersions(new Set(availableVersions.map((v) => v.version)))
    }
  }

  const selectNoVersions = () => {
    setSelectedVersions(new Set())
  }

  const getModelShortName = (model: string) => {
    // Map long model names to short display names
    const shortNames: Record<string, string> = {
      'claude-opus-4-5-20251101': 'opus-4.5',
      'gpt-5-mini': 'gpt-5-mini',
      'gpt-4.1-mini': 'gpt-4.1-mini',
      'qwen/qwen3-32b': 'qwen3-32b',
      'openai/gpt-oss-120b': 'gpt-oss-120b',
      'moonshotai/kimi-k2-instruct': 'kimi-k2',
    }
    return shortNames[model] ?? model
  }

  const activeBatches =
    recentBatches?.filter(
      (b) => b.status === 'pending' || b.status === 'processing',
    ) ?? []
  const completedBatches =
    recentBatches?.filter(
      (b) => b.status === 'completed' || b.status === 'failed',
    ) ?? []

  const isLoading = status === undefined

  // New Job Mode UI
  if (isNewJobMode) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsNewJobMode(false)
                setSelectedModels(new Set())
                setSelectedVersions(new Set())
                setError(null)
              }}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">
              New Refinement Job
            </h3>
          </div>
        </div>

        {/* Tag Analysis Versions Selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Tag Analysis Versions</span>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={selectAllVersions}
                className="text-primary hover:underline"
              >
                All
              </button>
              <span className="text-muted-foreground">/</span>
              <button
                onClick={selectNoVersions}
                className="text-primary hover:underline"
              >
                None
              </button>
            </div>
          </div>
          <div className="p-3 rounded-md bg-muted/50 space-y-1.5 max-h-40 overflow-y-auto">
            {availableVersions && availableVersions.length > 0 ? (
              availableVersions.map((v, idx) => (
                <label
                  key={v.version}
                  className="flex items-center justify-between gap-2 cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedVersions.has(v.version)}
                      onChange={() => toggleVersion(v.version)}
                      className="rounded border-input"
                    />
                    <span className="font-mono text-muted-foreground">
                      {v.version.slice(0, 12)}...
                    </span>
                    {idx === 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded">
                        latest
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>{v.tagCount.toLocaleString()} tags</span>
                  </div>
                </label>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No tag analysis data available</span>
            )}
          </div>
        </div>

        {/* Model Selection */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Refinement Models</span>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={selectAllModels}
                className="text-primary hover:underline"
              >
                All
              </button>
              <span className="text-muted-foreground">/</span>
              <button
                onClick={selectNoModels}
                className="text-primary hover:underline"
              >
                None
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {(['anthropic', 'openai', 'groq', 'google'] as const).map((provider) => {
              const providerModelsList = REFINEMENT_MODELS.filter(
                (m) => REFINEMENT_MODEL_PROVIDER[m] === provider,
              )
              if (providerModelsList.length === 0) return null

              const allSelected = providerModelsList.every((m) =>
                selectedModels.has(m),
              )
              const someSelected = providerModelsList.some((m) =>
                selectedModels.has(m),
              )

              return (
                <div key={provider} className="p-3 rounded-md bg-muted/50">
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected
                      }}
                      onChange={() => toggleProvider(provider)}
                      className="rounded border-input"
                    />
                    <span className="text-sm font-medium capitalize">
                      {provider}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (
                      {
                        providerModelsList.filter((m) => selectedModels.has(m))
                          .length
                      }
                      /{providerModelsList.length})
                    </span>
                  </label>
                  <div className="ml-6 space-y-1">
                    {providerModelsList.map((model) => (
                      <label
                        key={model}
                        className="flex items-center gap-2 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={selectedModels.has(model)}
                          onChange={() => toggleModel(model)}
                          className="rounded border-input"
                        />
                        <span className="text-muted-foreground">
                          {getModelShortName(model)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pending count */}
        {status && (
          <div className="mb-4 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-center justify-between text-sm">
              <span className="text-yellow-700 dark:text-yellow-400">
                Palettes pending refinement
              </span>
              <span className="font-medium text-yellow-700 dark:text-yellow-400">
                {status.pending}
              </span>
            </div>
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStartRefinement}
          disabled={isStarting || selectedModels.size === 0 || selectedVersions.size === 0}
          className={cn(
            'w-full px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
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
              Start Refinement ({selectedModels.size} model{selectedModels.size !== 1 ? 's' : ''}, {selectedVersions.size} version{selectedVersions.size !== 1 ? 's' : ''})
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
    )
  }

  // Normal Mode UI
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Tag Refinement</h3>
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
              'px-2 py-1 rounded text-xs font-medium flex items-center gap-1',
              'border border-input bg-background hover:bg-accent',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
            )}
          >
            <Plus className="h-3 w-3" />
            New Job
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : (
        <>
          {/* Status counts */}
          <div className="space-y-2 mb-4">
            <StatusRow
              label="Tagged Palettes"
              value={status.palettesWithTags}
            />
            <StatusRow
              label="Refined"
              value={status.refined}
              highlight="green"
            />
            <StatusRow
              label="Pending"
              value={status.pending}
              highlight={status.pending > 0 ? 'yellow' : undefined}
            />
            <StatusRow
              label="Errors"
              value={status.errors}
              highlight={status.errors > 0 ? 'red' : undefined}
            />
          </div>

          {/* Active batches */}
          {activeBatches.length > 0 && (
            <div className="p-3 rounded-md bg-blue-500/10 border border-blue-500/20 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                  {activeBatches.length} Active Batch
                  {activeBatches.length > 1 ? 'es' : ''}
                </span>
              </div>
              <div className="space-y-2">
                {activeBatches.map((batch) => (
                  <div key={batch.batchId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">
                        {getModelShortName(batch.model)}
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
                          onClick={() =>
                            handleCancel(batch.batchId, batch.model)
                          }
                          disabled={cancellingBatchId === batch.batchId}
                          className={cn(
                            'p-1 rounded hover:bg-red-500/20 text-red-500',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            'transition-colors',
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

          {/* Recent completed/failed batches */}
          {completedBatches.length > 0 && (
            <div className="p-3 rounded-md bg-muted/50">
              <span className="text-xs font-medium text-muted-foreground mb-2 block">
                Recent Batches
              </span>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {completedBatches.slice(0, 5).map((batch) => (
                  <div
                    key={batch.batchId}
                    className="flex items-center gap-2 text-xs"
                  >
                    {batch.status === 'completed' ? (
                      <div className="h-3 w-3 rounded-full bg-green-500" />
                    ) : (
                      <div className="h-3 w-3 rounded-full bg-red-500" />
                    )}
                    <span className="font-medium min-w-[60px]">
                      {getModelShortName(batch.model)}
                    </span>
                    <span
                      className={cn(
                        'flex-1 truncate',
                        batch.status === 'failed'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-muted-foreground',
                      )}
                      title={batch.error ?? undefined}
                    >
                      {batch.status === 'completed' ? (
                        <>
                          {batch.completedCount} done
                          {batch.failedCount > 0 && (
                            <button
                              onClick={() => setExpandedErrorModel(
                                expandedErrorModel === batch.model ? null : batch.model
                              )}
                              className="ml-1 text-red-500 hover:text-red-400 underline"
                            >
                              {batch.failedCount} failed
                            </button>
                          )}
                        </>
                      ) : (
                        batch.error ?? 'Failed'
                      )}
                    </span>
                    {batch.status === 'failed' && batch.error && (
                      <button
                        onClick={() => copyError(batch.batchId, batch.error!, batch.model)}
                        className="p-0.5 rounded hover:bg-muted transition-colors"
                        title="Copy error details"
                      >
                        {copiedErrorId === batch.batchId ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    )}
                    <span className="text-muted-foreground">
                      {batch.completedAt
                        ? formatTime(batch.completedAt)
                        : formatTime(batch.createdAt)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Expanded error details */}
              {expandedErrorModel && failedErrors && failedErrors.length > 0 && (
                <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">
                      Failed: {getModelShortName(expandedErrorModel)} ({failedErrors.length} errors)
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => copyAllErrors(expandedErrorModel, failedErrors)}
                        className="p-1 rounded hover:bg-red-500/20 transition-colors"
                        title="Copy all errors"
                      >
                        {copiedErrorId === `all-${expandedErrorModel}` ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-red-500" />
                        )}
                      </button>
                      <button
                        onClick={() => handleClearFailed(expandedErrorModel)}
                        disabled={clearingModel === expandedErrorModel}
                        className="p-1 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        title="Clear failed records (allows fresh retry)"
                      >
                        {clearingModel === expandedErrorModel ? (
                          <Loader2 className="h-3 w-3 text-red-500 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3 text-red-500" />
                        )}
                      </button>
                      <button
                        onClick={() => setExpandedErrorModel(null)}
                        className="p-1 rounded hover:bg-red-500/20 transition-colors"
                        title="Close"
                      >
                        <X className="h-3 w-3 text-red-500" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto text-xs">
                    {failedErrors.slice(0, 10).map((err, i) => (
                      <div key={i} className="flex gap-2 text-red-600 dark:text-red-400">
                        <span className="font-mono text-muted-foreground shrink-0">
                          {err.seed.slice(0, 8)}...
                        </span>
                        <span className="truncate" title={err.error}>
                          {err.error}
                        </span>
                      </div>
                    ))}
                    {failedErrors.length > 10 && (
                      <div className="text-muted-foreground italic">
                        ... and {failedErrors.length - 10} more (copy all to see full list)
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

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
  )
}

function StatusRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string
  value: string | number
  mono?: boolean
  highlight?: 'green' | 'yellow' | 'red'
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-sm font-medium',
          mono && 'font-mono',
          highlight === 'green' && 'text-green-600 dark:text-green-400',
          highlight === 'yellow' && 'text-yellow-600 dark:text-yellow-400',
          highlight === 'red' && 'text-red-600 dark:text-red-400',
          !highlight && 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  )
}

// --- Config Panel ---

function AnalysisCountSelector({
  value,
  onChange,
}: {
  value: number
  onChange: (count: number) => void
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
            'px-2 py-1 text-sm rounded border border-input bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring/70',
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
  )
}

// --- Batches Display ---

function BatchesSection() {
  const allCycles = useQuery(api.backfill.getAllCycles, {})
  const currentCycle = useQuery(api.backfill.getCurrentCycle, {})
  const [selectedCycle, setSelectedCycle] = useState<number | undefined>(
    undefined,
  )
  const prevCycleRef = useRef<number | undefined>(undefined)

  // Auto-switch to latest cycle when a new cycle is created
  useEffect(() => {
    if (currentCycle !== undefined && prevCycleRef.current !== undefined) {
      // A new cycle was created - switch to it automatically
      if (currentCycle > prevCycleRef.current) {
        setSelectedCycle(undefined) // Reset to show latest
      }
    }
    prevCycleRef.current = currentCycle
  }, [currentCycle])

  // Use selected cycle or default to current
  const effectiveCycle = selectedCycle ?? currentCycle

  const recentBatches = useQuery(api.backfill.getRecentBatches, {
    limit: 15,
    cycle: effectiveCycle,
  })
  const cancelBatch = useAction(api.backfillActions.cancelBatch)
  const [cancellingBatchId, setCancellingBatchId] = useState<string | null>(
    null,
  )
  const [copiedErrorId, setCopiedErrorId] = useState<string | null>(null)

  const copyError = async (batchId: string, error: string, provider: string, model: string) => {
    const errorText = `Batch: ${batchId}\nProvider: ${provider}\nModel: ${model}\nError: ${error}`
    await navigator.clipboard.writeText(errorText)
    setCopiedErrorId(batchId)
    setTimeout(() => setCopiedErrorId(null), 2000)
  }

  const handleCancel = async (
    provider: Provider,
    batchId: string,
    model?: Model,
  ) => {
    setCancellingBatchId(batchId)
    try {
      await cancelBatch({ provider, batchId, model })
    } catch (err) {
      console.error('Failed to cancel batch:', err)
    } finally {
      setCancellingBatchId(null)
    }
  }

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
      )
    }
    return null
  }

  const activeBatches = recentBatches.filter(
    (b) => b.status === 'pending' || b.status === 'processing',
  )
  const completedBatches = recentBatches.filter((b) => b.status === 'completed')
  const failedBatches = recentBatches.filter((b) => b.status === 'failed')

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
      case 'processing':
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
      case 'completed':
        return <div className="h-3 w-3 rounded-full bg-green-500" />
      case 'failed':
        return <div className="h-3 w-3 rounded-full bg-red-500" />
      default:
        return <div className="h-3 w-3 rounded-full bg-gray-400" />
    }
  }

  const getModelShortName = (model?: string) => {
    // Shorten model names for display
    if (!model) return 'unknown'
    if (model.includes('/')) return model.split('/').pop() ?? model
    return model.replace('-20241022', '').replace('-versatile', '')
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

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
                      onClick={() =>
                        handleCancel(batch.provider, batch.batchId, batch.model)
                      }
                      disabled={cancellingBatchId === batch.batchId}
                      className={cn(
                        'p-1 rounded hover:bg-red-500/20 text-red-500',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        'transition-colors',
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
              .filter((b) => b.status === 'completed' || b.status === 'failed')
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
                      'flex-1 truncate',
                      batch.status === 'failed'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-muted-foreground',
                    )}
                    title={batch.error ?? undefined}
                  >
                    {batch.status === 'completed'
                      ? `${batch.completedCount} done${batch.failedCount > 0 ? `, ${batch.failedCount} failed` : ''}`
                      : (batch.error ?? 'Failed')}
                  </span>
                  {batch.status === 'failed' && batch.error && (
                    <button
                      onClick={() => copyError(batch.batchId, batch.error!, batch.provider, batch.model)}
                      className="p-0.5 rounded hover:bg-muted transition-colors"
                      title="Copy error details"
                    >
                      {copiedErrorId === batch.batchId ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                  )}
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
  )
}

// --- Cycle Selector ---

function CycleSelector({
  cycles,
  selectedCycle,
  onSelectCycle,
}: {
  cycles: number[]
  selectedCycle: number | undefined
  onSelectCycle: (cycle: number | undefined) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentCycle = cycles[0] // cycles are sorted descending

  return (
    <div className="mb-3" ref={dropdownRef}>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full px-3 py-2 rounded-md text-sm flex items-center justify-between',
            'border border-input bg-background hover:bg-accent',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
          )}
        >
          <span>
            Cycle {selectedCycle ?? currentCycle}
            {(selectedCycle ?? currentCycle) === currentCycle && (
              <span className="ml-1 text-xs text-muted-foreground">
                (latest)
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              isOpen && 'rotate-180',
            )}
          />
        </button>

        {isOpen && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-input bg-background shadow-lg max-h-48 overflow-y-auto">
            {cycles.map((cycle) => (
              <button
                key={cycle}
                onClick={() => {
                  onSelectCycle(cycle === currentCycle ? undefined : cycle)
                  setIsOpen(false)
                }}
                className={cn(
                  'w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center justify-between',
                  (selectedCycle ?? currentCycle) === cycle && 'bg-accent',
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
  )
}

// --- Errors Display ---

function ErrorsSection() {
  const currentCycle = useQuery(api.backfill.getCurrentCycle, {})
  const cyclesWithErrors = useQuery(api.backfill.getCyclesWithErrors, {})
  const [selectedCycle, setSelectedCycle] = useState<number | undefined>(
    undefined,
  )

  // Auto-select current cycle when it has errors
  const currentCycleHasErrors =
    cyclesWithErrors?.includes(currentCycle ?? 0) ?? false
  const effectiveCycle =
    selectedCycle ?? (currentCycleHasErrors ? currentCycle : undefined)

  const errorsByModel = useQuery(
    api.backfill.getErrorsByModel,
    effectiveCycle !== undefined
      ? { cycle: effectiveCycle }
      : { cycle: currentCycle ?? 1 },
  )
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [copiedModel, setCopiedModel] = useState<string | null>(null)

  // Don't render if current cycle has no errors or data not loaded
  if (!cyclesWithErrors || !currentCycleHasErrors) return null
  if (!errorsByModel || errorsByModel.length === 0) return null

  const totalErrors = errorsByModel.reduce((sum, m) => sum + m.errorCount, 0)

  const handleCopy = async (
    model: string,
    errors: Array<{ seed: string; analysisIndex: number; error: string }>,
  ) => {
    const text = errors
      .map(
        (e) => `seed: ${e.seed}, index: ${e.analysisIndex}, error: ${e.error}`,
      )
      .join('\n')

    const cycleLabel =
      effectiveCycle !== undefined ? ` (Cycle ${effectiveCycle})` : ''
    const fullText = `Errors for ${model}${cycleLabel} (${errors.length} total):\n\n${text}`

    await navigator.clipboard.writeText(fullText)
    setCopiedModel(model)
    setTimeout(() => setCopiedModel(null), 2000)
  }

  const handleCopyAll = async () => {
    const sections = errorsByModel.map((m) => {
      const errorLines = m.errors
        .map(
          (e) =>
            `  seed: ${e.seed}, index: ${e.analysisIndex}, error: ${e.error}`,
        )
        .join('\n')
      return `${m.model} (${m.errorCount} errors):\n${errorLines}`
    })

    const cycleLabel =
      effectiveCycle !== undefined ? ` (Cycle ${effectiveCycle})` : ''
    const fullText = `All Errors${cycleLabel} (${totalErrors} total):\n\n${sections.join('\n\n')}`

    await navigator.clipboard.writeText(fullText)
    setCopiedModel('all')
    setTimeout(() => setCopiedModel(null), 2000)
  }

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
              value={effectiveCycle ?? ''}
              onChange={(e) =>
                setSelectedCycle(
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
              className={cn(
                'px-1.5 py-0.5 text-xs rounded border border-red-500/30 bg-transparent',
                'text-red-700 dark:text-red-400',
                'focus:outline-none focus:ring-1 focus:ring-red-500/50',
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
            'flex items-center gap-1 px-2 py-1 text-xs rounded',
            'bg-red-500/20 hover:bg-red-500/30 text-red-700 dark:text-red-400',
            'transition-colors',
          )}
        >
          {copiedModel === 'all' ? (
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
                    expandedModel === modelErrors.model
                      ? null
                      : modelErrors.model,
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
                onClick={() =>
                  handleCopy(modelErrors.model, modelErrors.errors)
                }
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
                      (seed: {err.seed.slice(0, 20)}..., idx:{' '}
                      {err.analysisIndex})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function BackfillControlPanel() {
  const status = useQuery(api.backfill.getBackfillStatus, {})
  const currentCycle = useQuery(api.backfill.getCurrentCycle, {})
  const providerModels = useQuery(api.backfill.getProviderModels, {})
  const startBackfill = useAction(api.backfillActions.startBackfill)
  const pollBatches = useAction(api.backfillActions.pollActiveBatches)

  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [isNewJobMode, setIsNewJobMode] = useState(false)
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  const [analysisCount, setAnalysisCount] = useState(1)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef(false)

  // Auto-poll when there are active batches
  const hasActiveBatches = status && status.activeBatches > 0

  // Initialize selected models when entering new job mode
  useEffect(() => {
    if (isNewJobMode && providerModels && selectedModels.size === 0) {
      // Select all models by default
      setSelectedModels(new Set(providerModels.models.map((m) => m.model)))
    }
  }, [isNewJobMode, providerModels, selectedModels.size])

  useEffect(() => {
    if (hasActiveBatches && !pollIntervalRef.current) {
      // Poll every 10 seconds when there are active batches
      const poll = async () => {
        if (isPollingRef.current) return
        isPollingRef.current = true
        try {
          await pollBatches({})
        } catch (err) {
          console.error('Auto-poll error:', err)
        } finally {
          isPollingRef.current = false
        }
      }

      // Initial poll after short delay
      setTimeout(poll, 1000)

      // Set up interval
      pollIntervalRef.current = setInterval(poll, 10000)
    } else if (!hasActiveBatches && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [hasActiveBatches, pollBatches])

  const handleStartBackfill = async () => {
    setIsStarting(true)
    setError(null)
    setLastResult(null)

    try {
      const modelsToRun =
        selectedModels.size > 0 ? Array.from(selectedModels) : undefined
      const result = await startBackfill({
        selectedModels: modelsToRun,
        analysisCount,
      })
      setLastResult(
        `Cycle ${result.cycle}: Started ${result.batchesCreated} batches with ${result.totalRequests.toLocaleString()} requests`,
      )
      // Exit new job mode and reset selection after starting
      setIsNewJobMode(false)
      setSelectedModels(new Set())
      setAnalysisCount(1) // Reset to default
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStarting(false)
    }
  }

  const toggleModel = (model: string) => {
    const newSet = new Set(selectedModels)
    if (newSet.has(model)) {
      newSet.delete(model)
    } else {
      newSet.add(model)
    }
    setSelectedModels(newSet)
  }

  const toggleProvider = (provider: string) => {
    if (!providerModels) return
    const providerModelNames = providerModels.models
      .filter((m) => m.provider === provider)
      .map((m) => m.model)
    const allSelected = providerModelNames.every((m) => selectedModels.has(m))

    const newSet = new Set(selectedModels)
    if (allSelected) {
      // Deselect all from this provider
      providerModelNames.forEach((m) => newSet.delete(m))
    } else {
      // Select all from this provider
      providerModelNames.forEach((m) => newSet.add(m))
    }
    setSelectedModels(newSet)
  }

  const selectAll = () => {
    if (!providerModels) return
    setSelectedModels(new Set(providerModels.models.map((m) => m.model)))
  }

  const selectNone = () => {
    setSelectedModels(new Set())
  }

  const isLoading = status === undefined

  // New Job Mode UI
  if (isNewJobMode) {
    const modelsByProvider: Record<
      string,
      Array<{ provider: string; model: string }>
    > = {}
    if (providerModels) {
      for (const m of providerModels.models) {
        if (!modelsByProvider[m.provider]) {
          modelsByProvider[m.provider] = []
        }
        modelsByProvider[m.provider].push(m)
      }
    }

    const getModelShortName = (model: string) => {
      if (model.includes('/')) return model.split('/').pop() ?? model
      return model.replace('-20241022', '').replace('-versatile', '')
    }

    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsNewJobMode(false)
                setSelectedModels(new Set())
                setError(null)
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
        <AnalysisCountSelector
          value={analysisCount}
          onChange={setAnalysisCount}
        />

        {/* Model Selection */}
        <div className="space-y-3 mb-4">
          {Object.entries(modelsByProvider).map(([provider, models]) => {
            const allSelected = models.every((m) => selectedModels.has(m.model))
            const someSelected = models.some((m) => selectedModels.has(m.model))

            return (
              <div key={provider} className="p-3 rounded-md bg-muted/50">
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected
                    }}
                    onChange={() => toggleProvider(provider)}
                    className="rounded border-input"
                  />
                  <span className="text-sm font-medium capitalize">
                    {provider}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({models.filter((m) => selectedModels.has(m.model)).length}/
                    {models.length})
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
            )
          })}
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartBackfill}
          disabled={isStarting || selectedModels.size === 0}
          className={cn(
            'w-full px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
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
    )
  }

  // Normal Mode UI
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Tag Analysis</h3>
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
              'px-2 py-1 rounded text-xs font-medium flex items-center gap-1',
              'border border-input bg-background hover:bg-accent',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
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
  )
}
