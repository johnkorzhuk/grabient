import { generateColorDataFromSeed } from "@/lib/color-data";

interface GradientSwatchProps {
  seed: string;
  steps: number;
  className?: string;
}

/**
 * Simple linear swatch showing the gradient colors as LLMs see them
 * Uses the same number of stops as the LLM tagging process (default 11)
 */
export function GradientSwatch({ seed, steps, className }: GradientSwatchProps) {
  // Use 11 stops like the LLM sees, regardless of the palette's actual steps
  const llmSteps = 11;
  const colorData = generateColorDataFromSeed(seed, llmSteps);

  return (
    <div className={className}>
      <div className="flex h-8 rounded overflow-hidden border border-border">
        {colorData.hex.map((hex, i) => (
          <div
            key={i}
            className="flex-1"
            style={{ backgroundColor: hex }}
            title={hex}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground font-mono">
        <span>{llmSteps} stops</span>
        <span>palette: {steps} steps</span>
      </div>
    </div>
  );
}

/**
 * Compact swatch for list items
 */
export function GradientSwatchCompact({ seed, steps: _steps }: GradientSwatchProps) {
  const llmSteps = 11;
  const colorData = generateColorDataFromSeed(seed, llmSteps);

  return (
    <div className="flex h-6 rounded overflow-hidden border border-border">
      {colorData.hex.map((hex, i) => (
        <div
          key={i}
          className="flex-1"
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  );
}
