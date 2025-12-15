import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { cn } from '~/lib/utils'
import { Shuffle, RefreshCw, Copy, Check, ExternalLink } from 'lucide-react'
import {
  cosineGradient,
  rgbToHex,
  calculateAverageBrightness,
  type CosineCoeffs,
} from '@repo/data-ops/gradient-gen/cosine'
import { serializeCoeffs } from '@repo/data-ops/serialization'
import { DEFAULT_GLOBALS } from '@repo/data-ops/valibot-schema/grabient'

export const Route = createFileRoute('/_layout/random')({
  component: RandomPage,
})

const GRADIENT_STEPS = 11
const DEFAULT_BATCH_SIZE = 24

interface GeneratedPalette {
  id: string
  coeffs: CosineCoeffs
  seed: string
  hexColors: string[]
  brightness: number
}

/**
 * Generate fully random cosine gradient coefficients.
 * Each row represents: [R, G, B, alpha=1]
 * - Row 0 (offset/a): base color, typically 0.3-0.7
 * - Row 1 (amplitude/b): color range, typically 0.2-0.5
 * - Row 2 (frequency/c): color cycles, typically 0.5-2.0
 * - Row 3 (phase/d): color shift, typically 0-1
 */
function generateRandomCoeffs(): CosineCoeffs {
  const randomInRange = (min: number, max: number) =>
    Math.round((min + Math.random() * (max - min)) * 1000) / 1000

  // Offset (a): base brightness, centered around 0.5
  const offset: [number, number, number, 1] = [
    randomInRange(0.2, 0.8),
    randomInRange(0.2, 0.8),
    randomInRange(0.2, 0.8),
    1,
  ]

  // Amplitude (b): how much the color varies
  const amplitude: [number, number, number, 1] = [
    randomInRange(0.1, 0.6),
    randomInRange(0.1, 0.6),
    randomInRange(0.1, 0.6),
    1,
  ]

  // Frequency (c): how many cycles across the gradient
  const frequency: [number, number, number, 1] = [
    randomInRange(0.3, 2.5),
    randomInRange(0.3, 2.5),
    randomInRange(0.3, 2.5),
    1,
  ]

  // Phase (d): where in the cycle each channel starts
  const phase: [number, number, number, 1] = [
    randomInRange(0, 1),
    randomInRange(0, 1),
    randomInRange(0, 1),
    1,
  ]

  return [offset, amplitude, frequency, phase]
}

function generatePalette(): GeneratedPalette {
  const coeffs = generateRandomCoeffs()
  const seed = serializeCoeffs(coeffs, DEFAULT_GLOBALS)
  const rgbColors = cosineGradient(GRADIENT_STEPS, coeffs)
  const hexColors = rgbColors.map((c) => rgbToHex(c[0], c[1], c[2]))
  const brightness = calculateAverageBrightness(hexColors)

  return {
    id: crypto.randomUUID(),
    coeffs,
    seed,
    hexColors,
    brightness,
  }
}

function generateBatch(count: number): GeneratedPalette[] {
  return Array.from({ length: count }, () => generatePalette())
}

function RandomPage() {
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE)
  const [palettes, setPalettes] = useState<GeneratedPalette[]>(() =>
    generateBatch(DEFAULT_BATCH_SIZE)
  )

  const handleRegenerate = () => {
    setPalettes(generateBatch(batchSize))
  }

  // For now, all palettes pass (no filtering yet)
  // This will later be split into passed/filtered based on quality checks
  // Step 2 will implement filtering logic here
  const passed = palettes
  const filtered: GeneratedPalette[] = []

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shuffle className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Random Palette Generator
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Batch size:</label>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value))}
                className="px-2 py-1 text-sm border border-input rounded-md bg-background"
              >
                {[12, 24, 48, 96].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleRegenerate}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md font-medium',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors'
              )}
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Generate random cosine gradient palettes with quality filtering
        </p>
      </div>

      {/* Main content - split view */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left column: Passed palettes */}
        <div className="w-1/2 flex flex-col min-h-0 border-r border-border overflow-hidden">
          <div className="shrink-0 px-4 py-2 border-b border-border bg-green-500/5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                Passed ({passed.length})
              </span>
              <span className="text-xs text-muted-foreground">
                {((passed.length / palettes.length) * 100).toFixed(0)}% pass rate
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-3">
              {passed.map((palette) => (
                <PaletteCard key={palette.id} palette={palette} />
              ))}
            </div>
            {passed.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No palettes passed the filters
              </div>
            )}
          </div>
        </div>

        {/* Right column: Filtered out palettes */}
        <div className="w-1/2 flex flex-col min-h-0 overflow-hidden">
          <div className="shrink-0 px-4 py-2 border-b border-border bg-red-500/5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-red-700 dark:text-red-400">
                Filtered Out ({filtered.length})
              </span>
              <span className="text-xs text-muted-foreground">
                {((filtered.length / palettes.length) * 100).toFixed(0)}% filtered
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((palette) => (
                <PaletteCard key={palette.id} palette={palette} showReason />
              ))}
            </div>
            {filtered.length === 0 && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No filters applied yet - all palettes pass
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PaletteCard({
  palette,
  showReason = false,
}: {
  palette: GeneratedPalette
  showReason?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const gradient = `linear-gradient(90deg, ${palette.hexColors.join(', ')})`
  const grabientUrl = `https://grabient.com/${palette.seed}`

  const handleCopy = async () => {
    await navigator.clipboard.writeText(palette.seed)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group border border-border rounded-lg overflow-hidden bg-card">
      {/* Gradient preview */}
      <div className="h-16 w-full" style={{ background: gradient }} />

      {/* Info */}
      <div className="p-2 space-y-1">
        {/* Stats row */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Brightness:{' '}
            <span
              className={cn(
                'font-medium',
                palette.brightness < 0.3 && 'text-yellow-600',
                palette.brightness > 0.7 && 'text-yellow-600',
                palette.brightness >= 0.3 &&
                  palette.brightness <= 0.7 &&
                  'text-green-600'
              )}
            >
              {palette.brightness.toFixed(2)}
            </span>
          </span>
        </div>

        {/* Coefficients preview */}
        <div className="text-[10px] font-mono text-muted-foreground truncate">
          a: [{palette.coeffs[0].slice(0, 3).map((v) => v.toFixed(2)).join(', ')}]
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1">
          <button
            onClick={handleCopy}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded',
              'border border-input hover:bg-muted transition-colors'
            )}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy seed
              </>
            )}
          </button>
          <a
            href={grabientUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center justify-center p-1 rounded',
              'border border-input hover:bg-muted transition-colors'
            )}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Filter reason (for filtered palettes) */}
        {showReason && (
          <div className="text-[10px] text-red-600 bg-red-500/10 rounded px-1.5 py-0.5 mt-1">
            Reason will appear here
          </div>
        )}
      </div>
    </div>
  )
}
