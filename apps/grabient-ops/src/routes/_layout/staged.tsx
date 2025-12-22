import { createFileRoute } from '@tanstack/react-router'
import { useQuery, usePaginatedQuery, useAction } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { cn } from '~/lib/utils'
import { useState, useEffect, useRef } from 'react'
import {
  Loader2,
  Layers,
  Database,
  Play,
  Plus,
  ArrowLeft,
  Settings,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Check,
  Upload,
} from 'lucide-react'
import { deserializeCoeffs } from '@repo/data-ops/serialization'
import {
  REFINEMENT_MODELS as REFINEMENT_MODEL_IDS,
  BLACKLISTED_REFINEMENT_MODELS,
  REFINEMENT_MODEL_PROVIDER,
  type RefinementModel,
} from '../../../convex/lib/providers.types'
import {
  applyGlobals,
  cosineGradient,
  rgbToHex,
  generateCssGradient,
} from '@repo/data-ops/gradient-gen'
import { detectHarmonies } from '@repo/data-ops/harmony'

export const Route = createFileRoute('/_layout/staged')({
  component: StagedPalettesPage,
})

const GRADIENT_STEPS = 11

function getHexColorsFromSeed(seed: string): string[] {
  try {
    const { coeffs, globals } = deserializeCoeffs(seed)
    const appliedCoeffs = applyGlobals(coeffs, globals)
    const rgbColors = cosineGradient(GRADIENT_STEPS, appliedCoeffs)
    return rgbColors.map((color) => rgbToHex(color[0], color[1], color[2]))
  } catch {
    return []
  }
}

function getGradientStyle(seed: string): string {
  try {
    const hexColors = getHexColorsFromSeed(seed)
    if (hexColors.length === 0) return 'linear-gradient(90deg, #888, #aaa)'
    const { gradientString } = generateCssGradient(
      hexColors,
      'linearSwatches',
      90,
      { seed, searchString: '' }
    )
    return gradientString
  } catch {
    return 'linear-gradient(90deg, #888, #aaa)'
  }
}

