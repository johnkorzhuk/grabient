# Palette Tagging System

_Multi-Model Synthetic Data Generation for Semantic Search_

---

## 1. System Overview

This system generates semantic tags for color palettes using multiple LLMs, applies statistical consensus analysis, and creates searchable vector embeddings. Users can then search palettes using natural language queries.

### 1.1 Core Pipeline

```
Palettes → Multi-LLM Tagging → Consensus Analysis → Normalization → Vectorization → Search Index
```

### 1.2 Design Principles

- **Training Lineage Diversity:** Use 7 models from 5 different training lineages to reduce bias
- **Statistical Consensus:** Treat each model as an annotator; use frequency as confidence signal
- **Simplicity First:** Avoid over-engineering; let embedding model handle semantic nuance
- **Metadata Preservation:** Store consensus data separately from embedded text

---

## 2. Multi-Model Tagging

### 2.1 Model Selection

Models via Cloudflare Workers AI (`workers-ai-provider`):

| Model                                     | Lineage | Neurons/req |
| ----------------------------------------- | ------- | ----------- |
| `@cf/google/gemma-3-12b-it`               | Google  | ~25         |
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast` | Meta    | ~10         |

Models via Groq (`@ai-sdk/groq`):

| Model                     | Lineage        | Notes          |
| ------------------------- | -------------- | -------------- |
| `llama-3.3-70b-versatile` | Meta Llama 3.3 | Fast inference |
| `qwen/qwen3-32b`          | Qwen           | Reasoning      |

Models via external providers:

| Model                       | Provider  | Package             |
| --------------------------- | --------- | ------------------- |
| `gemini-2.0-flash`          | Google    | `@ai-sdk/google`    |
| `gpt-4o-mini`               | OpenAI    | `@ai-sdk/openai`    |
| `claude-3-5-haiku-20241022` | Anthropic | `@ai-sdk/anthropic` |

**Total: 7 models across 5 lineages (Google, Meta, Qwen, OpenAI, Anthropic)**

### 2.2 Tagging System Prompt

Use this system prompt across all LLM providers.

```
You are a color palette tagging assistant. Your job is to analyze a color palette and generate descriptive tags across several categories.

INPUT FORMAT:
You will receive a palette as hex color codes with RGB, HSL, and LCH values for each color.

OUTPUT FORMAT:
Return valid JSON only, with this exact structure:

{
  "mood": [],
  "style": [],
  "color_family": [],
  "temperature": "",
  "contrast": "",
  "brightness": "",
  "saturation": "",
  "seasonal": [],
  "associations": []
}

CATEGORY GUIDELINES:

mood: Emotional qualities the palette evokes.
Examples: calm, energetic, melancholic, playful, sophisticated, mysterious, romantic, tense

style: Design movements, eras, or aesthetic styles.
Examples: minimalist, retro, futuristic, bohemian, industrial, art deco, scandinavian, brutalist

color_family: Dominant color descriptors.
Examples: blue, earth tones, jewel tones, pastels, neutrals, monochromatic, complementary

temperature (1 value): Overall warmth. Must be exactly one of: "warm", "cool", "neutral", "cool-warm"

contrast (1 value): Tonal range. Must be exactly one of: "high", "medium", "low"

brightness (1 value): Overall lightness. Must be exactly one of: "dark", "light", "medium", "varied"

saturation (1 value): Color intensity. Must be exactly one of: "vibrant", "muted", "mixed"

seasonal: Holidays or seasons the palette evokes. Only include if there's a clear association.
Examples: christmas, halloween, easter, autumn, spring, summer, winter, valentines, thanksgiving, hanukkah, diwali, lunar new year

associations: Objects, places, concepts, or themes the palette brings to mind.
Examples: ocean, sunset, forest, corporate, luxury, organic, technology, desert, arctic

IMPORTANT: Only include tags that genuinely fit the palette. Leave arrays empty if no tags apply. Do not force tags into categories where they don't belong.

TAG RULES:
- Lowercase only
- Singular form (use "forest" not "forests")
- 1-2 words maximum per tag
- Common vocabulary (avoid obscure terms)
- Specific over generic

BLACKLIST - DO NOT use any of these terms:
- Self-referential: gradient, palette, color, colors, colour, colours, scheme, combination, blend, mix
- Generic praise: nice, good, beautiful, pretty, lovely, stunning, gorgeous, amazing, awesome, great, perfect, wonderful, excellent
- Technical: rgb, hex, hsv, hsl, lch, cmyk, srgb
- Filler: based, inspired, vibe, vibes, feeling, themed, looking, style (as a tag itself)

