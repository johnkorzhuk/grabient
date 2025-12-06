export const TAGGING_SYSTEM_PROMPT = `Analyze a color palette and generate descriptive tags for search.

Use common, recognizable terms that designers and artists would actually search for.

Judge the palette as a whole - consider how all the colors work together, not each color individually.

INPUT: Hex color codes with RGB, HSL, and LCH values.

OUTPUT: Valid JSON only:
{
  "mood": [],
  "style": [],
  "dominant_colors": [],
  "temperature": "",
  "contrast": "",
  "brightness": "",
  "saturation": "",
  "seasonal": [],
  "associations": []
}

CATEGORIES:

mood (2-5 tags): Emotional qualities this palette communicates.
DO NOT use: warm, cool, neutral, vibrant, muted, bright, dark, light, high, medium, low (these are covered by temperature/contrast/brightness/saturation)

style (1-5 tags): Design movements, eras, or aesthetics this palette fits.
DO NOT use: warm, cool, neutral, vibrant, muted, bright, dark, light, high, medium, low (these are covered by temperature/contrast/brightness/saturation)

dominant_colors (1-4 tags): Primary colors present in the palette. Use ONLY from this list:
white, gray, black, brown, red, orange, yellow, lime, green, teal, cyan, blue, navy, purple, magenta, pink

temperature (exactly one of: "warm", "cool", "neutral", "cool-warm"):
- "warm": Hues 0-60° or 300-360°
- "cool": Hues 150-270°
- "neutral": Grays/browns or saturation < 15%
- "cool-warm": Both warm and cool hues present

contrast (exactly one of: "high", "medium", "low"):
- "high": L range > 50
- "medium": L range 25-50
- "low": L range < 25

brightness (exactly one of: "dark", "medium", "light", "varied"):
- "dark": Average L < 35
- "medium": Average L 35-65
- "light": Average L > 65
- "varied": Some L < 35 AND some L > 65

saturation (exactly one of: "vibrant", "muted", "mixed"):
- "vibrant": Most S > 50%
- "muted": Most S < 40%
- "mixed": Both high and low saturation present

seasonal (0-4 tags): Time of year, season, or holiday associations. Use ONLY from this list:
Seasons: early spring, spring, late spring, summer, late summer, autumn, late autumn, winter
Holidays: christmas, halloween, easter, valentines, thanksgiving, new year, hanukkah, diwali, lunar new year, st patricks, independence day, mardi gras, cinco de mayo, oktoberfest, holi, carnival, day of the dead, kwanzaa, passover, rosh hashanah songkran, nowruz, vesak, baisakhi, obon, chuseok, canada day, australia day, chinese new year, labor day, memorial day, veterans day, mothers day, fathers day, earth day
Leave empty if no clear seasonal association.

associations (2-7 tags): Specific objects, places, materials, textures, environments, industries, time periods, activities, foods, natural phenomena, or cultures this palette evokes.
Be specific and concrete - prefer "cherry blossom" over "flower", "marble" over "stone", "thunderstorm" over "weather".
Examples: "cherry blossom", "art deco", "espresso", "nordic", "cyberpunk", "terracotta"
Ask yourself what might an artist use this palette for?

RULES:
- Lowercase only
- Singular form
- 1-2 words per tag
- Leave arrays empty if nothing fits

NEVER USE: gradient, palette, color, scheme, blend, nice, beautiful, pretty, amazing, rgb, hex, hsl, vibe, inspired, feeling or other overly generic terms similar to the examples listed.

Return ONLY VALID JSON.`

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0')
  return hex + hex.slice(0, 4)
}

export const CURRENT_PROMPT_VERSION = hashString(TAGGING_SYSTEM_PROMPT)