function StagedPalettesPage() {
  const stats = useQuery(api.generate.getStagedPalettesStats, {})
  const vectorizeStats = useQuery(api.generate.getStagedPalettesVectorizeStats, {})
  const { results, status, loadMore } = usePaginatedQuery(
    api.generate.getStagedPalettes,
    {},
    { initialNumItems: 1000 }
  )

  const isLoading = stats === undefined

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left Sidebar - Tag Analysis & Refinement Panels */}
      <div className="w-80 shrink-0 border-r border-border p-4 overflow-y-auto space-y-4">
        <StagedTagAnalysisPanel />
        <StagedRefinementPanel />
        <StagedEmbedTextAnalysisPanel />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Staged Palettes</h2>
            </div>
            {stats && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{stats.totalPalettes.toLocaleString()} palettes</span>
                <span>{stats.totalThemes.toLocaleString()} themes</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        {(stats || vectorizeStats) && (
          <div className="shrink-0 px-6 py-3 border-b border-border bg-muted/30">
            <div className="flex flex-wrap gap-4">
              {/* Model breakdown */}
              {stats && stats.modelCounts.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">By model:</span>
                  <div className="flex flex-wrap gap-1">
                    {stats.modelCounts.map(({ modelKey, count }) => (
                      <span
                        key={modelKey}
                        className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {modelKey}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Vectorization status */}
              {vectorizeStats && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-muted-foreground">Vectorized:</span>
                  <span
                    className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      vectorizeStats.unvectorized === 0
                        ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                        : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
                    )}
                  >
                    {vectorizeStats.vectorized}/{vectorizeStats.total}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No staged palettes
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {results.map((palette) => (
                  <PaletteCard key={palette._id} palette={palette} />
                ))}
              </div>

              {/* Load more */}
              {status === 'CanLoadMore' && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => loadMore(1000)}
                    className={cn(
                      'px-4 py-2 rounded-md text-sm font-medium',
                      'border border-input bg-background hover:bg-accent',
                      'outline-none focus-visible:ring-2 focus-visible:ring-ring/70'
                    )}
                  >
                    Load More
                  </button>
                </div>
              )}
              {status === 'LoadingMore' && (
                <div className="mt-6 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function PaletteCard({
  palette,
}: {
  palette: {
    _id: string
    seed: string
    themes: string[]
    modelKey?: string
  }
}) {
  const gradientStyle = getGradientStyle(palette.seed)
  const hexColors = getHexColorsFromSeed(palette.seed)
  const harmonies = detectHarmonies(hexColors, 3)

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Gradient preview */}
      <div
        className="w-full h-20"
        style={{
          backgroundImage: gradientStyle,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Info */}
      <div className="p-3 space-y-2">
        {/* Seed (truncated) */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground truncate max-w-[150px]" title={palette.seed}>
            {palette.seed.slice(0, 20)}...
          </span>
          {palette.modelKey && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {palette.modelKey}
            </span>
          )}
        </div>

        {/* Detected Harmonies */}
        {harmonies.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {harmonies.map((h) => (
              <span
                key={h.type}
                className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-400"
                title={`${Math.round(h.confidence * 100)}% confidence`}
              >
                {h.type}
              </span>
            ))}
          </div>
        )}

        {/* Themes */}
        {palette.themes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {palette.themes.slice(0, 5).map((theme) => (
              <span
                key={theme}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >
                {theme}
              </span>
            ))}
            {palette.themes.length > 5 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                +{palette.themes.length - 5}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Tag Analysis Panel for Staged Palettes
// ============================================================================

function StagedTagAnalysisPanel() {
  const status = useQuery(api.backfill.getStagedPalettesBackfillStatus, {})
  const currentCycle = useQuery(api.backfill.getCurrentCycle, {})
  const providerModels = useQuery(api.backfill.getProviderModels, {})
  const startBackfill = useAction(api.backfillActions.startStagedPalettesBackfill)
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
      setSelectedModels(new Set(providerModels.models.map((m) => m.model)))
    }
  }, [isNewJobMode, providerModels, selectedModels.size])

  useEffect(() => {
    if (hasActiveBatches && !pollIntervalRef.current) {
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

  const handleStartBackfill = async () => {
    setIsStarting(true)
    setError(null)
    setLastResult(null)

    try {
      const modelsToRun = selectedModels.size > 0 ? Array.from(selectedModels) : undefined
      const result = await startBackfill({
        selectedModels: modelsToRun,
        analysisCount,
      })
      setLastResult(
        `Cycle ${result.cycle}: Started ${result.batchesCreated} batches with ${result.totalRequests.toLocaleString()} requests`,
      )
      setIsNewJobMode(false)
      setSelectedModels(new Set())
      setAnalysisCount(1)
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
      providerModelNames.forEach((m) => newSet.delete(m))
    } else {
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
    const modelsByProvider: Record<string, Array<{ provider: string; model: string }>> = {}
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
      <div className="h-full flex flex-col rounded-lg border border-border bg-card p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-4 shrink-0">
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
            <h3 className="font-semibold text-foreground text-sm">New Job</h3>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button onClick={selectAll} className="text-primary hover:underline">
              All
            </button>
            <span className="text-muted-foreground">/</span>
            <button onClick={selectNone} className="text-primary hover:underline">
              None
            </button>
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Analysis Count */}
          <AnalysisCountSelector value={analysisCount} onChange={setAnalysisCount} />

          {/* Model Selection */}
          <div className="space-y-3">
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
                    <span className="text-sm font-medium capitalize">{provider}</span>
                    <span className="text-xs text-muted-foreground">
                      ({models.filter((m) => selectedModels.has(m.model)).length}/{models.length})
                    </span>
                  </label>
                  <div className="ml-6 space-y-1">
                    {models.map((m) => (
                      <label key={m.model} className="flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={selectedModels.has(m.model)}
                          onChange={() => toggleModel(m.model)}
                          className="rounded border-input"
                        />
                        <span className="text-muted-foreground">{getModelShortName(m.model)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Fixed footer with button and error */}
        <div className="shrink-0 pt-4">
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

          {error && (
            <div className="mt-3 p-2 rounded bg-destructive/10 text-destructive text-xs">
              {error}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Normal Mode UI
  return (
    <div className="h-full flex flex-col rounded-lg border border-border bg-card p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Tag Analysis</h3>
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
        <div className="flex-1 min-h-0 overflow-y-auto">
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
        </div>
      )}
    </div>
  )
}

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

function BatchesSection() {
  const allCycles = useQuery(api.backfill.getAllCycles, {})
  const currentCycle = useQuery(api.backfill.getCurrentCycle, {})
  const [selectedCycle, setSelectedCycle] = useState<number | undefined>(undefined)
  const prevCycleRef = useRef<number | undefined>(undefined)

  // Auto-switch to latest cycle when a new cycle is created
  useEffect(() => {
    if (currentCycle !== undefined && prevCycleRef.current !== undefined) {
      if (currentCycle > prevCycleRef.current) {
        setSelectedCycle(currentCycle)
      }
    }
    prevCycleRef.current = currentCycle
  }, [currentCycle])

  const displayCycle = selectedCycle ?? currentCycle

  if (!allCycles || allCycles.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4">
        No batch jobs yet
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Cycle selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Cycle:</span>
        <select
          value={displayCycle ?? ''}
          onChange={(e) => setSelectedCycle(Number(e.target.value))}
          className={cn(
            'px-2 py-1 text-xs rounded border border-input bg-background',
            'focus:outline-none focus:ring-2 focus:ring-ring/70',
          )}
        >
          {allCycles.map((cycle) => (
            <option key={cycle} value={cycle}>
              {cycle}
            </option>
          ))}
        </select>
      </div>

      {/* Batches for selected cycle */}
      {displayCycle !== undefined && <CycleBatches cycle={displayCycle} />}
    </div>
  )
}

type BatchInfo = {
  _id: string
  cycle: number
  provider: string
  model: string
  batchId: string
  status: string
  requestCount: number
  completedCount: number
  failedCount: number
  createdAt: number
  completedAt?: number
  error?: string
}

function CycleBatches({ cycle }: { cycle: number }) {
  const batches = useQuery(api.backfill.getBatchesByCycle, { cycle })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  if (!batches) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  }

  if (batches.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-2">
        No batches for cycle {cycle}
      </div>
    )
  }

  // Group by provider
  const byProvider: Record<string, BatchInfo[]> = {}
  for (const batch of batches) {
    if (!byProvider[batch.provider]) {
      byProvider[batch.provider] = []
    }
    byProvider[batch.provider].push(batch)
  }

  const toggleProvider = (provider: string) => {
    setExpanded((prev) => ({ ...prev, [provider]: !prev[provider] }))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400'
      case 'processing':
      case 'pending':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'failed':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <div className="space-y-2">
      {Object.entries(byProvider).map(([provider, providerBatches]) => {
        const isExpanded = expanded[provider]
        const totalCompleted = providerBatches.reduce((sum: number, b: BatchInfo) => sum + b.completedCount, 0)
        const totalRequests = providerBatches.reduce((sum: number, b: BatchInfo) => sum + b.requestCount, 0)
        const hasActive = providerBatches.some(
          (b: BatchInfo) => b.status === 'pending' || b.status === 'processing',
        )

        return (
          <div key={provider} className="rounded-md bg-muted/50 overflow-hidden">
            <button
              onClick={() => toggleProvider(provider)}
              className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/80 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className="text-xs font-medium capitalize flex-1">{provider}</span>
              <span className="text-[10px] text-muted-foreground">
                {totalCompleted}/{totalRequests}
              </span>
              {hasActive && (
                <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
              )}
            </button>

            {isExpanded && (
              <div className="px-2 pb-2 space-y-1">
                {providerBatches.map((batch: BatchInfo) => (
                  <div
                    key={batch._id}
                    className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-background"
                  >
                    <span className="text-muted-foreground truncate max-w-[100px]">
                      {batch.model.includes('/') ? batch.model.split('/').pop() : batch.model}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {batch.completedCount}/{batch.requestCount}
                      </span>
                      <span className={cn('capitalize', getStatusColor(batch.status))}>
                        {batch.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// Refinement Panel for Staged Palettes
// ============================================================================

type RefinementModelOption = {
  provider: string
  model: RefinementModel
  label: string
}

// Human-readable labels for refinement models
const REFINEMENT_MODEL_LABELS: Record<RefinementModel, string> = {
  'claude-opus-4-5-20251101': 'Claude Opus 4.5',
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
  'gpt-5-mini': 'GPT-5 Mini',
  'gpt-4.1-mini': 'GPT-4.1 Mini',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-5-nano': 'GPT-5 Nano',
  'moonshotai/kimi-k2-instruct': 'Kimi K2',
  'llama-3.3-70b-versatile': 'Llama 3.3 70B',
  'llama-3.1-8b-instant': 'Llama 3.1 8B',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'Llama 4 Scout',
  'meta-llama/llama-4-maverick-17b-128e-instruct': 'Llama 4 Maverick',
  'qwen/qwen3-32b': 'Qwen3 32B',
  'openai/gpt-oss-120b': 'GPT-OSS 120B',
  'openai/gpt-oss-20b': 'GPT-OSS 20B',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
}

// Build refinement models from shared constants, filtering out blacklisted ones
const REFINEMENT_MODELS: RefinementModelOption[] = REFINEMENT_MODEL_IDS
  .filter((model) => !BLACKLISTED_REFINEMENT_MODELS.has(model))
  .map((model) => ({
    provider: REFINEMENT_MODEL_PROVIDER[model],
    model,
    label: REFINEMENT_MODEL_LABELS[model],
  }))

function StagedRefinementPanel() {
  const status = useQuery(api.refinement.getStagedRefinementStatus, {})
  const promptVersions = useQuery(api.refinement.getAvailablePromptVersions, {})
  const activeBatches = useQuery(api.refinement.getActiveRefinementBatches, {})
  const startRefinement = useAction(api.refinementActions.startStagedRefinement)
  const pollBatches = useAction(api.refinementActions.pollActiveRefinementBatches)

  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [isNewJobMode, setIsNewJobMode] = useState(false)
  const [selectedModel, setSelectedModel] = useState<RefinementModelOption['model']>(REFINEMENT_MODELS[0].model)
  const [selectedPromptVersions, setSelectedPromptVersions] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(1000)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef(false)

  // Auto-poll when there are active batches
  const hasActiveBatches = activeBatches && activeBatches.length > 0

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
      pollIntervalRef.current = setInterval(poll, 15000)
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
    setIsStarting(true)
    setError(null)
    setLastResult(null)

    try {
      const result = await startRefinement({
        model: selectedModel,
        sourcePromptVersions: selectedPromptVersions.size > 0 ? Array.from(selectedPromptVersions) : undefined,
        limit,
      })
      setLastResult(
        `Cycle ${result.cycle}: Started batch with ${result.requestCount.toLocaleString()} requests`,
      )
      setIsNewJobMode(false)
      setSelectedPromptVersions(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStarting(false)
    }
  }

  const togglePromptVersion = (version: string) => {
    const newSet = new Set(selectedPromptVersions)
    if (newSet.has(version)) {
      newSet.delete(version)
    } else {
      newSet.add(version)
    }
    setSelectedPromptVersions(newSet)
  }

  const isLoading = status === undefined

  // New Job Mode UI
  if (isNewJobMode) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsNewJobMode(false)
                setError(null)
              }}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <Sparkles className="h-5 w-5 text-purple-500" />
            <h3 className="font-semibold text-foreground text-sm">New Refinement</h3>
          </div>
        </div>

        <div className="space-y-4">
          {/* Model Selection */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Refinement Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as RefinementModelOption['model'])}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded border border-input bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring/70',
              )}
            >
              {REFINEMENT_MODELS.map((m) => (
                <option key={m.model} value={m.model}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Limit */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Limit</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded border border-input bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring/70',
              )}
            >
              {[100, 250, 500, 1000, 2000, 3000, 5000].map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          {/* Source Prompt Versions */}
          {promptVersions && promptVersions.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Source Prompt Versions (optional)
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {promptVersions.map((pv) => (
                  <label key={pv.version} className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={selectedPromptVersions.has(pv.version)}
                      onChange={() => togglePromptVersion(pv.version)}
                      className="rounded border-input"
                    />
                    <span className="text-muted-foreground font-mono">
                      {pv.version.slice(0, 8)}...
                    </span>
                    <span className="text-muted-foreground/60">
                      ({pv.tagCount.toLocaleString()} tags)
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Leave empty to use all versions
              </p>
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={handleStartRefinement}
            disabled={isStarting}
            className={cn(
              'w-full px-4 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2',
              'bg-purple-600 text-white hover:bg-purple-700',
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
                Start Refinement
              </>
            )}
          </button>

          {error && (
            <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">
              {error}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Normal Mode UI
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <h3 className="font-semibold text-foreground text-sm">Refinement</h3>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveBatches && (
            <span className="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
              {activeBatches.length} active
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
          {[1, 2].map((i) => (
            <div key={i} className="h-6 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Status */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-muted/50">
              <div className="text-muted-foreground">With Tags</div>
              <div className="font-medium">{status.withTags.toLocaleString()}</div>
            </div>
            <div className="p-2 rounded bg-muted/50">
              <div className="text-muted-foreground">Refined</div>
              <div className="font-medium text-purple-600 dark:text-purple-400">
                {status.refined.toLocaleString()}
              </div>
            </div>
            <div className="p-2 rounded bg-muted/50">
              <div className="text-muted-foreground">Pending</div>
              <div className="font-medium text-yellow-600 dark:text-yellow-400">
                {status.pending.toLocaleString()}
              </div>
            </div>
            <div className="p-2 rounded bg-muted/50">
              <div className="text-muted-foreground">Total</div>
              <div className="font-medium">{status.totalStaged.toLocaleString()}</div>
            </div>
          </div>

          {/* Active Batches */}
          {hasActiveBatches && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Active Batches</div>
              {activeBatches.map((batch) => (
                <div
                  key={batch._id}
                  className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-muted/50"
                >
                  <span className="text-muted-foreground truncate max-w-[120px]">
                    {batch.model.split('-').slice(0, 2).join('-')}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {batch.completedCount}/{batch.requestCount}
                    </span>
                    <span className="text-yellow-600 dark:text-yellow-400 capitalize">
                      {batch.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Result/Error display */}
          {lastResult && (
            <div className="p-2 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 text-xs">
              {lastResult}
            </div>
          )}
          {error && (
            <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Embed Text Analysis Panel for Staged Palettes
// ============================================================================

// Filter out blacklisted models for UI display
const ACTIVE_REFINEMENT_MODELS = REFINEMENT_MODEL_IDS.filter(
  (model) => !BLACKLISTED_REFINEMENT_MODELS.has(model)
)

function StagedEmbedTextAnalysisPanel() {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [cycleDropdownOpen, setCycleDropdownOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState(ACTIVE_REFINEMENT_MODELS[0])
  const [selectedCycles, setSelectedCycles] = useState<Set<number>>(new Set())
  const [isVectorizing, setIsVectorizing] = useState(false)
  const [vectorizeResult, setVectorizeResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const vectorizeStats = useQuery(api.generate.getStagedPalettesVectorizeStats, {})
  const vectorizeStagedPalettes = useAction(api.vectorize.vectorizeStagedPalettes)

  // Get available cycles for the selected model
  const availableCycles = useQuery(
    api.refinement.getAvailableCyclesForModel,
    { model: selectedModel }
  )

  // Auto-select first cycle when model changes or cycles load
  useEffect(() => {
    if (availableCycles && availableCycles.length > 0 && selectedCycles.size === 0) {
      setSelectedCycles(new Set([availableCycles[0]]))
    }
  }, [availableCycles, selectedCycles.size])

  // Reset cycles when model changes
  const handleModelChange = (model: typeof selectedModel) => {
    setSelectedModel(model)
    setSelectedCycles(new Set())
    setModelDropdownOpen(false)
  }

  const toggleCycle = (cycle: number) => {
    const newSet = new Set(selectedCycles)
    if (newSet.has(cycle)) {
      newSet.delete(cycle)
    } else {
      newSet.add(cycle)
    }
    setSelectedCycles(newSet)
  }

  const selectAllCycles = () => {
    if (availableCycles) {
      setSelectedCycles(new Set(availableCycles))
    }
  }

  const handleVectorize = async () => {
    if (selectedCycles.size === 0) return

    setIsVectorizing(true)
    setVectorizeResult(null)
    try {
      const result = await vectorizeStagedPalettes({
        model: selectedModel,
        cycles: Array.from(selectedCycles),
      })
      setVectorizeResult({
        type: result.success ? 'success' : 'error',
        text: result.message,
      })
      setTimeout(() => setVectorizeResult(null), 5000)
    } catch (err) {
      setVectorizeResult({
        type: 'error',
        text: err instanceof Error ? err.message : 'Vectorization failed',
      })
    } finally {
      setIsVectorizing(false)
    }
  }

  const tagData = useQuery(
    api.refinement.getEmbedTextTagFrequencies,
    selectedCycles.size > 0
      ? { model: selectedModel, cycles: Array.from(selectedCycles) }
      : 'skip'
  )

  // Tags are already sorted by frequency from the query
  // Convert {key, value} format to {tag, count} for display
  const sortedTags = (tagData?.tags ?? []).map(t => ({ tag: t.key, count: t.value }))

  const hasUnvectorized = vectorizeStats && vectorizeStats.unvectorized > 0

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Embed Text Analysis</h3>
        </div>

        <div className="flex items-center gap-1">
          {/* Cycle Selector (Multi-select) */}
          {availableCycles && availableCycles.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setCycleDropdownOpen(!cycleDropdownOpen)}
                className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-input bg-background hover:bg-muted transition-colors"
              >
                <span>
                  {selectedCycles.size === 0
                    ? 'cycles'
                    : selectedCycles.size === 1
                      ? `c${[...selectedCycles][0]}`
                      : `${selectedCycles.size} cycles`}
                </span>
                <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", cycleDropdownOpen && "rotate-180")} />
              </button>
              {cycleDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 right-0 bg-background/95 backdrop-blur-sm border border-input rounded-md shadow-lg min-w-[80px] max-h-[180px] overflow-y-auto">
                  <div className="p-1">
                    <button
                      onClick={selectAllCycles}
                      className="w-full text-left text-[9px] px-1.5 py-0.5 rounded text-primary hover:bg-muted transition-colors mb-1"
                    >
                      Select all
                    </button>
                    {availableCycles.map((cycle, idx) => (
                      <label
                        key={cycle}
                        className={cn(
                          "flex items-center gap-1.5 text-[10px] px-1.5 py-1 rounded cursor-pointer",
                          "hover:bg-muted transition-colors",
                          selectedCycles.has(cycle) ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCycles.has(cycle)}
                          onChange={() => toggleCycle(cycle)}
                          className="w-3 h-3 rounded border-input"
                        />
                        c{cycle}
                        {idx === 0 && (
                          <span className="text-[9px] text-muted-foreground">(latest)</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Model Selector */}
          <div className="relative">
            <button
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-input bg-background hover:bg-muted transition-colors"
            >
              <span className="max-w-[80px] truncate">{selectedModel.split('/').pop()}</span>
              <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", modelDropdownOpen && "rotate-180")} />
            </button>
            {modelDropdownOpen && (
              <div className="absolute z-50 top-full mt-1 right-0 bg-background/95 backdrop-blur-sm border border-input rounded-md shadow-lg min-w-[140px] max-h-[200px] overflow-y-auto">
                <div className="p-0.5">
                  {ACTIVE_REFINEMENT_MODELS.map((model) => (
                    <button
                      key={model}
                      onClick={() => handleModelChange(model)}
                      className={cn(
                        "w-full text-left text-[10px] px-1.5 py-1 rounded",
                        "hover:bg-muted transition-colors",
                        selectedModel === model
                          ? "text-foreground bg-muted/50"
                          : "text-muted-foreground"
                      )}
                    >
                      {model.split('/').pop()}
                      {selectedModel === model && (
                        <Check className="inline-block w-2.5 h-2.5 ml-1 text-green-500" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {tagData === undefined ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : sortedTags.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
          No refinement data for this model
        </div>
      ) : (
        <div className="space-y-3">
          {/* Stats */}
          <div className="p-2 rounded-md bg-muted/50">
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="text-muted-foreground">Refinements:</span>{' '}
                <span className="font-medium">{tagData.totalRefinements.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Unique Tags:</span>{' '}
                <span className="font-medium">{tagData.uniqueTags.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Tag Cloud */}
          <EmbedTagCloud
            items={sortedTags}
            totalRefinements={tagData.totalRefinements}
          />

          {/* Vectorize Button */}
          {hasUnvectorized && selectedCycles.size > 0 && (
            <div className="pt-2 border-t border-border">
              <button
                onClick={handleVectorize}
                disabled={isVectorizing}
                className={cn(
                  'w-full px-3 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1.5',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                )}
              >
                {isVectorizing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Vectorizing...
                  </>
                ) : (
                  <>
                    <Upload className="h-3 w-3" />
                    Vectorize {selectedCycles.size === 1 ? `c${[...selectedCycles][0]}` : `${selectedCycles.size} cycles`}
                  </>
                )}
              </button>
            </div>
          )}

          {/* Vectorize Result */}
          {vectorizeResult && (
            <div
              className={cn(
                'p-2 rounded text-[10px]',
                vectorizeResult.type === 'success'
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'bg-destructive/10 text-destructive'
              )}
            >
              {vectorizeResult.text}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmbedTagCloud({
  items,
  totalRefinements,
}: {
  items: Array<{ tag: string; count: number }>
  totalRefinements: number
}) {
  const [showAll, setShowAll] = useState(false)

  if (!items || items.length === 0) return null

  const visibleItems = showAll ? items : items.slice(0, 30)
  const hiddenCount = items.length - 30

  return (
    <div>
      <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
        All Tags ({items.length})
      </h4>
      <div className="flex flex-wrap gap-1">
        {visibleItems.map((item) => {
          const percentage = Math.round((item.count / totalRefinements) * 100)
          return (
            <span
              key={item.tag}
              className={cn(
                'text-[10px] px-1 py-0.5 rounded',
                percentage >= 50
                  ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                  : percentage >= 25
                    ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                    : 'bg-muted text-muted-foreground'
              )}
              title={`${item.count} occurrences (${percentage}%)`}
            >
              {item.tag}
              <span className="text-[8px] ml-0.5 opacity-60">{item.count}</span>
            </span>
          )
        })}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[10px] text-primary hover:text-primary/80 px-1 py-0.5 hover:bg-primary/10 rounded transition-colors"
          >
            {showAll ? 'Show less' : `+${hiddenCount} more`}
          </button>
        )}
      </div>
    </div>
  )
}
