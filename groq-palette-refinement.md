# Plan: Kimi K2 Tool-Use Agent for Cosine Gradient Generation

## Goal
Build a user-facing "Refine Palettes" feature that uses Kimi K2 to generate 24 curated cosine gradients from search results.

## User Flow

```
1. User searches "oxidized titanium" → Vector search returns palettes
2. User clicks "Refine palettes" button
3. Kimi K2 agent receives: query + found palette seeds
4. Agent uses generateMix + analysis tools to create variations
5. Returns 24 curated CosineCoeffs
```

## Why user-application (not grabient-ops)

- Already has search endpoint with `env.VECTORIZE` and `env.AI` bindings
- No extra API tokens needed - direct Worker bindings
- User-facing feature belongs with user-facing app
- Simpler architecture - no cross-service calls

---

## Tools for the Agent

### Design Principles

1. **Tools for I/O operations** - Things requiring bindings (Vectorize, streaming to user)
2. **Tools for algorithms** - Mixing, analysis, and parameter adjustments (reliable math)
3. **System prompt for understanding** - Teaches LLM *when* and *why* to use each tool
4. **Return coeffs, not seeds** - LLM works with numbers directly, no decoding needed
5. **Reuse existing code** - Import from `@repo/data-ops` (hexToRgb, rgbToHex, cosineGradient, analyzePalette, etc.)

### Actual Tools (11 total)

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `search_palettes` | Vector search for palettes | query, limit | coeffs[], tags[], scores[] |
| `generate_mix` | Blend palettes via algorithm | CosineCoeffs[], count | CosineCoeffs[] |
| `create_palette` | Create from scratch | a, b, c, d vectors | CosineCoeffs |
| `adjust_exposure` | Modify overall lightness | coeffs, delta (-1 to 1) | CosineCoeffs |
| `adjust_contrast` | Modify color range/saturation | coeffs, scale (0 to 2) | CosineCoeffs |
| `adjust_frequency` | Modify color cycles | coeffs, scale (0 to 2) | CosineCoeffs |
| `adjust_phase` | Rotate hue | coeffs, shift (-π to π) | CosineCoeffs |
| `analyze_palette` | Get perceptual metrics | CosineCoeffs | brightness, temperature, etc. |
| `preview_gradient` | Render to hex colors | CosineCoeffs, numStops | string[] |
| `submit_palette` | Stream ONE to user | CosineCoeffs, reasoning | { totalSubmitted, submittedSummary[] } |
| `fit_from_hex` | Convert hex colors → coeffs | hexColors[] | CosineCoeffs, error |

### System Prompt: Parameter Effects (LLM must understand this)

The system prompt teaches the model **what each parameter does visually** so it knows when to use each tool:

**Cosine Palette Formula:** `color(t) = a + b · cos(2π(c·t + d))`

```
CosineCoeffs = [[a_r, a_g, a_b, 1], [b_r, b_g, b_b, 1], [c_r, c_g, c_b, 1], [d_r, d_g, d_b, 1]]
```

| Parameter | Visual Effect | When to Adjust |
|-----------|---------------|----------------|
| **a** (bias) | Overall brightness/darkness | "too dark", "too bright", "needs more warmth" |
| **b** (amplitude) | Color intensity & range | "too washed out", "too vibrant", "muted", "pastel" |
| **c** (frequency) | How many color transitions | "too busy", "too flat", "more variation", "smoother" |
| **d** (phase) | Hue rotation & color order | "shift toward blue", "rotate colors", "different starting color" |

**Adjustment Guide for System Prompt:**

| Goal | Tool to Use | Parameter |
|------|-------------|-----------|
| Brighter | `adjust_exposure` | delta: +0.2 to +0.5 |
| Darker | `adjust_exposure` | delta: -0.2 to -0.5 |
| Warmer | `create_palette` or `fit_from_hex` | increase red bias in 'a' |
| Cooler | `create_palette` or `fit_from_hex` | increase blue bias in 'a' |
| More saturated | `adjust_contrast` | scale: 1.3 to 1.8 |
| More muted/pastel | `adjust_contrast` | scale: 0.4 to 0.7 |
| More color changes | `adjust_frequency` | scale: 1.3 to 1.8 |
| Smoother/fewer colors | `adjust_frequency` | scale: 0.5 to 0.8 |
| Shift hue 60° | `adjust_phase` | shift: π/3 ≈ 1.047 |
| Shift hue 120° | `adjust_phase` | shift: 2π/3 ≈ 2.094 |

**Ranges (from valibot schema):**

Raw coefficients (`a`, `b`, `c`, `d`): Unconstrained numbers with 3 decimal precision

Global modifiers (what tools should adjust):
- `exposure`: -1 to 1 (brightness adjustment)
- `contrast`: 0 to 2 (amplitude scaling, 1 = no change)
- `frequency`: 0 to 2 (cycle scaling, 1 = no change)
- `phase`: -π to π (hue rotation)

### Palette Creation Strategies

The model should use **multiple approaches together** for best results:

