// The loop, frame by frame (v3): what the harness draws (the wordmark at its place in the page, the water's aim, the paint
// the page hands the bar, the lit card) and what the composition shows over it (the views, each a camera over the page,
// the UI frame and how much of it shows, the pointer, the picture's morph into the bar, the words). Both read the file
// this writes, so the water and the page agree on every frame. Frame 0 is the end card.
//   node timeline.mjs ["$WORK/frames/ui-dark/frames.json"] > "$WORK/data/timeline.json"     (render.sh --frames runs it)
//
// The owner's loop: the end card is the camera over the page's own wordmark; as the bar starts to turn to the list's
// first palette, what stands under the wordmark slides to the left as one surface, the words leaving the frame as the
// list slides in from the right to its place, and the whole page pulls back; the demo (a like, then Add to collection)
// plays as v2's; when the interactions are done the camera stays in close, then draws back in one move to the end card:
// as it does, the rest fades, the letters appear over the picture, and the picture narrows into the bar under them; the
// words fade in, and it hangs.
import { readFileSync } from "node:fs";

export const FPS = 30;
const PAGE = { w: 1600, h: 900 };
const ASPECT = 16 / 9;
/* the water's canvas reaches past the page, since the end card's camera stands over the page's top left corner and the
   cards' past its right edge: the harness draws the page OFFSET into a canvas EXTENT big */
export const OFFSET = { x: 224, y: 128 };
export const EXTENT = { w: PAGE.w + OFFSET.x + 192, h: PAGE.h + OFFSET.y };
/* the wordmark where the page's header stands it, drawn larger than the site does ("the logo can be larger"); it never
   moves, the camera does */
const LOGO = { x: 48, y: 8, h: 82 };
/* the bar in the wordmark's 220 by 50 box (logo.data.ts), and the letters over it, which fill y 0 to 38 of the box */
const barOf = m => ({ x: m.x + (m.h * 93) / 50, y: m.y + (m.h * 43) / 50, w: (m.h * 34) / 50, h: (m.h * 7) / 50 });
const BAR = barOf(LOGO);
/* the end card (the owner's image 2): the camera over the wordmark that draws it where v2's end card did, its box 120 px
   tall at 1280 with its corner at (376, 180) */
const END_SCALE = 120 / LOGO.h;
const END = { left: LOGO.x - 376 / END_SCALE, top: LOGO.y - 180 / END_SCALE, w: 1280 / END_SCALE, h: 720 / END_SCALE };
/* the page in the frame, a little above its top so the larger wordmark has room over it */
const WIDE = { left: 0, top: -14, w: PAGE.w, h: PAGE.h };
/* where the current heads: on the end card straight out to the right of the bar, away from the words under it; on the
   page the layer's center, as the site aims it */
const AIM_END = { x: BAR.x + 1600, y: BAR.y + BAR.h / 2 };
const AIM_PAGE = { x: PAGE.w / 2, y: PAGE.h / 2 };

/* the loop's parts, in frames */
export const PARTS = {
  holdA: 66, // the end card as the loop opens: long enough to read the words on a first play
  slide: 32, // what stands under the wordmark slides to the left: the words out of the frame, the list in to its place
  slideAt: 8, // the slide starts this far past the hold
  paintLead: 14, // the bar is handed the page's palettes this long before the slide: its turn takes about that long to
  // show in the bar, so the bar starts to turn as the list starts to slide, the camera still close
  pullAt: 22, // the camera starts back this far past the hold
  pull: 54, // the whole page pulls back to the frame
  beat: 27, // the page in view before the pointer sets off ("hang for a tad bit longer")
  settle: 6, // after the pointer has come to rest, before the transition
  morph: 40, // at once: the rest fades, the picture becomes the bar where it is, the camera eases out a little
  hand: 6, // the bar is handed the hero this long after the camera reaches the card, the header out of the frame from
  // then on: its sweep is long done, and the water near it carries the hero's colors, by the time the picture lands
  handover: 8, // landed, the picture gives way to the bar's own paint
  letters: 14, // the letters arrive over the bar
  fade: 30 // the water's last frames dissolve into its frames from before the first
};
/* the demo plays this much faster than it was captured ("speed up the like/collection sequence just a little"): from
   the approach to the rest its UI frames are sampled every DEMO_SPEED frames, the pointer drawn between them */
