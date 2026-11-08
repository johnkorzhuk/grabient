/* A field effect as a page that plays it, as the site's player does (ui/kit-player.ts): its scene's numbers and its
   frame's arithmetic in plain JavaScript, each expression as kit/scene.ts and kit/gl.ts write it, so a page's numbers
   are the player's to the last bit (kit/shader.test.ts holds the two together). A page carries the numbers of the
   design its shape draws (the constants its field reads, its phases' tracks), never the design's code: its phases come
   from the tracks' formula. The WebGL page runs the player's own pass (kit/gl.ts), the WebGPU page the same pass in
   WGSL (kit/wgsl.ts); the players' clock (effect-page.ts) plays them. The palette comes in as the ground, the stops and
   the shadows' and the lines' colors, which a reader may edit. Loaded with the Shader tab's WebGL and WebGPU
   spellings, never with a page. */
import { EFFECT_EASE_S, type EffectSettings, isEffect } from "../effect.ts";
import type { Palette } from "../palette.ts";
import type { EffectShaderFinish } from "../shader-finish.ts";
import { effectShaderCredit } from "../shader-shell.ts";
import { DEFAULT_ANGLE } from "../view.ts";
import { kitShadowInk, kitShadowLayers, kitStepped } from "./gl.ts";
import { KIT_KINDS } from "./kinds.ts";
import { KIT_STOPS, kitHex, kitScene, kitSteps } from "./scene.ts";
import type { FieldEffect } from "./types.ts";

/** What every text of an effect is, the start of its credit's last line, in its own words (types.ts FieldAbout). */
export const kitWhat = (def: FieldEffect): string => def.about.what;

/** The credit of an effect's shader text or page, as every effect's shader is credited (shader-shell.ts
    effectShaderCredit): the seed, the effect's address where an origin is given, and what the text is, saying the
    finish where it has one. A field effect the site does not play (the kit's demo, a candidate) is credited as the
    site's field effects are, all alike in effect.ts's EFFECT_KINDS (an angle, a soft), under its own style. */
export function kitCredit(
  def: FieldEffect,
  seed: string,
  play: EffectSettings,
  angle: number,
  what: string,
  origin?: string,
  finish: EffectShaderFinish = {}
): string[] {
  const kind = isEffect(def.kind) ? def.kind : KIT_KINDS[0];
  const credit = effectShaderCredit(seed, { kind, ...play }, angle, what, origin, finish);
  return kind === def.kind
    ? credit
    : credit.map(line => line.replace(new RegExp(`\\?style=${kind}(?=&|$)`), `?style=${def.kind}`));
}

/** The colors a page starts from, as the site takes them from a palette, as hex: the ground, the stops, and the
    shadows' and the lines' one color where the effect has them (shadows that take the sheet below each darkened have
    none: the pass works each out from the stops). */
export function kitColors(
  def: FieldEffect,
  P: Palette
): { ground: string; stops: string[]; shade: string | null; line: string | null } {
  const m = kitScene(def, P, { angle: DEFAULT_ANGLE, shape: null }, { width: 9, height: 9 });
  return {
    ground: kitHex(m.ground),
    stops: Array.from({ length: KIT_STOPS }, (_, i) => kitHex(m.stops.subarray(3 * i, 3 * i + 3))),
    shade: kitShadowInk(def) ? kitHex(m.shade) : null,
    line: m.lineFixed ? kitHex(m.lineFixed) : null
  };
}

/* words as comment lines of at most 116 characters, each line its own */
const wrapped = (text: string): string[] => {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > 116) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return line ? [...lines, line] : lines;
};

/** The head of the GLSL and the WGSL texts: the credit, then how a frame draws, as comment lines, and its finish where
    it has one: `"grain"` the grain laid in the pass, `"finish"` the finish's passes after it. An effect the view's
    steps space says its levels' step at the steps it is drawn at (`steps`, the designed where none), and that its
    pass reads them from uLevels. */