IMPORTANT:
- Return ONLY the JSON object, no explanations or markdown
- Do not repeat tags across categories
- Focus on what makes THIS palette distinctive
```

#### Example Input

```json
{
    "hex": ["#2d1b4e", "#5e3a8c", "#9b6fcc", "#d4a5ff", "#f0d9ff"],
    "rgb": [
        [45, 27, 78],
        [94, 58, 140],
        [155, 111, 204],
        [212, 165, 255],
        [240, 217, 255]
    ],
    "hsl": [
        [261, 49, 21],
        [266, 41, 39],
        [268, 51, 62],
        [271, 100, 82],
        [270, 100, 93]
    ],
    "lch": [
        [15, 35, 295],
        [32, 52, 300],
        [54, 58, 298],
        [75, 48, 302],
        [90, 25, 305]
    ]
}
```

#### Example Output

```json
{
    "mood": ["mysterious", "dreamy", "ethereal", "contemplative"],
    "style": ["gothic", "fantasy", "art nouveau"],
    "color_family": ["purple", "violet", "jewel tones"],
    "temperature": "cool",
    "contrast": "high",
    "brightness": "dark",
    "saturation": "vibrant",
    "seasonal": [],
    "associations": ["twilight", "amethyst", "royalty", "cosmos", "velvet"]
}
```

### 2.3 Generation Parameters

- **Temperature:** 0.7–0.9 (higher for diversity)
- **JSON Mode:** Enable if the provider supports it (OpenAI, Gemini)
- **Max Tokens:** 500 is sufficient
- **Execution:** Parallel API calls to minimize latency

---

## 3. Consensus Analysis

Each model acts as an independent annotator. Tag frequency across models serves as the consensus signal.

### 3.1 Consensus Thresholds

| Level        | Threshold (7 models) | Interpretation             |
| ------------ | -------------------- | -------------------------- |
| **Strong**   | ≥5 models agree      | High confidence; include   |
| **Moderate** | 3-4 models agree     | Medium confidence; include |
| **Weak**     | 1-2 models agree     | Low confidence; discard    |

### 3.2 Why Consensus Matters

- **Noise Reduction:** Filters out hallucinated or overly-specific tags
- **Vector Focus:** Prevents semantic dilution from irrelevant tags
- **Token Efficiency:** Keeps embedded text within model limits

---

## 4. Normalization Pipeline

### 4.1 Processing Steps

```
Raw LLM Outputs (all models)
        ↓
Flatten (combine all tag arrays)
        ↓
Normalize (lowercase, trim whitespace)
        ↓
Smart Model Pass (stemming + synonym clustering)
        ↓
Count Frequency (consensus signal)
        ↓
Filter by Threshold (drop weak consensus)
        ↓
Take Top N (30-50 tags by frequency)
        ↓
Output: Compact tag list + metadata
```

### 4.2 Normalization Rules

- Convert all tags to lowercase
- Trim leading/trailing whitespace
- **Smart Model Pass:** A single call to a capable model (Claude Opus 4.5) to:
    - Collapse synonyms to a canonical term (e.g., "calm", "peaceful", "tranquil" → "calm")
    - Collapse morphological variants (e.g., "warmth" → "warm", "forests" → "forest")
    - Return deduplicated tag list with mappings

#### Smart Model Input/Output

```
Input:  ["warm", "warmth", "warming", "calm", "tranquil", "peaceful", "sunset", "dusk", "twilight", "happy", "joyful"]
Output: ["warm", "calm", "peaceful", "sunset", "happy"]

Mappings preserved in metadata:
{
  "warm": ["warm", "warmth", "warming"],
  "calm": ["calm", "tranquil"],
  "peaceful": ["peaceful"],
  "sunset": ["sunset", "dusk", "twilight"],
  "happy": ["happy", "joyful"]
}
```

#### Smart Model System Prompt

```
You are a tag normalization assistant. Your job is to deduplicate a list of tags by collapsing synonyms and morphological variants into canonical terms.

RULES:
1. Collapse synonyms to a single canonical term:
   - "happy", "joyful", "cheerful" → "happy"
   - "sunset", "dusk", "twilight" → "sunset"
   - "calm", "tranquil" → "calm"
   - "ocean", "sea" → "ocean"

2. Collapse morphological variants:
   - "warm", "warmth", "warming" → "warm"
   - "forest", "forests", "forested" → "forest"
   - "mystery", "mysterious" → "mysterious"

3. Prefer the most common/simple form as the canonical term.

4. Preserve frequency information by tracking which original tags map to each canonical term.

INPUT FORMAT:
A JSON array of lowercase tags.

OUTPUT FORMAT:
Return valid JSON only:
{
  "canonical_tags": ["tag1", "tag2", ...],
  "mappings": {
    "canonical_tag": ["original1", "original2", ...],
    ...
  }
}

