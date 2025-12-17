# Fix: Restore generate.tsx UI

## What Was Lost

I accidentally ran `git checkout` on two files, losing your uncommitted changes:

1. **`providers.types.ts`** - PAINTER_MODELS definitions (I recreated but may have errors)
2. **`generate.tsx`** - Full Composer/Painter UI

## What's Still Intact

Your backend code is untouched:
- `generateActions.ts` - All batch submission/polling logic
- `generate.ts` - All queries/mutations
- `schema.ts` - All table definitions

---

## Task 1: Verify/Fix providers.types.ts

Check that `PAINTER_MODELS` matches what you originally had. Current definition starts at line ~347.

**Current models defined:**
- claude-3-5-haiku (anthropic)
- gpt-5-mini (openai)
- gpt-4.1-mini (openai)
- kimi-k2 (groq)
- llama-3.3-70b (groq)
- llama-4-scout (groq)
- llama-4-maverick (groq)
- gpt-oss-20b (groq)
- qwen3-32b (groq)
- gpt-oss-120b (groq)
- gemini-2.0-flash (google)
- gemini-flash-lite (google)

**Verify these exports exist:**
- `PAINTER_MODELS` (array)
- `PainterModelKey` (type)
- `PainterProvider` (type)
- `vPainterModelKey` (validator)
- `vPainterProvider` (validator)
- `PALETTE_STYLES` (array)
- `PaletteStyle` (type)
- `vPaletteStyle` (validator)
- `PALETTE_ANGLES` (array)
- `PaletteAngle` (type)
- `vPaletteAngle` (validator)

---

## Task 2: Rebuild generate.tsx UI

### Available Backend APIs

**Queries (from generate.ts):**
```typescript
api.generate.getNextGenerationCycle          // () => number
api.generate.getAvailableGenerationCycles    // () => CycleInfo[]
api.generate.getActiveComposerBatches        // () => ComposerBatch[]
api.generate.getAllComposerBatches           // () => ComposerBatch[]
api.generate.getComposerOutputs              // ({ cycle, tag? }) => ComposerOutput[]
api.generate.getActivePainterBatches         // () => PainterBatch[]
api.generate.getAllPainterBatches            // () => PainterBatch[]
api.generate.getGeneratedPalettes            // ({ cycle?, tag?, modelKey?, limit? }) => Palette[]
api.generate.getGeneratedTags                // ({ cycle }) => string[]
api.generate.getGenerationStats              // ({ cycle }) => Stats
api.generate.deleteGenerationCycle           // ({ cycle }) => void
```

**Actions (from generateActions.ts):**
```typescript
api.generateActions.selectUnderrepresentedTags   // ({ tagFrequencies }) => string[]
api.generateActions.startGeneration              // ({ tags, composerModelKey, variationsPerTag?, palettesPerVariation? }) => Result
api.generateActions.startPainterBatch            // ({ cycle, modelKeys? }) => Result
api.generateActions.pollAllActiveBatches         // () => PollResult[]
api.generateActions.cancelComposerBatch          // ({ batchId }) => void
api.generateActions.cancelPainterBatch           // ({ batchId }) => void
```

### UI State Variables Needed

```typescript
// Composer settings
const [selectedComposerModel, setSelectedComposerModel] = useState<string>(PAINTER_MODELS[0].key)
const [variationsPerTag, setVariationsPerTag] = useState(6)
const [matricesPerVariation, setMatricesPerVariation] = useState(1)

// Painter settings
const [selectedPainterModels, setSelectedPainterModels] = useState<string[]>(
  () => PAINTER_MODELS.map(m => m.key)
)

// Tag selection
const [selectedTags, setSelectedTags] = useState<string[]>([])
const [isSelectingTags, setIsSelectingTags] = useState(false)

// Loading states
const [isStartingComposer, setIsStartingComposer] = useState(false)
const [isStartingPainter, setIsStartingPainter] = useState(false)
```

### UI Sections Needed

#### 1. Composer Stage Panel
- Model dropdown (all PAINTER_MODELS)
- Variations per Tag input (default 6)
- Matrices per Variation input (default 1)
- Tag selection button + tag list
- Start Composer button
- Summary showing: `{tags} tags × {variations} variations × {matrices} matrices = {total} matrices`

#### 2. Active Batches Display
- Show active composer batches with progress
- Show active painter batches with progress
- Poll Status button
- Cancel batch buttons

#### 3. Painter Stage Panel (only show when composer outputs exist)
- Multi-select for painter models (checkboxes)
- Start Painter Batch button
- Shows how many matrices will be processed

#### 4. Results Browser
- Cycle selector
- Tag filter
- Display palettes grouped by tag
- Show model key for each palette

### Key Flow

1. User selects composer model and settings
2. User clicks "Select Tags" → AI picks 33 underrepresented tags
3. User reviews/edits tags
4. User clicks "Start Composer with {n} Tags"
   - Calls `startGeneration({ tags, composerModelKey, variationsPerTag, palettesPerVariation })`
   - Creates ONE batch with {n} requests (one per tag)
   - Each request generates {variations × matrices} palette matrices
5. Poll until composer batch completes
6. User clicks "Start Painter Batch"
   - Calls `startPainterBatch({ cycle, modelKeys })`
   - Creates ONE batch per selected model
   - Each batch has {total matrices} requests
7. Poll until all painter batches complete
8. View results in Results Browser

---

## Task 3: Add Error File Logging (Already Done)

I added error file logging to `pollGroqComposerBatch` around line 1107. This downloads `error_file_id` when batch requests fail and logs the actual error messages.

---

## Schema Reference

### ComposerBatches
```typescript
{
  cycle: number
  batchId: string
  modelKey?: PainterModelKey
  provider?: PainterProvider
  status: BatchStatus
  tags: string[]
  variationsPerTag: number
  palettesPerVariation: number
  requestCount: number
  completedCount: number
  failedCount: number
  createdAt: number
  completedAt?: number
  error?: string
  requestOrder: string[]
}
```

### ComposerOutputs
```typescript
{
  cycle: number
  tag: string
  variationIndex: number
  paletteIndex: number
  theme: string
  dimensions: string[]
  steps: StepSpec[]
  createdAt: number
  error?: string
}
```

### PainterBatches
```typescript
{
  cycle: number
  modelKey: PainterModelKey
  provider?: PainterProvider
  batchId?: string
  status: BatchStatus
  requestCount: number
  completedCount: number
  failedCount: number
  createdAt: number
  completedAt?: number
  error?: string
  requestOrder?: string[]
}
```

### GeneratedPalettes
```typescript
{
  cycle: number
  tag: string
  theme?: string
  variationIndex?: number
  paletteIndex?: number
  modelKey?: PainterModelKey
  seed?: string
  style?: PaletteStyle
  steps?: number
  angle?: PaletteAngle
  colors: string[]
  createdAt: number
  error?: string
}
```
