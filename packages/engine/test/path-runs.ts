/* An SVG path read back as its subpaths' cubics, for tests that measure what a writer drew (a loop's turn, its area).
   It was Copy for Figma's reader of the field effects', the papercut's and the strings' paths until those pastes went
   (8 Nov 2026), and reads what their tracers write. */
/** A cubic Bezier of a path, absolute: its start, its two handles and its end. */
export type PathCubic = readonly [
  readonly [number, number],
  readonly [number, number],
  readonly [number, number],
  readonly [number, number]
];

/** An SVG path's subpaths as absolute cubics, each with whether a Z closes it: M, C, L, H and V in either case and Z,
    as a tracer writes them (numbers with no zero before a point, a minus sign their only separator; the kit's box loop,
    trace.ts kitBoxLoop, runs round by h and v). A line is a cubic whose handles stay on its ends. */
export function pathRuns(d: string): { cubics: PathCubic[]; closed: boolean }[] {
  const tokens = d.match(/[MmCcLlHhVvZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/g) ?? [];
  const runs: { cubics: PathCubic[]; closed: boolean }[] = [];
  let run: PathCubic[] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let command = "";
  let i = 0;
  const num = () => Number(tokens[i++]);
  const end = (closed: boolean) => {
    if (run.length) runs.push({ cubics: run, closed });
    run = [];
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
    const rel = command === command.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (command.toLowerCase()) {
      case "m": {
        end(false);
        x = ox + num();
        y = oy + num();
        sx = x;
        sy = y;
        /* pairs after a move draw lines, as SVG reads them */
        command = rel ? "l" : "L";
        break;
      }
      case "c": {
        const c1: [number, number] = [ox + num(), oy + num()];
        const c2: [number, number] = [ox + num(), oy + num()];
        const to: [number, number] = [ox + num(), oy + num()];
        run.push([[x, y], c1, c2, to]);
        [x, y] = to;
        break;
      }
      case "l":
      case "h":
      case "v": {
        const h = command.toLowerCase();
        const to: [number, number] =
          h === "l" ? [ox + num(), oy + num()] : h === "h" ? [ox + num(), y] : [x, oy + num()];
        run.push([[x, y], [x, y], to, to]);
        [x, y] = to;
        break;
      }
      case "z":
        end(true);
        x = sx;
        y = sy;
        break;
      default:
        i++;
    }
  }
  end(false);
  return runs;
}