const DEMO_SPEED = 1.1;
/* the end card hangs this long in all, across the seam */
const HANG = 105;
/* the newsletter's GIF pays for every frame the whole picture changes, so it runs the pull back and the morph faster (the
   same frames, every 1.5th) and hangs on the end card for less, ending its hold this many frames early; the harness
   draws its water on its own schedule, so its last frames dissolve into its own frames from before the first */
const EMAIL = { fast: 1.5, shorter: 33 };

const ease = t => {
  // the camera's ease (camera.ts in v1): a slow start, a long settle
  const c = Math.min(Math.max(t, 0), 1);
  return bezier(0.55, 0, 0.25, 1)(c);
};
function bezier(x1, y1, x2, y2) {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const sx = t => ((ax * t + bx) * t + cx) * t;
  const sy = t => ((ay * t + by) * t + cy) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
      t = Math.min(Math.max(t, 0), 1);
    }
    return sy(t);
  };
}
const smooth = t => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};
/* the pull back's speed: an even start and settle, its fastest no faster than a frame's eighth of its zoom */
const sine = t => 0.5 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1)) / 2;
const inOut = t => {
  const c = Math.min(Math.max(t, 0), 1);
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (f, a, b) => Math.min(Math.max((f - a) / (b - a), 0), 1);

/** A shot of width w around a center, as tall as the frame's shape asks, kept inside the page (v1's camera). */
function shot(cx, cy, w) {
  const width = Math.min(w, PAGE.w, PAGE.h * ASPECT);
  const h = width / ASPECT;
  const left = Math.min(Math.max(cx - width / 2, 0), PAGE.w - width);
  const top = Math.min(Math.max(cy - h / 2, 0), PAGE.h - h);
  return { left, top, w: width, h };
}
/** Between two shots: a zoom about the one point both share, the scale even in log space. */
function between(a, b, t) {
  const u = ease(t);
  const w = a.w * (b.w / a.w) ** u;
  const h = a.h * (b.h / a.h) ** u;
  if (Math.abs(b.w - a.w) < 1e-6) return { left: lerp(a.left, b.left, u), top: lerp(a.top, b.top, u), w, h };
  const px = (a.left * b.w - b.left * a.w) / (b.w - a.w);
  const py = (a.top * b.h - b.top * a.h) / (b.h - a.h);
  const ux = (px - a.left) / a.w;
  const uy = (py - a.top) / a.h;
  return { left: px - ux * w, top: py - uy * h, w, h };
}
/** A shot widened (k > 1) or narrowed about its own middle. */
const widened = (c, k) => ({ left: c.left + (c.w * (1 - k)) / 2, top: c.top + (c.h * (1 - k)) / 2, w: c.w * k, h: c.h * k });
/** A box in the page as the frame draws it under a camera, in pixels of a 1280 frame. */
const onScreen = (cam, b) => {
  const s = 1280 / cam.w;
  return { x: (b.x - cam.left) * s, y: (b.y - cam.top) * s, w: b.w * s, h: b.h * s };
};
const r2 = v => Math.round(v * 100) / 100;
const round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v]));

