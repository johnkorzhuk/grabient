const LOGO_ANIM_COUNT = 8;

/** Sample each palette to the three stops used by the logo underline. */
export function logoPalettes(
  palettes: readonly (readonly string[])[],
): [string, string, string][] {
  return palettes
    .filter((colors) => colors.length > 0)
    .slice(0, LOGO_ANIM_COUNT)
    .map((colors) => [
      colors[0]!,
      colors[Math.floor((colors.length - 1) / 2)]!,
      colors[colors.length - 1]!,
    ]);
}

/** CSS for a static single palette or a looping multi-palette logo underline. */
export function logoAnimationCss(
  colors: readonly (readonly string[])[],
  name = "logo-list",
): string {
  const palettes = logoPalettes(colors);
  if (!palettes.length) return "";

  if (palettes.length === 1) {
    return palettes[0]
      .map(
        (color, stop) =>
          `.logo #logoG stop:nth-of-type(${stop + 1}){animation:none;stop-color:${color}}`,
      )
      .join("");
  }

  const n = palettes.length;
  const seg = 100 / n;
  const dwell = seg * 0.6;
  let css = "";
  for (let stop = 0; stop < 3; stop++) {
    const frames: string[] = [];
    for (let palette = 0; palette < n; palette++) {
      const color = palettes[palette]![stop]!;
      frames.push(
        `${(palette * seg).toFixed(2)}%{stop-color:${color}}`,
        `${(palette * seg + dwell).toFixed(2)}%{stop-color:${color}}`,
      );
    }
    frames.push(`100%{stop-color:${palettes[0]![stop]}}`);
    css += `@keyframes ${name}-s${stop}{${frames.join("")}}`;
  }
  css += "@media (prefers-reduced-motion: no-preference){";
  for (let stop = 0; stop < 3; stop++) {
    css += `.logo #logoG stop:nth-of-type(${stop + 1}){animation:${name}-s${stop} ${n * 3}s ease-in-out infinite}`;
  }
  return `${css}}`;
}
