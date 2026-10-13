/* A picture as a list of marks, so one drawing serves a canvas on the page and an SVG a design tool opens: each mark is
   runs of points (open or closed) and whole circles under one paint, or a line of text with a halo. A mark may be clipped
   to a rectangle and may belong to a named layer, which the SVG keeps as a group. Coordinates are CSS pixels. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Mark {
  /** runs of points, x y in turn; a closed run is a shape */
  runs?: readonly { points: readonly number[]; closed?: boolean }[];
  /** whole circles, x y r in turn */
  circles?: readonly number[];
  /** a line of words, centered on its point; the halo is a stroke under the fill, so it reads on anything */
  text?: {
    value: string;
    x: number;
    y: number;
    size: number;
    family: string;
    halo?: string;
    haloWidth?: number;
  };
  fill?: string;
  stroke?: string;
  width?: number;
  alpha?: number;
  dash?: readonly number[];
  round?: boolean;
  clip?: Rect;
  layer?: string;
}

export type MarkContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "beginPath"
  | "rect"
  | "clip"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "arc"
  | "fill"
  | "stroke"
  | "setLineDash"
  | "fillText"
  | "strokeText"
> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
};

/** Paints the marks on a 2D context, in order. */
export function paintMarks(ctx: MarkContext, marks: readonly Mark[]): void {
  let clip: Rect | undefined;
  for (const m of marks) {
    if (m.clip !== clip) {
      if (clip) ctx.restore();
      clip = m.clip;
      if (clip) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(clip.x, clip.y, clip.w, clip.h);
        ctx.clip();
      }
    }
    ctx.globalAlpha = m.alpha ?? 1;
    if (m.text) {
      const s = m.text;
      ctx.font = `${s.size}px ${s.family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (s.halo) {
        ctx.lineJoin = "round";
        ctx.lineWidth = s.haloWidth ?? 2;
        ctx.strokeStyle = s.halo;
        ctx.strokeText(s.value, s.x, s.y);
      }
      ctx.fillStyle = m.fill ?? "#000";
      ctx.fillText(s.value, s.x, s.y);
      continue;
    }
    ctx.beginPath();
    for (const run of m.runs ?? []) {
      const p = run.points;
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      if (run.closed) ctx.closePath();
    }
    const c = m.circles ?? [];
    for (let i = 0; i < c.length; i += 3) {
      ctx.moveTo(c[i] + c[i + 2], c[i + 1]);
      ctx.arc(c[i], c[i + 1], c[i + 2], 0, Math.PI * 2);
    }
    if (m.fill) {
      ctx.fillStyle = m.fill;
      ctx.fill();
    }
    if (m.stroke) {
      ctx.strokeStyle = m.stroke;
      ctx.lineWidth = m.width ?? 1;
      ctx.lineCap = m.round ? "round" : "butt";
      ctx.lineJoin = m.round ? "round" : "miter";
      ctx.setLineDash(m.dash ? [...m.dash] : []);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  if (clip) ctx.restore();
}

const r2 = (v: number) => String(Math.round(v * 100) / 100);
const r3 = (v: number) => String(Math.round(v * 1000) / 1000);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function pathData(m: Mark): string {
  let d = "";
  for (const run of m.runs ?? []) {
    const p = run.points;
    d += `M${r2(p[0])} ${r2(p[1])}`;
    for (let i = 2; i < p.length; i += 2) d += `L${r2(p[i])} ${r2(p[i + 1])}`;
    if (run.closed) d += "Z";
  }
  const c = m.circles ?? [];
  for (let i = 0; i < c.length; i += 3) {
    const [x, y, r] = [c[i], c[i + 1], c[i + 2]];
    d += `M${r2(x + r)} ${r2(y)}A${r2(r)} ${r2(r)} 0 1 1 ${r2(x - r)} ${r2(y)}A${r2(r)} ${r2(r)} 0 1 1 ${r2(x + r)} ${r2(y)}Z`;
  }
  return d;
}
function element(m: Mark): string {
  const a = m.alpha ?? 1;
  const opacity = (name: string) => (a < 1 ? ` ${name}="${r2(a)}"` : "");
  if (m.text) {
    const s = m.text;
    /* the canvas's middle baseline: a capital's middle stands on the point */
    const at = `x="${r2(s.x)}" y="${r2(s.y + s.size * 0.35)}" font-size="${r2(s.size)}" font-family="${esc(s.family)}" text-anchor="middle"`;
    const halo = s.halo
      ? `<text ${at} fill="none" stroke="${s.halo}" stroke-width="${r2(s.haloWidth ?? 2)}" stroke-linejoin="round"${opacity("stroke-opacity")}>${esc(s.value)}</text>`
      : "";
    return `${halo}<text ${at} fill="${m.fill ?? "#000"}"${opacity("fill-opacity")}>${esc(s.value)}</text>`;
  }
  const paint = [
    `fill="${m.fill ?? "none"}"`,
    m.fill && a < 1 ? `fill-opacity="${r2(a)}"` : "",
    m.stroke ? `stroke="${m.stroke}" stroke-width="${r2(m.width ?? 1)}"` : "",
    m.stroke && m.round ? 'stroke-linecap="round" stroke-linejoin="round"' : "",
    m.stroke && m.dash?.length ? `stroke-dasharray="${m.dash.map(r3).join(" ")}"` : "",
    m.stroke && a < 1 ? `stroke-opacity="${r2(a)}"` : ""
  ]
    .filter(Boolean)
    .join(" ");
  const c = m.circles;
  if (!m.runs?.length && c?.length === 3)
    return `<circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(c[2])}" ${paint}/>`;
  return `<path d="${pathData(m)}" ${paint}/>`;
}

/** The marks as the inside of an SVG: clips as defs, a run of marks under one clip in one group, a named layer a group
    of its own (an id for Illustrator and Inkscape, data-name for Figma). `ns` keeps ids apart in one document. Marks
    that paint nothing are left out, since a design tool makes a layer of every element. */
export function marksSvg(marks: readonly Mark[], ns: string): string {
  const shown = marks.filter(m => (m.alpha ?? 1) >= 0.005);
  const clips: Rect[] = [];
  const clipId = (r: Rect) => {
    let i = clips.findIndex(c => c.x === r.x && c.y === r.y && c.w === r.w && c.h === r.h);
    if (i < 0) i = clips.push(r) - 1;
    return `${ns}c${i + 1}`;
  };
  let body = "";
  for (let i = 0; i < shown.length; ) {
    const layer = shown[i].layer;
    let group = "";
    while (i < shown.length && shown[i].layer === layer) {
      const clip = shown[i].clip;
      let run = "";
      for (; i < shown.length && shown[i].layer === layer && shown[i].clip === clip; i++)
        run += element(shown[i]);
      group += clip ? `<g clip-path="url(#${clipId(clip)})">${run}</g>` : run;
    }
    body += layer ? `<g id="${layer}" data-name="${layer}">${group}</g>` : group;
  }
  const defs = clips
    .map(
      (r, i) =>
        `<clipPath id="${ns}c${i + 1}"><rect x="${r2(r.x)}" y="${r2(r.y)}" width="${r2(r.w)}" height="${r2(r.h)}"/></clipPath>`
    )
    .join("");
  return (defs ? `<defs>${defs}</defs>` : "") + body;
}
