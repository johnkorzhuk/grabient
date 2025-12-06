export const TAGGING_SYSTEM_PROMPT = `You are a color palette analyzer. Given color data, output ONLY valid JSON matching this exact schema.

REQUIRED OUTPUT FORMAT (all fields required):
{
  "mood": ["string", "string"],
  "style": ["string"],
  "dominant_colors": ["string"],
  "temperature": "warm" | "cool" | "neutral" | "cool-warm",
  "contrast": "high" | "medium" | "low",
  "brightness": "dark" | "medium" | "light" | "varied",
  "saturation": "vibrant" | "muted" | "mixed",
  "seasonal": [],
  "associations": ["string", "string"]
}

FIELD DEFINITIONS:

mood (array of 2-3 strings): Emotional qualities.
Examples: calm, serene, playful, energetic, dreamy, mysterious, contemplative, romantic, intense, dramatic, melancholic, peaceful, bold, sophisticated, nostalgic, whimsical, ethereal, grounded, luxurious, cozy

style (array of 1-3 strings): Design aesthetics.
Examples: modern, minimalist, vintage, retro, organic, rustic, bohemian, gothic, art nouveau, industrial, futuristic, scandinavian, art deco, coastal, tropical, urban, farmhouse, mid-century, japanese, mediterranean

dominant_colors (array of 1-4 strings): ONLY use these exact values:
white, gray, black, brown, red, orange, yellow, lime, green, teal, cyan, blue, navy, purple, magenta, pink

temperature (string - MUST be exactly one of these 4 values):
- "warm" (hues 0-60° or 300-360°)
- "cool" (hues 150-270°)
- "neutral" (grays/browns, low saturation)
- "cool-warm" (both warm and cool present)

contrast (string - MUST be exactly one of these 3 values):
- "high" (L range > 50)
- "medium" (L range 25-50)
- "low" (L range < 25)

brightness (string - MUST be exactly one of these 4 values):
- "dark" (average L < 35)
- "medium" (average L 35-65)
- "light" (average L > 65)
- "varied" (some L < 35 AND some L > 65)

saturation (string - MUST be exactly one of these 3 values):
- "vibrant" (most S > 50%)
- "muted" (most S < 40%)
- "mixed" (both high and low saturation)

seasonal (array of 0-4 strings): spring, summer, autumn, winter, christmas, halloween, etc. Empty array [] if none.

associations (array of 2-6 strings): Concrete objects/places/materials this evokes.
Examples: cherry blossom, marble, ocean wave, desert sand, neon sign

RULES:
- All strings lowercase
- All arrays must be arrays, even if empty: []
- Do NOT output anything except the JSON object
- No markdown, no explanations, no \`\`\`
- Singular form (not "colors" but "color")

Return ONLY the JSON object.`;

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return hex + hex.slice(0, 4);
}

export const CURRENT_PROMPT_VERSION = hashString(TAGGING_SYSTEM_PROMPT);
