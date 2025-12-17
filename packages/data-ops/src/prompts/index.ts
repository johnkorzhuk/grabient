// prompts/index.ts
// Export all prompt builders

export {
    // Types
    type Luminance,
    type Chroma,
    type Temperature,
    type Hue,
    type HueShift,
    type OutputDimensionKey,
    type StepSpec,
    type PaletteMatrix,
    type VariationOutput,
    type ComposerOutput,
    type ExamplePalette,
    type ComposerConfig,
    // Constants
    OUTPUT_DIMENSIONS,
    // Functions
    buildComposerSystemPrompt,
    buildPainterSystemPrompt,
    buildSinglePainterPrompt,
    cleanJsonResponse,
    parseComposerOutput,
    parsePainterOutput,
} from "./composer-painter";