**Strategy 1: Search → Mix → Adjust**
```
1. search_palettes("oxidized titanium") → find similar palettes
2. generate_mix(top results) → create variations
3. adjust_exposure/contrast/frequency → fine-tune
4. analyze_palette + preview_gradient → evaluate
5. submit_palette if excellent
```

**Strategy 2: Hex → Fit → Adjust**
```
1. Think of target colors for "oxidized titanium": muted blue-grays
2. fit_from_hex(["#4a5568", "#5a6678", "#6a7788"]) → get coefficients
3. adjust_* tools → refine the result
4. submit_palette if excellent
```

**Strategy 3: Create → Mix → Adjust**
```
1. create_palette with known good parameters
2. generate_mix with search results to blend
3. adjust_* tools → fine-tune
4. submit_palette if excellent
```

**Combine strategies for variety:**
- Use Strategy 1 for ~8 palettes (leverage existing data)
- Use Strategy 2 for ~8 palettes (creative freedom)
- Use Strategy 3 for ~8 palettes (mathematical exploration)

### Avoiding Duplicate Submissions

The `submit_palette` tool returns a `submittedSummary` array with each call, containing:
- `brightness`, `temperature`, `amplitude` - perceptual metrics
- `hexPreview` - 3 hex colors (start, middle, end)

**System prompt should instruct the model to:**
1. Check `submittedSummary` before each submission
2. Avoid palettes with similar brightness/temperature/amplitude (within ±0.1)
3. Ensure visual diversity by comparing hexPreview colors
4. Aim for variety: some warm, some cool, some muted, some vibrant

### Why Tools for Math

1. **Reliable arithmetic** - No LLM floating point mistakes
2. **Automatic clamping** - Tools enforce valid ranges
3. **Clear intent** - Model says "make brighter" not "add 0.1 to a"
4. **System prompt focus** - Teaches *when* to adjust, not *how* to calculate

---

## Agent Workflow

**Input to agent:** Just the query string (e.g., "oxidized titanium")

**Agent does tool work BEFORE results stream to user:**

```
User clicks "Refine palettes" for query "oxidized titanium"
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: Discovery                                        │
├─────────────────────────────────────────────────────────────┤
│  Agent: search_palettes("oxidized titanium metallic", 10)  │
│  → Finds similar palettes (may be poor matches with 180!)  │
│                                                             │
│  Agent: Evaluate search quality                            │
│  → Good matches? Use as base for mixing                    │
│  → Poor matches? Create from scratch using parameter       │
│       knowledge (see Cosine Palette Formula)               │
│                                                             │
│  For "oxidized titanium" model might reason:               │
│  "Search results are too colorful. I need muted blue-grays │
│   with low contrast. I'll create a base palette with:      │
│   - a = [0.4, 0.45, 0.5] (medium brightness, cool bias)    │
│   - b = [0.1, 0.1, 0.15] (low contrast/saturation)         │
│   - c = [0.5, 0.7, 1.0] (subtle frequency variation)       │
│   - d = [0.0, 0.1, 0.2] (slight phase offset for depth)"   │
└─────────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: Generate & Stream Loop (streams as it finds)     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  a. generate_mix([coeffs...], 20)                   │   │
│  │     → Creates variations blending found palettes    │   │
│  │                                                     │   │
│  │  b. analyze_palette for each variation              │   │
│  │     → Gets brightness, temperature, amplitude       │   │
│  │                                                     │   │
│  │  c. preview_gradient for promising candidates       │   │
│  │     → Sees actual hex colors                        │   │
│  │                                                     │   │
│  │  d. Evaluate against query semantics                │   │
│  │     → Found excellent palette?                      │   │
│  │       ↓                                             │   │
│  │     ╔═══════════════════════════════════════════╗   │   │
│  │     ║  STREAM TO USER IMMEDIATELY               ║   │   │
│  │     ║  submit_palette(coeffs) → User sees it!   ║   │   │
│  │     ╚═══════════════════════════════════════════╝   │   │
│  │                                                     │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│              ┌──────────────────────┐                       │
│              │  Have 24 streamed?   │                       │
│              └──────────┬───────────┘                       │
│                    NO   │   YES                             │
│              ┌──────────┴───────────┐                       │
│              │                      │                       │
│              ▼                      ▼                       │
│         Loop back to (a)         DONE                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

User sees palettes appearing progressively as they're found!
                    ↓
┌─────────────────────────────────────────────────────────────┐
│  PHASE 5: Feedback Loop                                    │
├─────────────────────────────────────────────────────────────┤
│  User: 👎 on palette #5                                    │
│  → Feedback sent to model as message                       │
│  → Model generates replacement(s)                          │
│  → New palette(s) stream to user                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Streaming with TanStack AI + Custom Groq Adapter

**Approach:** Use TanStack AI with a custom Groq connection adapter.

**Why TanStack AI:**
- Isomorphic tool system with Zod schemas
- Automatic tool execution + result streaming
- Type-safe tool definitions
- `useChat` hook for React
- Custom adapters supported via `stream()` utility

### Custom Groq Adapter

```typescript
// apps/user-application/src/lib/palette-gen/groq-adapter.ts

import { stream, type ConnectionAdapter } from "@tanstack/ai-react";
import type { StreamChunk, ModelMessage } from "@tanstack/ai";
import Groq from "groq-sdk";

