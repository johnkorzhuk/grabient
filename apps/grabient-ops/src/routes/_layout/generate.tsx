import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useAction, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useState } from 'react'
import { cn } from '~/lib/utils'
import {
  Sparkles,
  Loader2,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Eye,
  X,
  Palette,
} from 'lucide-react'
import {
  expandTagsWithColorHarmonies,
  isPredefinedColor,
  type ExpandedTag,
} from '~/lib/color-expansion'
import { PAINTER_MODELS, type PainterModelKey, type PainterProvider } from '../../../convex/lib/providers.types'

export const Route = createFileRoute('/_layout/generate')({
  component: GeneratePage,
})

function GeneratePage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-6 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Palette Generation</h2>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Batch generate palettes for underrepresented tags using Gemini 2.5 Flash Lite
        </p>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left column: Controls & Batch Status */}
        <div className="w-1/2 flex flex-col min-h-0 border-r border-border overflow-hidden">
          <div className="flex-1 min-h-0 p-6 overflow-y-auto">
            <GenerationControlPanel />
          </div>
        </div>

        {/* Right column: Results Browser */}
        <div className="w-1/2 min-h-0 p-6 overflow-hidden">
          <ResultsBrowser />
        </div>
      </div>
    </div>
  )
}

const GEMINI_MODEL = 'gemini-2.5-flash-lite' as const