export function kitTextHead(
  def: FieldEffect,
  credit: readonly string[],
  finish: "plain" | "grain" | "finish" = "plain",
  steps: number | null = null
): string {
  const S = def.sheets;
  const L = def.lines;
  /* the levels' steps as the view's steps space them, the recipe's own at the designed */
  const n = kitSteps(def, steps);
  const apart = n === null || !def.steps ? 1 : def.steps.designed / n;
  const spaced =
    n === null
      ? ""
      : ` (its ${n} steps' spacing, which the pass reads from uLevels: ${def.steps?.least} to ${def.steps?.most} steps, ${def.steps?.designed} as designed)`;
  const moved = [S?.shadow && "its shadow", S?.rim && "its rim"].filter(Boolean).join(" and ");
  /* each in its color where it is not the ink's or white */
  const under = [
    S?.shadow && `its shadow${kitShadowInk(def) ? "" : " (the sheet below it darkened)"}`,
    S?.rim && `its rim${S.rim.tint === "own" ? " (its own color lit)" : ""}`
  ]
    .filter(Boolean)
    .join(" and ");
  const sheets = S
    ? `${S.count === null ? "its sheets" : `its ${S.count} sheets`} in turn (sheet k where the field is at least ${S.base} + ${+(S.step * apart).toPrecision(6)} k${S.count === null ? ", for every k" : ""}${spaced})${under ? `, each with ${under} under it` : ""}`
    : "";
  const lines = L
    ? `its lines (within ${L.half} of each level ${L.base} + ${+(L.step * apart).toPrecision(6)} j${S ? "" : spaced})`
    : "";
  const drawn = S && L ? `${sheets}, and ${lines} over them` : sheets || lines;
  return [
    ...credit,
    "",
    ...wrapped(
      `Each frame is one pass: at each pixel the field (kfield, the effect's kernel, its numbers from uniforms) at the pixel's middle, turned out of the view's angle, and at the middles of the pixels right of it and below it, whose differences are how much the field changes a pixel${moved ? `; where ${moved} come${S?.shadow && S?.rim ? "" : "s"} from` : ""}; then the ground, ${drawn}, each edge a box filter a pixel wide. A frame sets only ${def.tracks === 1 ? "the one phase" : `the ${def.tracks} phases`}${moved ? ` and the moves of ${moved}` : ""}. The uniforms' values are the page's.`
    ),
    ...(finish === "grain"
      ? ["The grain is laid over its bytes in the pass, a speck a CSS pixel, from its tile."]
      : finish === "finish"
        ? wrapped(
            "The pass draws into the finish's frame, which the finish's passes then blur by the soft on a smaller grid, lay over the palette's gradient where the blur thins the picture toward its edges, and grain."
          )
        : [])
  ]
    .map(line => (line ? `// ${line}` : "//"))
    .join("\n");
}

/** A number as JavaScript source that reads back as the same double, -0 kept. */
const jsNumber = (n: number): string => (Object.is(n, -0) ? "-0" : String(n));

/* the levels as the page's STEPS space them, for an effect that takes steps: kitScene's sheetStep, sheetHop, lineStep
   and lineHop, kitShadowSteps's rise and kit/gl.ts kitLevels's reach, each expression as those write it, so the
   pass's uLevels are the player's to the last bit */