export function createGroqAdapter(apiKey: string): ConnectionAdapter {
  const groq = new Groq({ apiKey });

  return stream(async function* (
    messages: ModelMessage[],
    data?: { model?: string; tools?: any[] },
    signal?: AbortSignal
  ): AsyncIterable<StreamChunk> {
    const response = await groq.chat.completions.create({
      model: data?.model ?? "moonshotai/kimi-k2-instruct",
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      tools: data?.tools,
      stream: true,
    });

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield { type: "text", content: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          yield {
            type: "tool_call",
            toolCallId: tc.id,
            toolName: tc.function?.name,
            args: JSON.parse(tc.function?.arguments ?? "{}"),
          };
        }
      }
    }
  });
}
```

### Tool Definitions (5 tools)

```typescript
// apps/user-application/src/lib/palette-gen/tools.ts

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { generateMix, analyzePalette, cosineGradient, rgbToHex, deserializeGrabientSeed } from "@repo/data-ops";

const CosineCoeffsSchema = z.array(z.array(z.number()).length(4)).length(4);

// 1. Search tool - returns coeffs directly (not seeds)
export const searchPalettesTool = toolDefinition({
  name: "search_palettes",
  description: "Vector search for palettes. Returns coefficients directly - no decoding needed.",
  inputSchema: z.object({
    query: z.string().describe("Search query - colors, moods, styles, materials"),
    limit: z.number().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      coeffs: CosineCoeffsSchema,
      tags: z.array(z.string()),
      score: z.number(),
    })),
  }),
}).server(async ({ query, limit }, { env }) => {
  const embedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [query] });
  const matches = await env.VECTORIZE.query(embedding.data[0], { topK: limit, returnMetadata: "all" });

  return {
    results: matches.matches.map(m => {
      const palette = deserializeGrabientSeed(m.metadata.seed);
      return {
        coeffs: palette.cosCoeffs,
        tags: m.metadata.tags,
        score: m.score,
      };
    }),
  };
});

// 2. Generation tool - complex mixing algorithm
export const generateMixTool = toolDefinition({
  name: "generate_mix",
  description: "Generate palette variations by blending input palettes using mixing algorithm",
  inputSchema: z.object({
    coeffs: z.array(CosineCoeffsSchema).min(1).max(10),
    count: z.number().min(1).max(50).default(20),
  }),
  outputSchema: z.object({
    palettes: z.array(CosineCoeffsSchema),
  }),
}).server(async ({ coeffs, count }) => {
  const result = generateMix(coeffs, { count });
  return { palettes: result.output.map(p => p.coeffs) };
});

// 3. Analysis tool - perceptual metrics
export const analyzePaletteTool = toolDefinition({
  name: "analyze_palette",
  description: "Get perceptual metrics for a palette",
  inputSchema: z.object({
    coeffs: CosineCoeffsSchema,
  }),
  outputSchema: z.object({
    brightness: z.number().describe("0-1, overall lightness"),
    amplitude: z.number().describe("0-1, color intensity/saturation"),
    temperature: z.number().describe("0=cool/blue, 1=warm/red"),
    complexity: z.number().describe("0-1, frequency variation"),
  }),
}).server(async ({ coeffs }) => {
  return analyzePalette(coeffs);
});

// 4. Preview tool - render to hex
export const previewGradientTool = toolDefinition({
  name: "preview_gradient",
  description: "Render palette to hex color stops for visualization",
  inputSchema: z.object({
    coeffs: CosineCoeffsSchema,
    numStops: z.number().min(3).max(10).default(5),
  }),
  outputSchema: z.object({
    hexColors: z.array(z.string()),
  }),
}).server(async ({ coeffs, numStops }) => {
  const rgb = cosineGradient(numStops, coeffs);
  return { hexColors: rgb.map(([r, g, b]) => rgbToHex(r, g, b)) };
});

// 5. Create palette from scratch
export const createPaletteTool = toolDefinition({
  name: "create_palette",
  description: "Create a cosine palette from scratch. Use when search results don't match the query.",
  inputSchema: z.object({
    a: z.array(z.number()).length(3).describe("Bias [r,g,b] - base brightness (0-1)"),
    b: z.array(z.number()).length(3).describe("Amplitude [r,g,b] - contrast (-0.5 to 0.5)"),
    c: z.array(z.number()).length(3).describe("Frequency [r,g,b] - color cycles (0.5-2)"),
    d: z.array(z.number()).length(3).describe("Phase [r,g,b] - hue offset (0-1)"),
  }),
  outputSchema: z.object({ coeffs: CosineCoeffsSchema }),
}).server(async ({ a, b, c, d }) => {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return {
    coeffs: [
      [clamp(a[0], 0, 1), clamp(a[1], 0, 1), clamp(a[2], 0, 1), 1],
      [clamp(b[0], -0.6, 0.6), clamp(b[1], -0.6, 0.6), clamp(b[2], -0.6, 0.6), 1],
      [clamp(c[0], 0.1, 3), clamp(c[1], 0.1, 3), clamp(c[2], 0.1, 3), 1],
      [((d[0] % 1) + 1) % 1, ((d[1] % 1) + 1) % 1, ((d[2] % 1) + 1) % 1, 1],
    ],
  };
});

