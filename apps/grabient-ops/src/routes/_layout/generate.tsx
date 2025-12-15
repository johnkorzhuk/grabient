import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useAction, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useState } from 'react'
import { cn } from '~/lib/utils'
import {
  Sparkles,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  X,
  Palette,
} from 'lucide-react'
import {
  expandTagsWithColorHarmonies,
  isPredefinedColor,
  type ExpandedTag,
} from '~/lib/color-expansion'

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
  const [iterationCount, setIterationCount] = useState(1)
  const [palettesPerTag, setPalettesPerTag] = useState(24)
  const [isSelectingTags, setIsSelectingTags] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  const [colorExpansionEnabled, setColorExpansionEnabled] = useState(false)

  // Compute expanded tags with color harmonies
  const expandedTags: ExpandedTag[] = colorExpansionEnabled
    ? expandTagsWithColorHarmonies(selectedTags)
    : selectedTags.map((tag) => ({ tag, type: 'original' as const }))

  // Check if there are any color tags that can be expanded
  const hasColorTags = selectedTags.some((tag) => isPredefinedColor(tag))

  const selectTags = useAction(api.generateActions.selectUnderrepresentedTags)
  const startGeneration = useAction(api.generateActions.startGeneration)
  const pollBatches = useAction(api.generateActions.pollActiveGenerationBatches)
  const batches = useQuery(api.generate.getAllGenerationBatches, {})
  const activeBatches = useQuery(api.generate.getActiveGenerationBatches, {})

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
    if (expandedTags.length === 0) {
      console.error('No tags selected')
      return
    }

    setIsStarting(true)
    try {
      // Use expanded tags for generation
      const tagsToGenerate = expandedTags.map((t) => t.tag)
      const result = await startGeneration({ iterationCount, palettesPerTag, tags: tagsToGenerate })
      console.log('Generation started:', result)
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

  const hasActiveBatches = activeBatches && activeBatches.length > 0
  const tagCount = expandedTags.length
  const originalTagCount = selectedTags.length
  const expansionCount = tagCount - originalTagCount

  return (
    <div className="space-y-6">
      {/* Start New Generation */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <h3 className="font-medium text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Start New Generation
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-1">
              Iterations (n)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={iterationCount}
              onChange={(e) => setIterationCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/70"
            />
            <p className="text-xs text-muted-foreground mt-1">
              How many times to generate for each tag
            </p>
          </div>

          <div>
            <label className="text-sm text-muted-foreground block mb-1">
              Palettes per Tag
            </label>
            <input
              type="number"
              min={1}
              max={48}
              value={palettesPerTag}
              onChange={(e) => setPalettesPerTag(Math.max(1, Math.min(48, parseInt(e.target.value) || 24)))}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/70"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Number of palettes per request
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
                <p><strong>Will generate:</strong></p>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>{tagCount} tags{expansionCount > 0 && ` (${originalTagCount} + ${expansionCount} color variations)`}</li>
                  <li>2 requests per tag (with/without examples)</li>
                  <li>{iterationCount} iteration{iterationCount > 1 ? 's' : ''}</li>
                  <li>= <strong>{tagCount * 2 * iterationCount}</strong> total requests</li>
                  <li>= up to <strong>{tagCount * 2 * iterationCount * palettesPerTag}</strong> palettes</li>
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
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Start Generation with {tagCount} Tags
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

      {/* Active Batches */}
      {hasActiveBatches && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Active Batches
            </h3>
            <button
              onClick={handlePoll}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Poll Status
            </button>
          </div>

          {activeBatches?.map((batch) => (
            <BatchStatusCard key={batch._id} batch={batch} />
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

function BatchStatusCard({ batch }: { batch: {
  _id: string
  cycle: number
  batchId: string
  status: string
  requestCount: number
  completedCount: number
  failedCount: number
  tags: string[]
} }) {
  const progress = batch.requestCount > 0
    ? Math.round(((batch.completedCount + batch.failedCount) / batch.requestCount) * 100)
    : 0

  return (
    <div className="bg-muted/30 rounded-md p-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Cycle {batch.cycle}</span>
        <span className={cn(
          'px-2 py-0.5 rounded text-xs font-medium',
          batch.status === 'processing' && 'bg-blue-500/20 text-blue-600',
          batch.status === 'pending' && 'bg-yellow-500/20 text-yellow-600'
        )}>
          {batch.status}
        </span>
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

      <p className="text-xs text-muted-foreground">
        {batch.tags.length} tags: {batch.tags.slice(0, 5).join(', ')}
        {batch.tags.length > 5 && ` +${batch.tags.length - 5} more`}
      </p>
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

  // Fetch palettes for both with and without examples
  const palettesWithExamples = useQuery(
    api.generate.getGeneratedPalettes,
    selectedCycle !== undefined
      ? { cycle: selectedCycle, tag: selectedTag, withExamples: true, limit: 500 }
      : 'skip'
  )

  const palettesWithoutExamples = useQuery(
    api.generate.getGeneratedPalettes,
    selectedCycle !== undefined
      ? { cycle: selectedCycle, tag: selectedTag, withExamples: false, limit: 500 }
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

  // Group palettes by tag for comparison view
  const groupedByTag = (() => {
    if (!palettesWithExamples && !palettesWithoutExamples) return []

    const tagSet = new Set<string>()
    palettesWithExamples?.forEach((p) => tagSet.add(p.tag))
    palettesWithoutExamples?.forEach((p) => tagSet.add(p.tag))

    const sortedTags = Array.from(tagSet).sort()

    return sortedTags.map((tag) => {
      const withEx = (palettesWithExamples ?? []).filter((p) => p.tag === tag && p.colors.length > 0)
      const withoutEx = (palettesWithoutExamples ?? []).filter((p) => p.tag === tag && p.colors.length > 0)
      
      // Collect unique modifiers from all palettes in this tag group
      const modifierSet = new Set<string>()
      withEx.forEach((p) => p.modifiers?.forEach((m) => modifierSet.add(m)))
      withoutEx.forEach((p) => p.modifiers?.forEach((m) => modifierSet.add(m)))
      
      return {
        tag,
        withExamples: withEx,
        withoutExamples: withoutEx,
        modifiers: Array.from(modifierSet).sort(),
      }
    })
  })()

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <h3 className="font-medium text-foreground flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Browse Results (Side-by-Side Comparison)
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
            <p className="text-lg font-bold text-green-600">{stats.withExamples}</p>
            <p className="text-xs text-muted-foreground">With Examples</p>
          </div>
          <div className="bg-muted/30 rounded-md p-2 text-center">
            <p className="text-lg font-bold text-blue-600">{stats.withoutExamples}</p>
            <p className="text-xs text-muted-foreground">Without</p>
          </div>
          <div className="bg-muted/30 rounded-md p-2 text-center">
            <p className="text-lg font-bold text-red-600">{stats.errors}</p>
            <p className="text-xs text-muted-foreground">Errors</p>
          </div>
        </div>
      )}

      {/* Column Headers */}
      <div className="grid grid-cols-2 gap-4 shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium text-green-600">
          <Eye className="h-4 w-4" />
          With Examples
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
          <EyeOff className="h-4 w-4" />
          Without Examples
        </div>
      </div>

      {/* Side-by-Side Comparison per Tag */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
        {groupedByTag.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {selectedCycle ? 'No palettes found' : 'Select a cycle to view results'}
          </div>
        ) : (
          groupedByTag.map(({ tag, withExamples, withoutExamples, modifiers }) => (
            <div key={tag} className="border border-border rounded-lg p-3">
              {/* Tag Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-foreground">{tag}</span>
                  {modifiers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {modifiers.map((modifier) => (
                        <span
                          key={modifier}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-primary/10 text-primary"
                        >
                          {modifier}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {withExamples.length} with / {withoutExamples.length} without
                </span>
              </div>

              {/* Two Columns */}
              <div className="grid grid-cols-2 gap-4">
                {/* With Examples Column */}
                <div className="space-y-2">
                  {withExamples.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No palettes</p>
                  ) : (
                    withExamples.map((palette) => (
                      <PaletteCard key={palette._id} palette={palette} compact />
                    ))
                  )}
                </div>

                {/* Without Examples Column */}
                <div className="space-y-2">
                  {withoutExamples.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No palettes</p>
                  ) : (
                    withoutExamples.map((palette) => (
                      <PaletteCard key={palette._id} palette={palette} compact />
                    ))
                  )}
                </div>
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
    iterationIndex: number
    paletteIndex: number
    withExamples: boolean
    colors: string[]
    modifiers?: string[]
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
          title={`Iteration ${palette.iterationIndex}, Palette ${palette.paletteIndex}`}
        />
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
          <span className="text-xs font-medium truncate">{palette.tag}</span>
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[10px] font-medium',
            palette.withExamples ? 'bg-green-500/20 text-green-600' : 'bg-blue-500/20 text-blue-600'
          )}>
            {palette.withExamples ? 'with' : 'w/o'}
          </span>
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
