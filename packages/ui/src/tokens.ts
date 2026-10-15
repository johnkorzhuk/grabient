/* Generated from tokens.json by scripts/build-tokens.ts. Edit tokens.json, then run pnpm --filter @grabient/ui tokens. */

/** Ten steps on a 4px base, for gap and padding. In px. */
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  s16: 64
} as const;

/** Three radii and a circle. Nothing is a pill. In px. */
export const radius = {
  tight: 6,
  control: 10,
  surface: 14,
  circle: 999
} as const;

/** Words in Poppins, values in the system stack, code in mono. */
export const font = {
  sans: '"Poppins", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  system:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  medium: 500,
  bold: 700,
  fs0: 10.5,
  fs1: 11,
  fs2: 12,
  fs3: 13,
  fs4: 15,
  fs5: 18,
  fs6: 24,
  fs7: 32,
  fsTouch: 16,
  lhNone: 1,
  lhTight: 1.2,
  lhUi: 1.45,
  lhProse: 1.7,
  lsTitle: "-0.025em",
  lsHeading: "-0.01em",
  lsMicro: "0.12em",
  lsWide: "0.16em"
} as const;

/** Control heights and the fixed widths layouts rely on. In px. */
export const size = {
  control: 32,
  controlSm: 28,
  controlBig: 40,
  touch: 44,
  target: 24,
  logo: 48,
  logoPhone: 38,
  gutter: 48,
  top: 68,
  topBrand: 84,
  avatar: 40,
  avatarLg: 64,
  icon: 15,
  iconSm: 14,
  frame: 1000,
  navCol: 152,
  prose: 740,
  sheet: 400,
  paneBar: 3,
  search: 480,
  menu: 216,
  switchMin: 56,
  hairline: 1,
  dash: 2,
  dashPeriod: 6,
  blurFrost: 10,
  blurGlass: 18,
  blurTop: 14,
  tile: 56,
  panel: 320,
  editorPanel: 420,
  editorPanelNarrow: 380,
  card: 300,
  cardMin: 320,
  strip: 72,
  stripTwo: 56,
  stripShort: 52,
  code: 480,
  picker: 160,
  pickerWidth: 256,
  editorPeek: 88,
  thumb: 16,
  thumbTouch: 20,
  sample: 24
} as const;

/** Five durations and one ease, stilled by reduced motion. Durations in ms. */
export const motion = {
  fast: 150,
  base: 220,
  slow: 400,
  reveal: 560,
  dissolve: 300,
  ease: "cubic-bezier(0.2, 0.7, 0.2, 1)"
} as const;

/** Ink for text, paper for surfaces, edge for borders. Each theme's value. */
export const color = {
  dark: {
    bg: "#0c0c0e",
    sheet: "#0f0f12",
    ink: "#ececea",
    ink2: "rgba(236,236,234,0.64)",
    ink3: "rgba(236,236,234,0.52)",
    ink4: "rgba(236,236,234,0.22)",
    inkHover: "#cfcfcd",
    onInk: "#0c0c0e",
    onInk2: "rgba(12,12,14,0.62)",
    paper: "rgba(255,255,255,0.035)",
    paper2: "rgba(255,255,255,0.06)",
    paper3: "rgba(255,255,255,0.10)",
    paperSolid: "#151518",
    frost: "rgba(255,255,255,0.035)",
    glass: "rgba(18,18,21,0.92)",
    glassEdge: "rgba(255,255,255,0.12)",
    art: "rgba(16,16,20,0.62)",
    artHover: "rgba(16,16,20,0.8)",
    artEdge: "rgba(255,255,255,0.18)",
    onArt: "#f4f4f2",
    onLight: "#000000",
    onDark: "#ffffff",
    edge: "rgba(255,255,255,0.075)",
    edge2: "rgba(255,255,255,0.14)",
    sheen: "rgba(255,255,255,0.07)",
    ring: "rgba(236,236,234,0.45)",
    accent: "#f0a531",
    danger: "#d45454",
    like: "#d63b34",
    star: "#f0a531",
    shadow: "0 24px 48px -28px rgba(0,0,0,0.85)",
    shadowPop: "0 18px 40px -16px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.3)",
    shadowFrost: "0 30px 70px -40px rgba(0,0,0,0.6)",
    rim: "inset 0 0 0 1px rgba(255,255,255,0.11), inset 0 1px 0 rgba(255,255,255,0.17)",
    holeRim: "rgba(255,255,255,0.30)",
    dashRule:
      "linear-gradient(to right, rgba(236,236,234,0.14) 0, rgba(236,236,234,0.14) 2px, transparent 2px, transparent 6px)",
    grain: 0.045,
    scheme: "dark"
  },
  light: {
    bg: "#f3f2ee",
    sheet: "#f8f7f4",
    ink: "#17171b",
    ink2: "rgba(23,23,27,0.66)",
    ink3: "rgba(23,23,27,0.62)",
    ink4: "rgba(23,23,27,0.24)",
    inkHover: "#2f2f36",
    onInk: "#f8f7f4",
    onInk2: "rgba(248,247,244,0.52)",
    paper: "rgba(255,255,255,0.64)",
    paper2: "rgba(20,20,24,0.045)",
    paper3: "rgba(20,20,24,0.085)",
    paperSolid: "#faf9f7",
    frost: "rgba(255,255,255,0.50)",
    glass: "rgba(250,249,247,0.92)",
    glassEdge: "rgba(20,20,24,0.10)",
    art: "rgba(16,16,20,0.62)",
    artHover: "rgba(16,16,20,0.8)",
    artEdge: "rgba(255,255,255,0.18)",
    onArt: "#f4f4f2",
    onLight: "#000000",
    onDark: "#ffffff",
    edge: "rgba(20,20,24,0.085)",
    edge2: "rgba(20,20,24,0.16)",
    sheen: "rgba(255,255,255,0.90)",
    ring: "rgba(23,23,27,0.50)",
    accent: "#a35f04",
    danger: "#c43d3d",
    like: "#c9332c",
    star: "#f0a531",
    shadow: "0 24px 48px -28px rgba(30,30,40,0.35)",
    shadowPop: "0 18px 40px -16px rgba(30,30,40,0.28), 0 2px 8px rgba(30,30,40,0.08)",
    shadowFrost: "0 30px 70px -40px rgba(30,30,40,0.45)",
    rim: "inset 0 0 0 1px rgba(255,255,255,0.35), inset 0 1px 0 rgba(255,255,255,0.5), 0 0 0 1px rgba(20,20,24,0.06)",
    holeRim: "rgba(20,20,24,0.22)",
    dashRule:
      "linear-gradient(to right, rgba(23,23,27,0.16) 0, rgba(23,23,27,0.16) 2px, transparent 2px, transparent 6px)",
    grain: 0.06,
    scheme: "light"
  }
} as const;

export type Theme = keyof typeof color;