// 6. Adjust exposure (brightness via 'a' vector)
// Range from schema: exposure [-1, 1]
export const adjustExposureTool = toolDefinition({
  name: "adjust_exposure",
  description: "Adjust overall brightness. Positive = brighter, negative = darker.",
  inputSchema: z.object({
    coeffs: CosineCoeffsSchema,
    delta: z.number().min(-1).max(1).describe("Amount to add (-1 to +1)"),
  }),
  outputSchema: z.object({ coeffs: CosineCoeffsSchema }),
}).server(async ({ coeffs, delta }) => {
  const result = coeffs.map(row => [...row]) as CosineCoeffs;
  result[0] = [
    Number((coeffs[0][0] + delta).toFixed(3)),
    Number((coeffs[0][1] + delta).toFixed(3)),
    Number((coeffs[0][2] + delta).toFixed(3)),
    1,
  ];
  return { coeffs: result };
});

// 7. Adjust contrast (amplitude via 'b' vector)
// Range from schema: contrast [0, 2], where 1 = no change
export const adjustContrastTool = toolDefinition({
  name: "adjust_contrast",
  description: "Scale color intensity/saturation. 1 = no change, >1 = more vibrant, <1 = more muted.",
  inputSchema: z.object({
    coeffs: CosineCoeffsSchema,
    scale: z.number().min(0).max(2).describe("Multiplier (0-2, where 1 = no change)"),
  }),
  outputSchema: z.object({ coeffs: CosineCoeffsSchema }),
}).server(async ({ coeffs, scale }) => {
  const result = coeffs.map(row => [...row]) as CosineCoeffs;
  result[1] = [
    Number((coeffs[1][0] * scale).toFixed(3)),
    Number((coeffs[1][1] * scale).toFixed(3)),
    Number((coeffs[1][2] * scale).toFixed(3)),
    1,
  ];
  return { coeffs: result };
});

// 8. Adjust frequency (cycles via 'c' vector)
// Range from schema: frequency [0, 2], where 1 = no change
export const adjustFrequencyTool = toolDefinition({
  name: "adjust_frequency",
  description: "Scale color transitions. 1 = no change, >1 = more color changes, <1 = smoother.",
  inputSchema: z.object({
    coeffs: CosineCoeffsSchema,
    scale: z.number().min(0).max(2).describe("Multiplier (0-2, where 1 = no change)"),
  }),
  outputSchema: z.object({ coeffs: CosineCoeffsSchema }),
}).server(async ({ coeffs, scale }) => {
  const result = coeffs.map(row => [...row]) as CosineCoeffs;
  result[2] = [
    Number((coeffs[2][0] * scale).toFixed(3)),
    Number((coeffs[2][1] * scale).toFixed(3)),
    Number((coeffs[2][2] * scale).toFixed(3)),
    1,
  ];
  return { coeffs: result };
});

// 9. Adjust phase (hue rotation via 'd' vector)
// Range from schema: phase [-π, π]
export const adjustPhaseTool = toolDefinition({
  name: "adjust_phase",
  description: "Rotate hue/colors. Uses radians: π/3 ≈ 1.047 = 60° rotation.",
  inputSchema: z.object({
    coeffs: CosineCoeffsSchema,
    shift: z.number().min(-Math.PI).max(Math.PI).describe("Radians to add (-π to π)"),
  }),
  outputSchema: z.object({ coeffs: CosineCoeffsSchema }),
}).server(async ({ coeffs, shift }) => {
  const result = coeffs.map(row => [...row]) as CosineCoeffs;
  result[3] = [
    Number((coeffs[3][0] + shift).toFixed(3)),
    Number((coeffs[3][1] + shift).toFixed(3)),
    Number((coeffs[3][2] + shift).toFixed(3)),
    1,
  ];
  return { coeffs: result };
});

// 10. Submit tool - streams ONE palette to user immediately
// Returns summary of all submitted palettes so model avoids duplicates
export const submitPaletteTool = toolDefinition({
  name: "submit_palette",
  description: "Stream one excellent palette to user. Returns summary of ALL submitted palettes so you can avoid duplicates. Continue until 24 submitted.",
  inputSchema: z.object({
    coeffs: CosineCoeffsSchema,
    reasoning: z.string().describe("Brief explanation of why this matches the query"),
  }),
  outputSchema: z.object({
    submitted: z.boolean(),
    totalSubmitted: z.number(),
    submittedSummary: z.array(z.object({
      index: z.number(),
      brightness: z.number(),
      temperature: z.number(),
      amplitude: z.number(),
      hexPreview: z.array(z.string()).length(3),
    })).describe("Summary of all submitted palettes - check this to avoid similar submissions"),
  }),
}).server(async ({ coeffs, reasoning }, { streamToUser, session }) => {
  session.submittedCount = (session.submittedCount || 0) + 1;
  session.submittedPalettes = session.submittedPalettes || [];

  // Analyze this palette for the summary
  const analysis = analyzePalette(coeffs);
  const rgb = cosineGradient(3, coeffs);
  const hexPreview = rgb.map(([r, g, b]) => rgbToHex(r, g, b));

  // Store summary
  session.submittedPalettes.push({
    index: session.submittedCount,
    brightness: analysis.brightness,
    temperature: analysis.temperature,
    amplitude: analysis.amplitude,
    hexPreview,
  });

  // Stream to user
  streamToUser({
    type: "palette",
    index: session.submittedCount,
    coeffs,
    reasoning,
  });

  return {
    submitted: true,
    totalSubmitted: session.submittedCount,
    submittedSummary: session.submittedPalettes,
  };
});

