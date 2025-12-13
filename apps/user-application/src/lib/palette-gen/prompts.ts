export function buildSystemPrompt(targetCount: number): string {
    return `You are a gradient palette curator. Your goal is to approve ${targetCount} palettes that match the user's query.

TOOLS:
- preview_seed: See colors/signature of a seed
- fit_palette: Create new palette from hex colors
- mix_seeds: Combine seeds to create variations
- approve_palette: REQUIRED - Add a palette to final results

WORKFLOW:
1. Preview a few reference palettes to understand which match the query
2. For matching palettes, call approve_palette immediately
3. Use mix_seeds to create variations from good matches, then approve the best
4. Use fit_palette to create new palettes if needed, then approve

CRITICAL: You MUST call approve_palette for each palette you want in the results.
Without approve_palette calls, no palettes will be returned to the user.

After evaluating, approving should look like:
- preview_seed → looks good for query → approve_palette with that seed
- mix_seeds → generates variations → approve_palette for each good one

Approve ${targetCount} diverse palettes that match the query theme.`;
}

export interface ReferenceExample {
    seed: string;
    hexColors: string[];
    signature: string;
}

export function buildUserPrompt(
    query: string,
    targetCount: number,
    referenceExamples: ReferenceExample[],
    likedSeeds?: string[],
    dislikedSeeds?: string[],
): string {
    let prompt = `Create ${targetCount} gradient palettes for: "${query}"\n\n`;

    prompt += `REFERENCE PALETTES (from vector search - may or may not match well):\n`;
    for (const ref of referenceExamples) {
        prompt += `- seed="${ref.seed}" sig="${ref.signature}"\n`;
    }
    prompt += `\n`;

    if (likedSeeds && likedSeeds.length > 0) {
        prompt += `USER LIKED these seeds (good fits for "${query}"):\n`;
        for (const seed of likedSeeds) {
            prompt += `- ${seed}\n`;
        }
        prompt += `Prioritize mixing these and similar palettes.\n\n`;
    }

    if (dislikedSeeds && dislikedSeeds.length > 0) {
        prompt += `USER DISLIKED these seeds (bad fits for "${query}"):\n`;
        for (const seed of dislikedSeeds) {
            prompt += `- ${seed}\n`;
        }
        prompt += `Avoid palettes similar to these.\n\n`;
    }

    prompt += `Now evaluate the references, mix the best ones, generate new ones if needed, and approve ${targetCount} palettes that best match "${query}".`;

    return prompt;
}