const levelsJs = (def: FieldEffect): string => {
  const S = def.sheets;
  const L = def.lines;
  const range = def.steps;
  if (!range) return "";
  const sh = S?.shadow;
  const layers = sh ? kitShadowLayers(def).steps : 0;
  const lineHop = typeof L?.colors === "object" ? L.colors.hop : 0;
  return `

// The levels as STEPS space them (${range.least} to ${range.most}, ${range.designed} as designed): STEPS / ${range.designed} times as close as the design's,
// each one's color ${range.designed} / STEPS times as far along the palette, so the palette's sweep across the canvas stays and
// only the bands narrow or widen: the sheets' step and hop, the lines' step and hop, a soft shadow's rise and its reach,
// two vectors, as the pass's uLevels holds them.
const LEVELS = {
  least: ${range.least},
  most: ${range.most},
  designed: ${range.designed},
  sheetStep: ${jsNumber(S?.step ?? 0)},
  sheetHop: ${jsNumber(S?.colors.hop ?? 0)},
  lineStep: ${jsNumber(L?.step ?? 0)},
  lineHop: ${jsNumber(lineHop)},
  spread: ${jsNumber(sh?.spread ?? 0)},
  layers: ${layers}
};
function levelsAt(steps) {
  const n = Math.min(LEVELS.most, Math.max(LEVELS.least, Math.round(steps)));
  const apart = LEVELS.designed / n;
  const sheetStep = LEVELS.sheetStep * apart;
  const rise = LEVELS.layers > 1 ? (LEVELS.spread * sheetStep) / (LEVELS.layers - 1) : 0;
  return [
    sheetStep,
    LEVELS.sheetHop * apart,
    LEVELS.lineStep * apart,
    LEVELS.lineHop * apart,
    rise,
    (Math.max(1, LEVELS.layers) - 1) * rise,
    0,
    0
  ];
}`;
};

/** The design a shape draws and the arithmetic of a frame in plain JavaScript, the engine's own: everything a frame
    draws from the settings, and nothing that touches the page. */
export function kitModel(def: FieldEffect, P: Palette, shape: number | null): string {
  const m = kitScene(def, P, { angle: DEFAULT_ANGLE, shape }, { width: 9, height: 9 });
  const stepped = kitStepped(def);
  const S = def.sheets;
  const sh = S?.shadow ?? null;
  const ink = kitShadowInk(def);
  const lists = Object.entries(m.U).map(([name, list]) => {
    const rows: string[] = [];
    for (let i = 0; i < list.length; i += 4)
      rows.push(Array.from(list.subarray(i, i + 4), jsNumber).join(", "));
    return `  ${name}: [\n${rows.map(row => `    ${row}`).join(",\n")}\n  ]`;
  });
  const tracks = m.tracks.map(
    v => `  [${[v.rest, v.swing, v.cycles, v.psi].map(jsNumber).join(", ")}]`
  );
  return `// The design, as the site draws it: lengths in D units, D the canvas's longer side times SPAN, so every canvas shows
// the one design its longer side frames, centered, turned clockwise by ANGLE - 90 degrees.
// ${shape ? `Shape ${shape}` : "The design as made"}: CONSTANTS, the lists its field reads, each by the name the field's code gives it;
// TRACKS, its phases, each swinging about its rest (radians) by its swing (radians) each way, whole cycles a loop,
// from its phase at the loop's start. The light: the shadows fall a distance (D units) toward an angle on the screen
// (degrees: 0 right, 90 down) that swings its swing each way once a loop; the rims peek RIM D units toward the light.
const LOOP = ${def.loop};
const SPAN = ${def.span};
const CONSTANTS = {
${lists.join(",\n")}
};
// each track: its rest, its swing, its whole cycles a loop, its phase at the loop's start
const TRACKS = [
${tracks.join(",\n")}
];
const SHADOW = ${sh ? `{ angle: ${jsNumber(sh.angle)}, distance: ${jsNumber(sh.distance)}, swing: ${jsNumber(sh.swing)} }` : "null"};
const RIM = ${jsNumber(S?.rim ? S.rim.distance : 0)};
const TAU = Math.PI * 2;${levelsJs(def)}

const bytes = hex => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
// a list four numbers to a vector, as the pass's uniform arrays hold it
const vec4s = list => {
  const out = new Float32Array(4 * Math.ceil(list.length / 4));
  out.set(list);
  return out;
};

// The effect in a canvas of W by H pixels at ANGLE: D, the view's turn (the cosine and the sine of ANGLE - 90 degrees)
// and the colors, 0 to 1${stepped ? ", and the levels at STEPS" : ""}.
function kitScene(angle, width, height) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    width,
    height,
    D: SPAN * Math.max(width, height),
    cos: Math.cos(rad),
    sin: Math.sin(rad),
    ground: bytes(GROUND),
    stops: STOPS.flatMap(bytes),
    shade: ${ink ? "bytes(SHADE)" : "[0, 0, 0]"},
    line: ${m.lineFixed ? "bytes(LINE)" : "[0, 0, 0]"}${stepped ? ",\n    levels: levelsAt(STEPS)" : ""}
  };
}

// The pass's uniforms, as the player sets them once a palette, a view or a canvas changes.
function sceneUniforms(m) {
  return {
    size: Float32Array.of(m.width, m.height),
    D: m.D,
    turn: Float32Array.of(m.cos, m.sin),
    ground: Float32Array.from(m.ground),
    shade: Float32Array.from(m.shade),
    line: Float32Array.from(m.line),
    stops: Float32Array.from(m.stops),${stepped ? "\n    levels: Float32Array.from(m.levels)," : ""}
    K: Object.fromEntries(Object.entries(CONSTANTS).map(([name, list]) => [name, vec4s(list)]))
  };
}

// The frame at t (seconds of the loop at speed 1): each phase, its rest plus its swing then, in one turn, into
// \`phases\`, four to a vector; the light's angle then, and the shadow's move (toward where it falls) and the rim's
// (toward the light) into \`move\`.
function frameAt(time, phases, move) {
  const t = time - LOOP * Math.floor(time / LOOP);
  for (let i = 0; i < TRACKS.length; i++) {
    const v = TRACKS[i];
    const p = v[0] + v[1] * Math.sin((TAU * v[2] * t) / LOOP + v[3]);
    phases[i] = p - TAU * Math.floor(p / TAU);
  }
  const angle = SHADOW ? ((SHADOW.angle + SHADOW.swing * Math.sin((TAU * t) / LOOP)) * Math.PI) / 180 : 0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = SHADOW ? SHADOW.distance : 0;
  move[0] = d * c;
  move[1] = d * s;
  move[2] = -RIM * c;
  move[3] = -RIM * s;
}`;
}