// 11. Fit hex colors to cosine coefficients using gradient descent
// This lets the LLM describe colors it wants and get valid coefficients
export const fitFromHexTool = toolDefinition({
  name: "fit_from_hex",
  description: `Convert an array of hex colors into cosine palette coefficients using gradient descent.
  Use this when you know the specific colors you want but need valid CosineCoeffs.
  Provide 3-8 hex colors representing key points along the gradient.
  Returns fitted coefficients and error metric (lower is better, <0.01 is excellent).`,
  inputSchema: z.object({
    hexColors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
      .min(3).max(8)
      .describe("Array of hex colors, e.g. ['#ffffc4', '#ffbe8e', '#e20b3d', '#b00012']"),
  }),
  outputSchema: z.object({
    coeffs: CosineCoeffsSchema,
    error: z.number().describe("Fit error - lower is better, <0.01 is excellent"),
    comparison: z.array(z.object({
      target: z.string(),
      fitted: z.string(),
      errorRgb: z.number(),
    })).describe("Per-color comparison showing fit quality"),
  }),
}).server(async ({ hexColors }) => {
  // Uses gradient descent to fit hex colors to cosine coefficients
  const result = fitCosinePaletteRobust(hexColors, 2000, 0.05, 5);
  const validation = validateFit(hexColors, result);

  return {
    coeffs: [
      [...result.a, 1],
      [...result.b, 1],
      [...result.c, 1],
      [...result.d, 1],
    ] as CosineCoeffs,
    error: result.error,
    comparison: validation.colorComparisons.map(c => ({
      target: c.original,
      fitted: c.fitted,
      errorRgb: c.error,
    })),
  };
});

export const paletteTools = [
  searchPalettesTool,
  generateMixTool,
  analyzePaletteTool,
  previewGradientTool,
  createPaletteTool,
  adjustExposureTool,
  adjustContrastTool,
  adjustFrequencyTool,
  adjustPhaseTool,
  submitPaletteTool,
  fitFromHexTool,
];
```

### Gradient Descent Implementation (for `fit_from_hex`)

**Important: Reuse existing utilities from `@repo/data-ops` instead of duplicating:**
- `hexToRgb` - already exists
- `rgbToHex` - already exists
- `cosineGradient` / cosine color formula - already exists

```typescript
// packages/data-ops/src/gradient-gen/fit.ts

import { hexToRgb, rgbToHex, cosineGradient } from './index';

type Vec3 = [number, number, number];

interface CosinePaletteResult {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  d: Vec3;
  error: number;
}

// Reuse existing cosineColor logic or inline for optimization
function cosineColor(t: number, a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 {
  return [
    a[0] + b[0] * Math.cos(2 * Math.PI * (c[0] * t + d[0])),
    a[1] + b[1] * Math.cos(2 * Math.PI * (c[1] * t + d[1])),
    a[2] + b[2] * Math.cos(2 * Math.PI * (c[2] * t + d[2])),
  ];
}

function objectiveFunction(params: number[], targetColors: Vec3[], tValues: number[]): number {
  const a: Vec3 = [params[0], params[1], params[2]];
  const b: Vec3 = [params[3], params[4], params[5]];
  const c: Vec3 = [params[6], params[7], params[8]];
  const d: Vec3 = [params[9], params[10], params[11]];

  let totalError = 0;
  for (let i = 0; i < targetColors.length; i++) {
    const generated = cosineColor(tValues[i], a, b, c, d);
    for (let j = 0; j < 3; j++) {
      const diff = generated[j] - targetColors[i][j];
      totalError += diff * diff;
    }
  }
  return totalError;
}

export function fitCosinePaletteRobust(
  hexColors: string[],
  maxIterations = 2000,
  learningRate = 0.05,
  attempts = 5,
): CosinePaletteResult {
  const targetColors = hexColors.map(hexToRgb);
  const tValues = hexColors.map((_, i) => i / (hexColors.length - 1));

  let bestResult: CosinePaletteResult | null = null;
  let bestError = Infinity;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Random initial guess
    let params = [
      Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1, // a
      Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1, // b
      Math.random() * 2 + 0.5, Math.random() * 2 + 0.5, Math.random() * 2 + 0.5,       // c
      Math.random(), Math.random(), Math.random(),                                       // d
    ];

    const epsilon = 1e-6;
    let currentLR = learningRate;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Numerical gradient
      const gradient = new Array(12);
      for (let i = 0; i < 12; i++) {
        const plus = [...params]; plus[i] += epsilon;
        const minus = [...params]; minus[i] -= epsilon;
        gradient[i] = (objectiveFunction(plus, targetColors, tValues) -
                       objectiveFunction(minus, targetColors, tValues)) / (2 * epsilon);
      }

      // Update with clamping
      for (let i = 0; i < 12; i++) {
        params[i] -= currentLR * gradient[i];
        if (i < 6) params[i] = Math.max(0, Math.min(1, params[i]));
        else if (i < 9) params[i] = Math.max(0.1, Math.min(5, params[i]));
        else params[i] = ((params[i] % 1) + 1) % 1;
      }

      if (iter > 500 && iter % 200 === 0) currentLR *= 0.9;
    }

    const finalError = objectiveFunction(params, targetColors, tValues);
    if (finalError < bestError) {
      bestError = finalError;
      bestResult = {
        a: [params[0], params[1], params[2]],
        b: [params[3], params[4], params[5]],
        c: [params[6], params[7], params[8]],
        d: [params[9], params[10], params[11]],
        error: finalError,
      };
    }
  }

  return bestResult!;
}