export function buildTimeline(ui) {
  const m = ui.marks;
  const P = PARTS;
  /* the loop's frames for the parts around the demo */
  const listAt = P.holdA + P.slideAt - P.paintLead;
  const slide = [P.holdA + P.slideAt, P.holdA + P.slideAt + P.slide];
  const pull = [P.holdA + P.pullAt, P.holdA + P.pullAt + P.pull];
  const approach = pull[1] + P.beat;
  /* the demo's loop frames, and the UI frame each shows: before the approach the page at rest as captured, from the
     approach to the rest the capture a little faster, after it the capture as it ran */
  const restLoop = approach + Math.round((m.rest - m.approach) / DEMO_SPEED);
  const uiAt = f =>
    f < approach ? m.approach - (approach - f) : f < restLoop ? m.approach + (f - approach) * DEMO_SPEED : m.rest + (f - restLoop);
  const loopOf = u => (u <= m.rest ? approach + (u - m.approach) / DEMO_SPEED : restLoop + (u - m.rest));
  const at = name => Math.round(loopOf(m[name]));
  const morph = [at("rest") + P.settle, at("rest") + P.settle + P.morph];
  const handHero = at("restHeart") + P.hand;
  const land = morph[1];
  /* the letters come into view as the camera draws back, while the rest fades; the words follow the landing */
  const lettersIn = [morph[0] + Math.round(0.2 * P.morph), morph[0] + Math.round(0.8 * P.morph)];
  const copyIn = [land + 4, land + 22];
  /* the words are whole from copyIn[1] to the loop's end and from 0 to the words' going: HANG frames in all */
  const length = Math.round((copyIn[1] + HANG - P.holdA) / 2) * 2;

  const card = ui.rects.card;
  const art = ui.rects.art;
  /* the slide: far enough that the words leave the end card's frame whole and the list starts outside it, in page pixels;
     the words go as far in a 1280 frame's pixels, SLIDE */
  const slideBy = 0.8 * END.w;
  const SLIDE = slideBy * END_SCALE;
  const radius = ui.painted?.[3]?.radius ?? 14;
  const corner = shot(PAGE.w - 350, card.y + 170, 700);
  const list = (() => {
    const d = ui.rects.dialog;
    const p = ui.rects.plus;
    const x0 = Math.min(d.x, p.x);
    const y0 = Math.min(d.y, p.y);
    const x1 = Math.max(d.x + d.w, p.x + p.w);
    const y1 = Math.max(d.y + d.h, p.y + p.h);
    return shot((x0 + x1) / 2, (y0 + y1) / 2 + 6, 640);
  })();
  /* the camera of the one view outside the morph */
  const moves = [
    { from: pull[0], to: pull[1], a: END, b: WIDE },
    { from: at("approach") + 4, to: at("restHeart") + 6, a: WIDE, b: corner },
    { from: at("clickPress") + 4, to: at("clickPress") + 26, a: corner, b: list }
  ];
  const camAt = f => {
    let cur = END;
    for (const mv of moves) {
      if (f < mv.from) return cur;
      if (f <= mv.to) return between(mv.a, mv.b, (f - mv.from) / (mv.to - mv.from));
      cur = mv.b;
    }
    return cur;
  };

  const pressDown = ui.events.filter(e => e.type === "down");
  const pressedAt = u =>
    pressDown.reduce((acc, down) => {
      const up = ui.events.find(e => e.type === "up" && e.f > down.f)?.f ?? down.f + 3;
      const v = Math.min(ramp(u, down.f - 1, down.f + 1), 1 - ramp(u, up, up + 2));
      return Math.max(acc, Math.max(0, v));
    }, 0);
  /* the hand the page asked for, kept through the frame or two where the pointer crosses the gap between two buttons
     or rows: the site shows the arrow there, which the frames show as a flicker */
  const hands = ui.frames.map(x => (x.cursor === "pointer" ? 1 : 0));
  for (let i = 0; i < hands.length; ) {
    let j = i;
    while (j < hands.length && !hands[j]) j++;
    if (i > 0 && j > i && j < hands.length && j - i <= 3) hands.fill(1, i, j);
    i = Math.max(j, i + 1);
  }

  const frames = [];
  for (let f = 0; f < length; f++) {
    const raw = uiAt(f);
    const uf = Math.min(Math.max(raw, 0), ui.count - 1);
    const u = Math.round(uf);
    const at0 = ui.frames[u];
    const inDemo = raw >= 0 && raw < ui.count;
    /* the pointer between the two captured frames around this one */
    const lo = ui.frames[Math.floor(uf)];
    const hi = ui.frames[Math.min(Math.ceil(uf), ui.count - 1)];
    const w = uf - Math.floor(uf);
    const glow = inDemo && at0.glow ? { ...at0.glow, r: 14 } : null;
    const paint = f >= listAt && f < handHero ? "page" : "hero";
    /* the current turns to the page's middle as the camera pulls back, and back out to the right of the bar in the morph */
    const out = f < pull[0] ? 0 : f < morph[0] ? ease(ramp(f, pull[0], pull[1])) : 1 - ease(ramp(f, morph[0], morph[1]));
    const aim = { x: lerp(AIM_END.x, AIM_PAGE.x, out), y: lerp(AIM_END.y, AIM_PAGE.y, out) };
    /* the list slides in from the right to its place below the wordmark; it is gone from the end card */
    const slid = ease(ramp(f, slide[0], slide[1]));
    const grid = f < morph[0] && f >= slide[0] ? 1 : 0;
    const shift = f < morph[0] ? slideBy * (1 - slid) : 0;
    const cursorIn = smooth(ramp(f, pull[1] - 14, pull[1]));
    const cursorOut = 1 - smooth(ramp(f, morph[0], morph[0] + 8));
    const cursor = round({ x: lerp(lo.x, hi.x, w), y: lerp(lo.y, hi.y, w), opacity: Math.min(cursorIn, cursorOut), hand: hands[u], pressed: pressedAt(uf) });
    const letters = f >= morph[0] ? smooth(ramp(f, lettersIn[0], lettersIn[1])) : 1;
    /* the words: whole on the end card until the slide takes them out to the left; at the end they fade in after the
       bar lands, the headline a little after the eyebrow */
    const shown = f < slide[1] ? 1 : 0;
    const words =
      f < morph[0]
        ? { eyebrow: shown, headline: shown }
        : { eyebrow: smooth(ramp(f, copyIn[0], copyIn[1] - 4)), headline: smooth(ramp(f, copyIn[0] + 4, copyIn[1])) };
    const away = f < morph[0] ? -SLIDE * slid : 0;

    let views;
    let picture = null;
    if (f >= morph[0] && f < morph[1]) {
      /* the morph is one camera drawing back: the picture is the bar seen close. As the camera pulls back from the
         bar to the end card, the picture keeps the bar's width under it and narrows from the card's height to the bar's,
         the letters come into view over it and appear, and the close view (the card's picture cut out of it) draws back
         with it and fades. Both views share the pull back: the picture's middle travels from where the card showed it
         to the bar's place on the end card. */
      const t = (f - morph[0]) / P.morph;
      const k = sine(t);
      const from = onScreen(list, art);
      const to = onScreen(END, BAR);
      const Z0 = from.w / to.w; // how much closer the camera starts than the end card's
      const zoom = Z0 ** (1 - k);
      const c = { x: lerp(from.x + from.w / 2, to.x + to.w / 2, k), y: lerp(from.y + from.h / 2, to.y + to.h / 2, k) };
      const sB = (1280 / END.w) * zoom;
      const b = { left: BAR.x + BAR.w / 2 - c.x / sB, top: BAR.y + BAR.h / 2 - c.y / sB, w: 1280 / sB, h: 720 / sB };
      const sA = (1280 / list.w) * (zoom / Z0);
      const a = { left: art.x + art.w / 2 - c.x / sA, top: art.y + art.h / 2 - c.y / sA, w: 1280 / sA, h: 720 / sA };
      /* the shape narrows a little ahead of the pull back, so it reads as the bar well before it lands */
      const shape = ease(ramp(t, 0, 0.85));
      const w = to.w * zoom;
      const h = ((from.h * zoom) / Z0) ** (1 - shape) * (to.h * zoom) ** shape;
      picture = round({ x: c.x - w / 2, y: c.y - h / 2, w, h, r: radius * sA * (1 - shape), alpha: 1 });
      views = [
        { cam: round(b), alpha: 1, grid: 0, shift: 0, letters, bar: 0, hole: 0, cursor: null },
        /* the page's own wordmark is the end card's, drawn there alone: the close view leaves it out as it draws back */
        {
          cam: round(a),
          alpha: r2(1 - smooth(ramp(t, 0, 0.55))),
          grid: 1,
          shift: 0,
          letters: 0,
          bar: 0,
          hole: 1,
          cursor: cursor.opacity > 0 ? cursor : null
        }
      ];
    } else {
      const cam = f >= morph[1] ? END : camAt(f);
      if (f >= land && f < land + P.handover) {
        /* landed, the picture gives way to the bar, which already shows the hero */
        picture = round({ ...onScreen(END, BAR), r: 0, alpha: 1 - smooth((f - land + 1) / P.handover) });
      }
      views = [{ cam: round(cam), alpha: 1, grid, shift: r2(shift), letters: r2(letters), bar: 1, hole: 0, cursor: cursor.opacity > 0 ? cursor : null }];
    }
    frames.push({
      f,
      ui: u,
      mark: LOGO,
      bar: round(BAR),
      aim: round(aim),
      paint,
      brand: paint === "hero",
      glow: glow && round(glow),
      views,
      picture,
      copy: round({ ...words, away })
    });
  }
  const presses = pressDown.map(e => ({ f: Math.round(loopOf(e.f)), x: e.x, y: e.y, name: e.name }));
  /* the newsletter's loop: the loop frame each of its frames shows; the pull back and the morph sampled every EMAIL.fast
     frames, and the hold cut short, its last fade frames dissolving into the frames before the first as the loop's do */
  const email = [];
  const spans = [
    [0, pull[0], 1],
    [pull[0], pull[1], EMAIL.fast],
    [pull[1], morph[0], 1],
    [morph[0], morph[1], EMAIL.fast],
    [morph[1], length - EMAIL.shorter, 1]
  ];
  for (const [a, b, step] of spans) {
    const n = Math.round((b - a) / step);
    for (let j = 0; j < n; j++) email.push(Math.min(b - 1, Math.round(a + j * step)));
  }
  if (email.length % 2) email.push(email[email.length - 1] + 1);
  /* its GIF, every other frame: it starts on the loop's first frame, the end card, as the tweet does, and the encoder's
     two runs join where the most of the picture changes: the middle of the morph and of the pull back */
  const gifLoop = email.filter((_, i) => i % 2 === 0);
  const middle = ([lo, hi]) => {
    const mid = (lo + hi) / 2;
    let best = -1;
    for (let g = 1; g < gifLoop.length - 1; g++) if (best < 0 || Math.abs(gifLoop[g] - mid) < Math.abs(gifLoop[best] - mid)) best = g;
    return best;
  };
  const gif = { first: 0, start: middle(morph), stop: middle(pull) };
  return {
    fps: FPS,
    length,
    page: PAGE,
    offset: OFFSET,
    extent: EXTENT,
    logo: LOGO,
    end: round(END),
    /* how far the words slide, in a 1280 frame's pixels */
    slide: r2(SLIDE),
    /* copyOut and listIn are the slide, as the seam and sheet tools read them */
    parts: { ...P, hang: HANG, demoSpeed: DEMO_SPEED, copyOut: slide, listIn: slide, slide, pull, approach, morph, land, hero: handHero, lettersIn, copyIn, rest: at("rest") },
    marks: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(loopOf(v))])),
    presses,
    email: { length: email.length, map: email, fast: EMAIL.fast, shorter: EMAIL.shorter, gif },
    frames
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] ?? `${process.env.WORK}/frames/ui-dark/frames.json`;
  const ui = JSON.parse(readFileSync(file, "utf8"));
  console.log(JSON.stringify(buildTimeline(ui)));
}