DO NOT explain. Return only the JSON object.
```

### 4.3 Output Limits

| Constraint                 | Value                  |
| -------------------------- | ---------------------- |
| Embedding model max tokens | 512 (BGE models)       |
| Target embed string tokens | 50-100                 |
| Headroom                   | 80%+ (room for growth) |

---

## 5. Vectorization Strategy

### 5.1 Embedding Model

For Cloudflare Workers:

- **Model:** `@cf/baai/bge-base-en-v1.5`
- **Dimensions:** 768
- **Max Tokens:** 512
- **Similarity Metric:** Cosine similarity

### 5.2 What Gets Embedded

Create a single concatenated string from the top N canonical tags:

```
"sunset warm modern dreamy professional tech minimal serene"
```

This string is embedded. The consensus frequency data is stored separately as metadata.

### 5.3 Metadata Storage

Store consensus data alongside the vector for filtering/ranking:

```json
{
    "id": "HQdgbAHANMDMECYYIJwEYazWTqbYAYYQQ...",
    "vector": [0.12, -0.34, "..."],
    "metadata": {
        "tag_counts": {
            "sunset": 6,
            "warm": 5,
            "professional": 4
        },
        "synonym_mappings": {
            "warm": ["warm", "warmth"],
            "calm": ["calm", "tranquil"]
        },
        "total_raw_tags": 147
    }
}
```

Note: The `id` is the palette seed string itself.

---

## 6. Search Architecture

### 6.1 Query Flow

```
User Input: "ocean vibes for mobile app"
        ↓
Embed query using same model (bge-base-en-v1.5)
        ↓
Cosine similarity search against all palette vectors
        ↓
Return top K results with metadata
```

### 6.2 Why This Works

- The embedding model understands semantic relationships ("ocean" ≈ "blue" ≈ "water")
- User doesn't need exact tag matches; meaning-based retrieval handles variations
- Compact, focused tag strings produce precise vectors without semantic dilution

---

## 7. Data Schemas

### 7.1 Palette Seed Format

Grabient uses the [Inigo Quilez cosine palette algorithm](https://iquilezles.org/articles/palettes/):

```
color(t) = a + b × cos(2π × (c × t + d))
```

Where `a`, `b`, `c`, `d` are RGB vectors (3 floats each) = **12 floats total**.

The **seed string** is a Base64-encoded serialization of these 12 parameters. It serves as both:

- **Unique identifier** (primary key)
- **Complete palette data** (can regenerate the gradient from seed alone)

Example seed: `HQdgbAHANMDMECYYIJwEYazWTqbYAYYQQNQDZiCAWKNYagkTa6YFFIohkAVjuAEhMCgSA`

URL structure: `grabient.com/{seed}?angle=90&style=linearSwatches&steps=3`

### 7.2 Input: What Gets Sent to LLMs

```json
{
  "hex": ["#4c607a", "#586675", "#8a9db2", ...],
  "rgb": [[76, 96, 122], [88, 102, 117], ...],
  "hsl": [[213, 23, 39], [210, 14, 40], ...],
  "lch": [[40, 18, 255], [43, 12, 250], ...]
}
```

### 7.3 Intermediate: Raw LLM Output

```json
{
    "seed": "HQdgbAHANMDMECYYIJwEYazWTqbYAYYQQ...",
    "model_outputs": [
        { "model": "gpt-4o-mini", "tags": {} },
        { "model": "gemini-flash", "tags": {} }
    ]
}
```

### 7.4 Output: Vector Database Record

```json
{
  "id": "HQdgbAHANMDMECYYIJwEYazWTqbYAYYQQ...",
  "vector": [768 floats],
  "metadata": {
    "tag_counts": { "sunset": 6, "warm": 5, "professional": 4 },
    "synonym_mappings": { "warm": ["warm", "warmth"], "calm": ["calm", "tranquil"] },
    "stats": {
      "total_raw": 147,
      "models_used": 7
    }
  }
}
```

Note: The seed itself is the ID. No separate identifier needed.

---

## 8. Quick Reference

### 8.1 Pipeline Summary

1. **Generate:** Run palette through 7 LLMs in parallel (temp 0.7-0.9)
2. **Collect:** Gather all tag outputs (variable per model, only tags that fit)
3. **Normalize:** Lowercase, trim, smart model for stemming + synonyms
4. **Count:** Frequency = consensus signal
5. **Filter:** Keep top 30-50 by frequency
6. **Embed:** Concatenate tags → embed → store with metadata
7. **Search:** Embed user query → cosine similarity → return top K

### 8.2 Key Numbers

| Parameter           | Value                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Models              | 7 (2 Workers AI + 2 Groq + 3 external)                                                               |
| Smart model         | Claude Opus 4.5                                                                                      |
| Tag categories      | 9 (mood, style, color_family, temperature, contrast, brightness, saturation, seasonal, associations) |
| Embed string tokens | 50-100                                                                                               |
| Vector dimensions   | 768                                                                                                  |
| Strong consensus    | ≥5/7 models                                                                                          |

---

_Architecture reference document. Implementation details intentionally omitted._