export function validateFit(hexColors: string[], coeffs: CosinePaletteResult) {
  const tValues = hexColors.map((_, i) => i / (hexColors.length - 1));
  return {
    colorComparisons: hexColors.map((hex, i) => {
      const target = hexToRgb(hex);
      const generated = cosineColor(tValues[i], coeffs.a, coeffs.b, coeffs.c, coeffs.d);
      const error = (Math.abs(target[0] - generated[0]) +
                     Math.abs(target[1] - generated[1]) +
                     Math.abs(target[2] - generated[2])) / 3 * 255;
      return { original: hex, fitted: rgbToHex(...generated), error };
    }),
  };
}
```

### Reusing Existing Server Function?

**Recommendation: Keep tool handlers separate from the user-facing search endpoint.**

| Concern | User Search Endpoint | Tool Handler |
|---------|---------------------|--------------|
| Auth | ✅ Checks session | ❌ Not needed (server-side) |
| KV cache | ✅ For perf | ❌ Skip (internal call) |
| Rate limiting | ✅ Per-user | ❌ Already rate-limited at refine endpoint |
| Analytics | ✅ Track searches | ❌ Skip (internal exploration) |
| Return format | Seeds + metadata | Coeffs directly |

**Extract shared core if needed:**
```typescript
// packages/data-ops/src/search/core.ts
export async function vectorSearch(env: Env, query: string, limit: number) {
  const embedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [query] });
  return env.VECTORIZE.query(embedding.data[0], { topK: limit, returnMetadata: "all" });
}
```

Then both the user endpoint and tool can use this core, adding their own concerns.

### Server Function

```typescript
// apps/user-application/src/server-functions/refine.ts

import { chat, toStreamResponse } from "@tanstack/ai";
import { createGroqAdapter } from "../lib/palette-gen/groq-adapter";
import { paletteTools, SYSTEM_PROMPT } from "../lib/palette-gen/tools";