/** The settings a reader edits, the page's first script: the colors, the angle, the steps where the effect takes
    them (its look's, the designed where it names none), the speed, the frame rate and the ease. */
export function kitSettings(
  def: FieldEffect,
  P: Palette,
  play: EffectSettings,
  angle: number
): string {
  const { ground, stops, shade, line } = kitColors(def, P);
  const steps = kitSteps(def, play.look.steps);
  const range = def.steps;
  const rows = Array.from({ length: Math.ceil(stops.length / 6) }, (_, i) =>
    stops
      .slice(6 * i, 6 * i + 6)
      .map(c => `"${c}"`)
      .join(", ")
  );
  const dark = def.ground.pick === "darkest";
  return `// The ground, the palette's ${dark ? "darkest color made deeper" : "lightest color made paler"}, and the palette's ${KIT_STOPS} stops along its curve${def.ground.lift > 0 ? ",\n// each lifted off the ground where it would sink into it" : ""}: each sheet and line takes its color between two of them.
const GROUND = "${ground}";
const STOPS = [
${rows.map(row => `  ${row}`).join(",\n")}
];${shade ? `\n// The shadows' color, the palette's darkest hue near black.\nconst SHADE = "${shade}";` : ""}${line ? `\n// The lines' one color, the palette's stop ${def.lines?.colors === "lightest" ? "farthest from" : "nearest"} black.\nconst LINE = "${line}";` : ""}
// The angle the design is turned to (90 as designed), how fast it plays (1 as designed: a loop lasts ${def.loop} s; 0 holds
// the first frame), frames a second at most, and the seconds it takes to ease in.
const ANGLE = ${angle};${steps !== null && range ? `\n// How many bands a sweep of the palette spans, ${range.least} to ${range.most} (${range.designed} as designed).\nconst STEPS = ${steps};` : ""}
const SPEED = ${jsNumber(play.speed)};
const FPS = ${jsNumber(play.fps)};
const EASE = ${jsNumber(EFFECT_EASE_S)};`;
}