function GenerationControlPanel() {
  const [variationsPerTag, setVariationsPerTag] = useState(6)
  const [palettesPerVariation, setPalettesPerVariation] = useState(1)
  const [isSelectingTags, setIsSelectingTags] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  const [colorExpansionEnabled, setColorExpansionEnabled] = useState(false)
  const [selectedComposerModel, setSelectedComposerModel] = useState<string>(PAINTER_MODELS[0].key)

  // Compute expanded tags with color harmonies
  const expandedTags: ExpandedTag[] = colorExpansionEnabled
    ? expandTagsWithColorHarmonies(selectedTags)
    : selectedTags.map((tag) => ({ tag, type: 'original' as const }))

  // Check if there are any color tags that can be expanded
  const hasColorTags = selectedTags.some((tag) => isPredefinedColor(tag))

  // Painter model selection
  const [selectedPainterModels, setSelectedPainterModels] = useState<string[]>(() => PAINTER_MODELS.map(m => m.key))
  const [isStartingPainter, setIsStartingPainter] = useState(false)

  const selectTags = useAction(api.generateActions.selectUnderrepresentedTags)
  const startGeneration = useAction(api.generateActions.startGeneration)
  const startPainterBatch = useAction(api.generateActions.startPainterBatch)
  const pollBatches = useAction(api.generateActions.pollAllActiveBatches)
  const cancelComposerBatch = useAction(api.generateActions.cancelComposerBatch)
  const cancelPainterBatch = useAction(api.generateActions.cancelPainterBatch)
  const activeComposerBatches = useQuery(api.generate.getActiveComposerBatches, {})
  const activePainterBatches = useQuery(api.generate.getActivePainterBatches, {})
  const allComposerBatches = useQuery(api.generate.getAllComposerBatches, {})
  const batches = allComposerBatches

  // Get the latest completed cycle for starting painter batches
  const latestCompletedCycle = allComposerBatches?.find(b => b.status === 'completed')?.cycle
  const composerOutputsForPainter = useQuery(
    api.generate.getComposerOutputs,
    latestCompletedCycle !== undefined ? { cycle: latestCompletedCycle } : 'skip'
  )

  // Get available cycles for gemini-2.5-flash-lite
  const availableCycles = useQuery(api.refinement.getAvailableCyclesForModel, {
    model: GEMINI_MODEL,
  })
  const latestCycle = availableCycles?.[0]

  // Fetch tag frequencies from gemini-2.5-flash-lite refinements (needs cycle to avoid timeout)
  const tagData = useQuery(
    api.refinement.getEmbedTextTagFrequencies,
    latestCycle !== undefined ? { model: GEMINI_MODEL, cycle: latestCycle } : 'skip'
  )

  const handleSelectTags = async () => {
    if (!tagData?.tags) {
      console.error('No tag data available')
      return
    }

    setIsSelectingTags(true)
    try {
      const tagFrequencies = tagData.tags.map((t) => ({ tag: t.key, count: t.value }))
      const tags = await selectTags({ tagFrequencies })
      setSelectedTags(tags)
      console.log('Selected tags:', tags)
    } catch (e) {
      console.error('Failed to select tags:', e)
    } finally {
      setIsSelectingTags(false)
    }
  }

  const handleStartGeneration = async () => {
    // Guard against double-submission
    if (isStarting) {
      console.warn('Already starting generation, ignoring duplicate call')
      return
    }
    if (expandedTags.length === 0) {
      console.error('No tags selected')
      return
    }

    setIsStarting(true)
    try {
      // Use expanded tags for generation
      const tagsToGenerate = expandedTags.map((t) => t.tag)
      console.log(`Starting generation with ${tagsToGenerate.length} tags, ${variationsPerTag} variations, ${palettesPerVariation} matrices`)
      const result = await startGeneration({
        tags: tagsToGenerate,
        composerModelKey: selectedComposerModel as typeof PAINTER_MODELS[number]['key'],
        variationsPerTag,
        palettesPerVariation,
      })
      console.log('Composer batch started:', result)
      setSelectedTags([]) // Clear selection after starting
      setColorExpansionEnabled(false)
    } catch (e) {
      console.error('Failed to start generation:', e)
    } finally {
      setIsStarting(false)
    }
  }

  const handlePoll = async () => {
    try {
      const results = await pollBatches({})
      console.log('Poll results:', results)
    } catch (e) {
      console.error('Failed to poll:', e)
    }
  }

  const handleStartPainterBatch = async () => {
    if (!latestCompletedCycle || selectedPainterModels.length === 0) {
      console.error('No cycle or models selected')
      return
    }

    setIsStartingPainter(true)
    try {
      const result = await startPainterBatch({
        cycle: latestCompletedCycle,
        modelKeys: selectedPainterModels,
      })
      console.log('Painter batches started:', result)
    } catch (e) {
      console.error('Failed to start painter batch:', e)
    } finally {
      setIsStartingPainter(false)
    }
  }

  const handleCancelComposerBatch = async (batchId: string, provider: PainterProvider) => {
    try {
      await cancelComposerBatch({ batchId, provider })
      console.log('Cancelled composer batch:', batchId)
    } catch (e) {
      console.error('Failed to cancel composer batch:', e)
    }
  }

  const handleCancelPainterBatch = async (batchId: string, modelKey: PainterModelKey, provider: PainterProvider) => {
    try {
      await cancelPainterBatch({ batchId, modelKey, provider })
      console.log('Cancelled painter batch:', batchId)
    } catch (e) {
      console.error('Failed to cancel painter batch:', e)
    }
  }

  const togglePainterModel = (modelKey: string) => {
    setSelectedPainterModels(prev =>
      prev.includes(modelKey)
        ? prev.filter(k => k !== modelKey)
        : [...prev, modelKey]
    )
  }

  const selectAllPainterModels = () => {
    setSelectedPainterModels(PAINTER_MODELS.map(m => m.key))
  }

  const clearPainterModels = () => {
    setSelectedPainterModels([])
  }

  const removeTag = (tagToRemove: string) => {
    setSelectedTags(selectedTags.filter((t) => t !== tagToRemove))
  }

  const addTag = () => {
    const tag = newTagInput.trim().toLowerCase()
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag])
      setNewTagInput('')
    }
  }

  const hasActiveComposerBatches = activeComposerBatches && activeComposerBatches.length > 0
  const hasActivePainterBatches = activePainterBatches && activePainterBatches.length > 0
  const hasActiveBatches = hasActiveComposerBatches || hasActivePainterBatches
  const tagCount = expandedTags.length
  const originalTagCount = selectedTags.length
  const expansionCount = tagCount - originalTagCount

  // Check if we can start painter batches
  const validComposerOutputs = composerOutputsForPainter?.filter(o => !o.error && o.theme) ?? []
  // Show painter panel if there's a completed cycle (even if outputs not yet processed)
  const hasCompletedCycle = latestCompletedCycle !== undefined
  const canStartPainterBatch = hasCompletedCycle &&
    validComposerOutputs.length > 0 &&
    selectedPainterModels.length > 0 &&
    !hasActivePainterBatches

  return (
    <div className="space-y-6">
      {/* Start New Generation */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Start New Generation
        </h3>

        {/* Model Selection */}
        <div>
          <label className="text-sm text-muted-foreground block mb-1">
            Composer Model
          </label>
          <select
            value={selectedComposerModel}
            onChange={(e) => setSelectedComposerModel(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/70"
          >
            {PAINTER_MODELS.map((model) => (
              <option key={model.key} value={model.key}>
                {model.name} ({model.provider})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-1">
              Variations per Tag
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={variationsPerTag}
              onChange={(e) => setVariationsPerTag(Math.max(1, Math.min(10, parseInt(e.target.value) || 6)))}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/70"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Theme variations per tag
            </p>
          </div>

          <div>
            <label className="text-sm text-muted-foreground block mb-1">
              Matrices per Variation
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={palettesPerVariation}
              onChange={(e) => setPalettesPerVariation(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/70"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Each painter model runs once per matrix
            </p>
          </div>
        </div>

        {/* Step 1: Select Tags */}
        {selectedTags.length === 0 ? (
          <>
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
              <p><strong>Step 1:</strong> Let AI select underrepresented tags from {tagData?.uniqueTags ?? '...'} available</p>
            </div>

            <button
              onClick={handleSelectTags}
              disabled={isSelectingTags || hasActiveBatches || !tagData?.tags}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium',
                'bg-secondary text-secondary-foreground',
                'hover:bg-secondary/80 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {!tagData?.tags ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading tag data...
                </>
              ) : isSelectingTags ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI is selecting tags...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Select Underrepresented Tags
                </>
              )}
            </button>
          </>
        ) : (
          <>
            {/* Step 2: Review and Edit Tags */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  Selected Tags ({tagCount})
                  {expansionCount > 0 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({originalTagCount} original + {expansionCount} color variations)
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  {hasColorTags && (
                    <button
                      onClick={() => setColorExpansionEnabled(!colorExpansionEnabled)}
                      className={cn(
                        'text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors',
                        colorExpansionEnabled
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      <Palette className="h-3 w-3" />
                      {colorExpansionEnabled ? 'Color Expansion ON' : 'Expand Colors'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedTags([])
                      setColorExpansionEnabled(false)
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </button>
                </div>
              </div>

              {/* Tag list */}
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border border-border rounded-md bg-muted/30">
                {expandedTags.map((expandedTag) => (
                  <span
                    key={expandedTag.tag}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 rounded text-sm group',
                      expandedTag.type === 'original' && 'bg-primary/10 text-primary',
                      expandedTag.type === 'analogous-2' && 'bg-green-500/15 text-green-700 dark:text-green-400',
                      expandedTag.type === 'analogous-3' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                      expandedTag.type === 'complementary-2' && 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
                      expandedTag.type === 'complementary-3' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                    )}
                    title={
                      expandedTag.type !== 'original'
                        ? `${expandedTag.type} from ${expandedTag.sourceColor}`
                        : undefined
                    }
                  >
                    {expandedTag.type !== 'original' && (
                      <span className="text-[10px] opacity-60 uppercase">
                        {expandedTag.type.charAt(0)}
                      </span>
                    )}
                    {expandedTag.tag}
                    {expandedTag.type === 'original' && (
                      <button
                        onClick={() => removeTag(expandedTag.tag)}
                        className="opacity-50 hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>

              {/* Add custom tag */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  placeholder="Add custom tag..."
                  className="flex-1 px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/70"
                />
                <button
                  onClick={addTag}
                  disabled={!newTagInput.trim()}
                  className="px-3 py-1.5 text-sm border border-input rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              {/* Summary */}
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                <p><strong>Composer stage:</strong></p>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>{tagCount} tags × {variationsPerTag} variations × {palettesPerVariation} matrices</li>
                  <li>= <strong>{tagCount}</strong> composer batch requests</li>
                  <li>= <strong>{tagCount * variationsPerTag * palettesPerVariation}</strong> unique matrices</li>
                </ul>
                <p className="mt-2"><strong>Painter stage:</strong></p>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Each painter model called once per matrix</li>
                </ul>
              </div>

              <button
                onClick={handleStartGeneration}
                disabled={isStarting || hasActiveBatches || tagCount === 0}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isStarting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting Composer...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Start Composer with {tagCount} Tags
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {hasActiveBatches && (
          <p className="text-xs text-amber-600 text-center">
            Wait for active batches to complete before starting new generation
          </p>
        )}
      </div>

      {/* Active Composer Batches */}
      {hasActiveComposerBatches && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Active Composer Batches
            </h3>
            <button
              onClick={handlePoll}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Poll Status
            </button>
          </div>

          {activeComposerBatches?.map((batch) => (
            <BatchStatusCard
              key={batch._id}
              batch={batch}
              type="composer"
              onCancel={batch.batchId && batch.provider ? () => handleCancelComposerBatch(batch.batchId!, batch.provider!) : undefined}
            />
          ))}
        </div>
      )}

      {/* Painter Stage Panel */}
      {hasCompletedCycle && (
        <div className="border border-border rounded-lg p-4 space-y-4">
          <h3 className="font-medium text-foreground flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Painter Stage (Cycle {latestCompletedCycle})
          </h3>

          <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
            {validComposerOutputs.length > 0 ? (
              <p>{validComposerOutputs.length} matrices ready for painting</p>
            ) : (
              <p className="text-amber-600">Composer outputs not yet processed. Poll the batch to fetch results.</p>
            )}
          </div>

          {/* Model Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-muted-foreground">Select Painter Models</label>
              <div className="flex gap-2">
                <button
                  onClick={selectAllPainterModels}
                  className="text-xs text-primary hover:underline"
                >
                  Select All
                </button>
                <button
                  onClick={clearPainterModels}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-border rounded-md bg-muted/30">
              {PAINTER_MODELS.map((model) => (
                <label
                  key={model.key}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded cursor-pointer transition-colors',
                    selectedPainterModels.includes(model.key)
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedPainterModels.includes(model.key)}
                    onChange={() => togglePainterModel(model.key)}
                    className="rounded border-input"
                  />
                  <span className="text-sm">{model.name}</span>
                  <span className="text-xs text-muted-foreground">({model.provider})</span>
                </label>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
            <p>{selectedPainterModels.length} models × {validComposerOutputs.length} matrices = <strong>{selectedPainterModels.length * validComposerOutputs.length}</strong> total palette generations</p>
          </div>

          <button
            onClick={handleStartPainterBatch}
            disabled={!canStartPainterBatch || isStartingPainter}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isStartingPainter ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting Painter Batches...
              </>
            ) : (
              <>
                <Palette className="h-4 w-4" />
                Start Painter with {selectedPainterModels.length} Models
              </>
            )}
          </button>

          {hasActivePainterBatches && (
            <p className="text-xs text-amber-600 text-center">
              Wait for active painter batches to complete
            </p>
          )}
        </div>
      )}

      {/* Active Painter Batches */}
      {hasActivePainterBatches && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Active Painter Batches
            </h3>
            <button
              onClick={handlePoll}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Poll Status
            </button>
          </div>

          {activePainterBatches?.map((batch) => (
            <BatchStatusCard
              key={batch._id}
              batch={batch}
              type="painter"
              onCancel={batch.batchId && batch.provider ? () => handleCancelPainterBatch(batch.batchId!, batch.modelKey, batch.provider!) : undefined}
            />
          ))}
        </div>
      )}

      {/* Batch History */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-foreground">Batch History</h3>

        {batches?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No batches yet</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {batches?.map((batch) => (
              <BatchHistoryItem key={batch._id} batch={batch} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BatchStatusCard({ batch, type, onCancel }: {
  batch: {
    _id: string
    cycle: number
    batchId?: string
    status: string
    requestCount: number
    completedCount: number
    failedCount: number
    tags?: string[]
    modelKey?: string
  }
  type?: 'composer' | 'painter'
  onCancel?: () => void
}) {
  const progress = batch.requestCount > 0
    ? Math.round(((batch.completedCount + batch.failedCount) / batch.requestCount) * 100)
    : 0

  return (
    <div className="bg-muted/30 rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {type === 'painter' ? batch.modelKey : `Cycle ${batch.cycle}`}
          {type === 'composer' && batch.modelKey && <span className="text-muted-foreground ml-1">({batch.modelKey})</span>}
        </span>
        <div className="flex items-center gap-2">
          <span className={cn(
            'px-2 py-0.5 rounded text-xs font-medium',
            batch.status === 'processing' && 'bg-blue-500/20 text-blue-600',
            batch.status === 'pending' && 'bg-yellow-500/20 text-yellow-600'
          )}>
            {batch.status}
          </span>
          {onCancel && (batch.status === 'pending' || batch.status === 'processing') && (
            <button
              onClick={onCancel}
              className="text-xs text-red-600 hover:underline flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{batch.completedCount + batch.failedCount} / {batch.requestCount} requests</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {batch.tags && batch.tags.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {batch.tags.length} tags: {batch.tags.slice(0, 5).join(', ')}
          {batch.tags.length > 5 && ` +${batch.tags.length - 5} more`}
        </p>
      )}
    </div>
  )
}

function BatchHistoryItem({ batch }: { batch: {
  _id: string
  cycle: number
  status: string
  requestCount: number
  completedCount: number
  failedCount: number
  tags: string[]
  createdAt: number
  completedAt?: number
  error?: string
} }) {
  const [expanded, setExpanded] = useState(false)
  const deleteCycle = useMutation(api.generate.deleteGenerationCycle)

  const handleDelete = async () => {
    if (confirm(`Delete cycle ${batch.cycle} and all its generated palettes?`)) {
      await deleteCycle({ cycle: batch.cycle })
    }
  }

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium">Cycle {batch.cycle}</span>
          <span className={cn(
            'px-2 py-0.5 rounded text-xs font-medium',
            batch.status === 'completed' && 'bg-green-500/20 text-green-600',
            batch.status === 'failed' && 'bg-red-500/20 text-red-600',
            batch.status === 'processing' && 'bg-blue-500/20 text-blue-600',
            batch.status === 'pending' && 'bg-yellow-500/20 text-yellow-600'
          )}>
            {batch.status}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(batch.createdAt).toLocaleDateString()}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Requests:</span>{' '}
              <span className="font-medium">{batch.requestCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Success:</span>{' '}
              <span className="font-medium text-green-600">{batch.completedCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Failed:</span>{' '}
              <span className="font-medium text-red-600">{batch.failedCount}</span>
            </div>
          </div>

          {batch.error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
              {batch.error}
            </p>
          )}

          <div className="flex flex-wrap gap-1">
            {batch.tags.slice(0, 10).map((tag) => (
              <span key={tag} className="px-2 py-0.5 bg-muted rounded text-xs">
                {tag}
              </span>
            ))}
            {batch.tags.length > 10 && (
              <span className="px-2 py-0.5 text-xs text-muted-foreground">
                +{batch.tags.length - 10} more
              </span>
            )}
          </div>

          <button
            onClick={handleDelete}
            className="text-sm text-red-600 hover:underline flex items-center gap-1 mt-2"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Cycle
          </button>
        </div>
      )}
    </div>
  )
}

function ResultsBrowser() {
  const cycles = useQuery(api.generate.getAvailableGenerationCycles, {})
  const [selectedCycle, setSelectedCycle] = useState<number | undefined>()
  const [selectedTag, setSelectedTag] = useState<string | undefined>()

  const tags = useQuery(
    api.generate.getGeneratedTags,
    selectedCycle !== undefined ? { cycle: selectedCycle } : 'skip'
  )

  // Fetch palettes for the selected cycle/tag
  const palettes = useQuery(
    api.generate.getGeneratedPalettes,
    selectedCycle !== undefined
      ? { cycle: selectedCycle, tag: selectedTag, limit: 1000 }
      : 'skip'
  )

  const stats = useQuery(
    api.generate.getGenerationStats,
    selectedCycle !== undefined ? { cycle: selectedCycle } : 'skip'
  )

  // Auto-select first cycle
  if (cycles && cycles.length > 0 && selectedCycle === undefined) {
    setSelectedCycle(cycles[0].cycle)
  }

  // Filter valid palettes
  const validPalettes = palettes?.filter((p) => p.colors.length > 0 && !p.error) ?? []

  // Group palettes by tag
  const groupedByTag = (() => {
    if (!validPalettes.length) return []

    const tagMap = new Map<string, typeof validPalettes>()
    for (const p of validPalettes) {
      const existing = tagMap.get(p.tag) || []
      existing.push(p)
      tagMap.set(p.tag, existing)
    }

    return Array.from(tagMap.entries())
      .map(([tag, tagPalettes]) => ({ tag, palettes: tagPalettes }))
      .sort((a, b) => a.tag.localeCompare(b.tag))
  })()

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-medium text-foreground flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Browse Results
        </h3>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 shrink-0">
        <select
          value={selectedCycle ?? ''}
          onChange={(e) => {
            setSelectedCycle(e.target.value ? parseInt(e.target.value) : undefined)
            setSelectedTag(undefined)
          }}
          className="px-3 py-1.5 text-sm border border-input rounded-md bg-background"
        >
          <option value="">Select Cycle</option>
          {cycles?.map((c) => (
            <option key={c.cycle} value={c.cycle}>
              Cycle {c.cycle} ({c.status})
            </option>
          ))}
        </select>

        <select
          value={selectedTag ?? ''}
          onChange={(e) => setSelectedTag(e.target.value || undefined)}
          className="px-3 py-1.5 text-sm border border-input rounded-md bg-background"
          disabled={!selectedCycle}
        >
          <option value="">All Tags ({tags?.length ?? 0})</option>
          {tags?.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 shrink-0">
          <div className="bg-muted/30 rounded-md p-2 text-center">
            <p className="text-lg font-bold">{stats.totalPalettes}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="bg-muted/30 rounded-md p-2 text-center">
            <p className="text-lg font-bold text-blue-600">{stats.composerOutputs}</p>
            <p className="text-xs text-muted-foreground">Matrices</p>
          </div>
          <div className="bg-muted/30 rounded-md p-2 text-center">
            <p className="text-lg font-bold text-green-600">{stats.uniqueTags}</p>
            <p className="text-xs text-muted-foreground">Tags</p>
          </div>
          <div className="bg-muted/30 rounded-md p-2 text-center">
            <p className="text-lg font-bold text-red-600">{stats.errors}</p>
            <p className="text-xs text-muted-foreground">Errors</p>
          </div>
        </div>
      )}

      {/* Model counts */}
      {stats?.modelCounts && Object.keys(stats.modelCounts).length > 0 && (
        <div className="flex flex-wrap gap-2 shrink-0">
          {Object.entries(stats.modelCounts).map(([model, count]) => (
            <span key={model} className="text-xs bg-muted/50 rounded px-2 py-1">
              {model}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Palettes by Tag */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
        {groupedByTag.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {selectedCycle ? 'No palettes found' : 'Select a cycle to view results'}
          </div>
        ) : (
          groupedByTag.map(({ tag, palettes: tagPalettes }) => (
            <div key={tag} className="border border-border rounded-lg p-3">
              {/* Tag Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                <span className="font-medium text-foreground">{tag}</span>
                <span className="text-xs text-muted-foreground">
                  {tagPalettes.length} palettes
                </span>
              </div>

              {/* Palettes Grid */}
              <div className="grid grid-cols-4 gap-2">
                {tagPalettes.map((palette) => (
                  <PaletteCard key={palette._id} palette={palette} compact />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PaletteCard({ palette, compact = false }: {
  palette: {
    _id: string
    tag: string
    theme?: string
    variationIndex?: number
    paletteIndex?: number
    modelKey?: string
    colors: string[]
  }
  compact?: boolean
}) {
  const gradient = `linear-gradient(90deg, ${palette.colors.join(', ')})`

  if (compact) {
    return (
      <div className="border border-border rounded overflow-hidden">
        <div
          className="h-10 w-full"
          style={{ background: gradient }}
          title={palette.theme || palette.tag}
        />
        {palette.modelKey && (
          <div className="px-1 py-0.5 text-[9px] text-muted-foreground truncate bg-muted/30">
            {palette.modelKey}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div
        className="h-16 w-full"
        style={{ background: gradient }}
      />
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium truncate">{palette.theme || palette.tag}</span>
          {palette.modelKey && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-600">
              {palette.modelKey}
            </span>
          )}
        </div>
        <div className="flex gap-0.5">
          {palette.colors.slice(0, 8).map((color, i) => (
            <div
              key={i}
              className="h-3 flex-1 rounded-sm"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