export const refinePalettes = createServerFn({ method: 'POST' })
  .validator(z.object({
    query: z.string(),
    inputSeeds: z.array(z.string()).min(1).max(20),
  }))
  .handler(async ({ data, context }) => {
    const { query, inputSeeds } = data;
    const adapter = createGroqAdapter(context.env.GROQ_API_KEY);

    const stream = chat({
      adapter,
      model: "moonshotai/kimi-k2-instruct",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Generate 24 palettes for "${query}". Seeds: ${inputSeeds.join(", ")}` },
      ],
      tools: paletteTools,
    });

    return toStreamResponse(stream);
  });
```

### Frontend Usage

**Flow:** Search results → "Refine results" → Stream 24 palettes → Feedback loop

**Key insight:** Feedback behavior differs based on source:

| Source | Analytics | D1 Database | Kimi K2 |
|--------|-----------|-------------|---------|
| Vector search | ✅ POST | ✅ Update `searchFeedback` | ❌ |
| Refined results | ✅ POST | ❌ Skip | ✅ Send feedback |

```typescript
// apps/user-application/src/routes/$query.tsx

import { useState } from "react";
import { refinePalettes, sendRefineFeedback } from "../server-functions/refine";

type RefinedPalette = {
  id: string;  // Unique ID for this generation session
  coeffs: CosineCoeffs;
  feedback?: "good" | "bad";
};

function SearchResults({ query, searchResults }) {
  const [isRefining, setIsRefining] = useState(false);
  const [refinedPalettes, setRefinedPalettes] = useState<RefinedPalette[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Initial refinement
  const handleRefine = async () => {
    setIsRefining(true);
    setRefinedPalettes([]);

    const inputSeeds = searchResults.map(r => r.seed);
    const stream = await refinePalettes({ data: { query, inputSeeds } });

    for await (const chunk of stream) {
      if (chunk.type === "session") {
        setSessionId(chunk.sessionId);
      } else if (chunk.type === "palette") {
        setRefinedPalettes(prev => [...prev, {
          id: chunk.id,
          coeffs: chunk.coeffs,
        }]);
      } else if (chunk.type === "complete") {
        setIsRefining(false);
      }
    }
  };

  // Feedback on refined palettes → sends to model, not DB
  const handleRefinedFeedback = async (paletteId: string, feedback: "good" | "bad") => {
    // Update local state
    setRefinedPalettes(prev =>
      prev.map(p => p.id === paletteId ? { ...p, feedback } : p)
    );

    // Send feedback to model (this continues the conversation)
    const stream = await sendRefineFeedback({
      data: {
        sessionId,
        paletteId,
        feedback,
        query,
      }
    });

    // Model may generate replacement palettes
    for await (const chunk of stream) {
      if (chunk.type === "palette") {
        // Add new palette or replace the bad one
        setRefinedPalettes(prev => [...prev, { id: chunk.id, coeffs: chunk.coeffs }]);
      }
    }
  };

  return (
    <div>
      {/* Vector search results - feedback goes to DB */}
      <div>
        {searchResults.map(r => (
          <PaletteCard
            key={r.seed}
            {...r}
            onFeedback={(fb) => updateSearchFeedback(r.seed, query, fb)} // Existing DB behavior
          />
        ))}
      </div>

      <button onClick={handleRefine} disabled={isRefining}>
        {isRefining ? "Refining..." : "Refine results"}
      </button>

      {/* Refined palettes - feedback goes to model */}
      {refinedPalettes.length > 0 && (
        <div>
          <h3>Refined Palettes</h3>
          {refinedPalettes.map((p) => (
            <PaletteCard
              key={p.id}
              coeffs={p.coeffs}
              feedback={p.feedback}
              onFeedback={(fb) => handleRefinedFeedback(p.id, fb)} // → Model, not DB
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

### Feedback as Conversation

When user gives feedback on refined palettes, it's sent to the model:

```typescript
// apps/user-application/src/server-functions/refine.ts

export const sendRefineFeedback = createServerFn({ method: 'POST' })
  .validator(z.object({
    sessionId: z.string(),
    paletteId: z.string(),
    feedback: z.enum(["good", "bad"]),
    query: z.string(),
  }))
  .handler(async ({ data, context }) => {
    const { sessionId, paletteId, feedback, query } = data;

    // Retrieve conversation history from session
    const session = await getSession(sessionId);

    // Add feedback as user message
    const feedbackMessage = feedback === "bad"
      ? `Palette ${paletteId} doesn't match "${query}". Generate a better replacement.`
      : `Palette ${paletteId} is a good match for "${query}". Generate more like it.`;

    session.messages.push({ role: "user", content: feedbackMessage });

    // Continue conversation with model
    const stream = chat({
      adapter: createGroqAdapter(context.env.GROQ_API_KEY),
      model: "moonshotai/kimi-k2-instruct",
      messages: session.messages,
      tools: paletteTools,
    });

    return toStreamResponse(stream);
  });
```

### Session Management

Need to persist conversation state between feedback rounds:

```typescript
// apps/user-application/src/lib/palette-gen/session.ts

// In-memory for now (could use KV or Durable Objects later)
const sessions = new Map<string, RefineSession>();

interface RefineSession {
  id: string;
  query: string;
  messages: Message[];
  palettes: Map<string, CosineCoeffs>;  // paletteId → coeffs
  createdAt: number;
}

export function createSession(query: string, initialMessages: Message[]): RefineSession {
  const session: RefineSession = {
    id: nanoid(),
    query,
    messages: initialMessages,
    palettes: new Map(),
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): RefineSession | undefined {
  return sessions.get(id);
}
```

---

## File Structure

```
apps/user-application/src/
├── server-functions/
│   ├── search.ts              # Existing search endpoint
│   └── refine.ts              # NEW: Refine + feedback endpoints
├── lib/
│   ├── palette-gen/
│   │   ├── groq-adapter.ts    # Custom Groq connection adapter
│   │   ├── tools.ts           # Zod tool definitions + handlers
│   │   ├── prompts.ts         # System prompt
│   │   ├── scoring.ts         # Automated scoring logic
│   │   └── session.ts         # Session state management
```

---

## Implementation Steps

### Phase 1: Dependencies & Setup
- [ ] Add `groq-sdk` and `zod` to user-application package.json
- [ ] Add `GROQ_API_KEY` to wrangler secrets
- [ ] Verify TanStack AI is compatible (check if custom adapter needed)

### Phase 2: Tools & Prompts
- [ ] Create `lib/palette-gen/tools.ts` - 5 tool definitions
- [ ] Create `lib/palette-gen/prompts.ts` - System prompt with cosine math instructions
- [ ] Extract `vectorSearch` core function if reusing logic

### Phase 3: Agent Integration
- [ ] Create `lib/palette-gen/groq-adapter.ts` - Custom adapter for Groq/Kimi K2
- [ ] Create `server-functions/refine.ts` - Main endpoint
- [ ] Create `lib/palette-gen/session.ts` - Session state for feedback

### Phase 4: Frontend
- [ ] Add "Refine palettes" button to `$query.tsx`
- [ ] Handle streaming response (progressive palette display)
- [ ] Wire up feedback to `sendRefineFeedback`

---

## Key Files to Create

| File | Purpose |
|------|---------|
| `src/lib/palette-gen/tools.ts` | 5 tool definitions with Zod schemas |
| `src/lib/palette-gen/prompts.ts` | System prompt with cosine palette math |
| `src/lib/palette-gen/groq-adapter.ts` | Custom TanStack AI adapter for Groq |
| `src/lib/palette-gen/session.ts` | Session state for multi-turn feedback |
| `src/server-functions/refine.ts` | Refine + feedback endpoints |

---

## Environment Variables

```bash
# Add to wrangler.jsonc secrets
GROQ_API_KEY=...
```

---

## Dependencies

**Install in `apps/user-application`:**
```bash
cd apps/user-application
pnpm add @tanstack/ai groq-sdk zod
```

**Zod version notes:**
- Zod v4 is stable and production-ready ([source](https://zod.dev/v4/versioning))
- TanStack libraries now support Zod v4 (>= v4.0.6) ([source](https://github.com/TanStack/router/issues/4322))
- If TanStack AI has issues with v4, fall back to v3: `pnpm add zod@3`
- Project uses Valibot elsewhere - Zod is only for tool schemas (TanStack AI requirement)

**Already available (reuse from workspace):**
- `@repo/data-ops` - hexToRgb, rgbToHex, cosineGradient, analyzePalette, generateMix, etc.

**Model:** `moonshotai/kimi-k2-instruct` (Kimi K2 on Groq)

---

## Summary

| Component | Technology |
|-----------|------------|
| LLM Provider | Groq (Kimi K2 `moonshotai/kimi-k2-instruct`) |
| AI Framework | TanStack AI with custom Groq adapter |
| Streaming | TanStack AI `chat()` + `toStreamResponse()` |
| Tool Count | **11 tools** (search, mix, create, adjust×4, analyze, preview, submit, fit_from_hex) |
| Math Operations | **Tools** (reliable arithmetic with clamping) |
| System Prompt | Teaches *when* to use each tool, parameter effects |
| Tool Definitions | Zod schemas via `toolDefinition()` |
| Tool Execution | Server-side via `.server()` handlers |
| Gradient Tools | `@repo/data-ops` (generateMix, analyzePalette, etc.) |
| Frontend | Simple button + `for await` stream reader (no chat UI) |

### Architecture Decisions
- **Tools for math**: Reliable arithmetic, automatic clamping, no LLM mistakes
- **No seed handling**: LLM works with coeffs directly
- **System prompt focus**: Teaches model *what each parameter does visually*

---

## Sources & Documentation

### TanStack AI
- [TanStack AI Overview](https://tanstack.com/ai/latest/docs/getting-started/overview) - Framework overview, adapter pattern
- [TanStack AI Tools Guide](https://tanstack.com/ai/latest/docs/guides/tools) - `toolDefinition()` with Zod schemas, `.server()` handlers
- [TanStack AI Server Tools](https://tanstack.com/ai/latest/docs/guides/server-tools) - Server-side tool execution, environment access
- [TanStack AI Tool Architecture](https://tanstack.com/ai/latest/docs/guides/tool-architecture) - Isomorphic tool design
- [TanStack AI Core API](https://tanstack.com/ai/latest/docs/api/ai) - `chat()` function, `toStreamResponse()`, streaming
- [ToolDefinition Reference](https://tanstack.com/ai/latest/docs/reference/interfaces/ToolDefinition) - Full API reference
- [TanStack AI GitHub](https://github.com/TanStack/ai) - Source code, examples

### Groq SDK
- [Groq TypeScript SDK](https://github.com/groq/groq-typescript) - Official TypeScript library
- [Groq Tool Use Docs](https://console.groq.com/docs/tool-use) - Tool/function calling patterns
- [Groq Text Generation](https://console.groq.com/docs/text-chat) - Chat completions, streaming
- [Groq API Reference](https://console.groq.com/docs/api-reference) - Full API spec
- [Groq Client Libraries](https://console.groq.com/docs/libraries) - SDK installation

### Kimi K2 Model
- [Kimi K2 Model Page](https://console.groq.com/docs/model/moonshotai/kimi-k2-instruct) - Model ID, capabilities, pricing
- [Kimi K2 0905 (Latest)](https://console.groq.com/docs/model/moonshotai/kimi-k2-instruct-0905) - Updated version with 256K context
- [Kimi K2 Announcement](https://groq.com/blog/introducing-kimi-k2-0905-on-groqcloud) - Performance benchmarks, features
- [Moonshot AI GitHub](https://github.com/MoonshotAI/Kimi-K2) - Model documentation

### Key Model Details
- **Model ID:** `moonshotai/kimi-k2-instruct` (routes to 0905)
- **Context:** 131,072 tokens (256K on 0905)
- **Output:** 16,384 max tokens
- **Speed:** ~200 tokens/sec
- **Pricing:** $1.00/1M input, $3.00/1M output
- **Capabilities:** Tool Use, JSON Object Mode, JSON Schema Mode

### Cosine Gradient Math
- Formula: `color(t) = a + b · cos(2π(c·t + d))`
- [Inigo Quilez - Cosine Palettes](https://iquilezles.org/articles/palettes/) - Original algorithm
- Existing implementation: `packages/data-ops/src/gradient-gen/mix.ts`
