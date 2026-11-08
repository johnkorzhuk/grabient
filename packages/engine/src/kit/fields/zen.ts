/* Zen: a raked sand garden, karesansui, seen from above. A group of three stones lies in the middle, a large one with
   a companion sharing its rings and a third apart or close by, each with the rings the rake drew round it; the
   parallel grooves either side of their row bend over the group and run on as gentle waves, and where two stones lie
   close their rings merge into one figure about both. The palette spreads across the garden one level a groove, every
   ring and every groove a step of it, from the sand round the stones out to the far sand, and the stones take its
   other end, muted. It breathes while the stones and the far sand hold: the rings round the main stone and its
   companion swell and draw back in counterpoint, a breath every 20 s, the third stone's every 40 s as the raked lines
   either side of the row drift in toward it and back, a fifth of a groove at most; the ridges shift within their
   grooves once a minute, and the light swings once a loop.

   The sand is one number, the rake's coordinate d, and every level drawn on it is a function of d alone, so every
   contour is a groove: no band starts or stops along a groove, and the palette never dashes across one, as it did
   where the palette was a ramp of its own under the grooves. d is the smooth union of the stones' distances (each an
   ellipse's) and a line's through their row, the line's lifted `lift` off its own zero so it adds parallel lines either
   side of the row and none between the stones (a half-plane's edge in its place left closed pockets where it met two
   stones). A distance field's levels lie a groove apart everywhere, so nothing crowds, rings and lines alike, and no
   line ends: the rings' extra grooves lift the far ones over the stones, which round into waves, the union's blend
   growing with the distance. The sand's level falls exactly one level a groove from LEVEL to FLOOR, plus a cosine a
   groove long, so every groove has the same ridge, flank and trough, one level lower than the last (a fall drifting
   against the grooves beat into a contour map). The levels count the palette down (hop -1/16) and cycle, so the sand
   runs from the palette's start round the stones toward its end far off, and the stones cross the cycle's seam into
   its end.

   A stone is a pebble, not a disc (the judges read the first round's flat ovals as eyes, holes and egg yolks): its
   outline the ellipse's with a cubic lump along an axis of its own (a third harmonic and a shift: a rounded triangle
   or an egg), and on its body a facet, its top face, half to two thirds of its radius across, so the body shows all
   round it. The stone's field is its own, not the sand's (the sand breathes, the stone holds), over the sand's by a
   max: a wall at its edge, then the facet's step. Its outline is the cycle's seam, its body and its facet the
   palette's last two sixteenths under a band (the effect's one line) that takes them 0.45 of the way to the palette's
   first sixth: a stone's muted tone, terracotta in a cream-to-red palette, slate in a dark one, taupe in a sunset,
   where the palette's far end alone made the stones its brightest spots (vivid's red read as jelly beans, an orange
   as egg yolks, a mauve in dark sand as plums). The rim and shadow each sheet casts give the facet a lit edge toward
   the light and a shaded one away, and the stone a shadow on the sand. The rings follow the plain ellipse, not the
   lump, which steepened the grooves next to a stone past 1.5 px at 320 by 180.

   The group keeps within REACH of the middle, so no angle of the view cuts a stone in a 16 by 9 box or a phone's 9 by
   16 (the second round's row ran 0.6 along, which a landscape box's height cut at angle 0), and along its row, so
   no three stones make a tight triangle, inside which the sand's distance peaks and closes a dot of sand round.

   Measured 8 Nov 2026, the machine shared with other sessions (load 1): the kernel's cost 160 of 160 (compile.ts: the
   swell's track 8 and the stones' breaths 7, paid by keeping the nearest stone's wall and facet through a test, the
   first stone's with none, where each stone kept its own, 13, which left 36 first frames within a level of the first
   round's at 3 pixels at most; the raked lines' drift reads the third stone's breath, so it costs nothing); a frame on
   the CPU (kitRender) 78 to 110 ms at 480 by 270, 432 to 465 at 1200 by 630 and 1.14 to 1.23 s at 1920 by 1080; 13 to
   15 sheet levels a frame and the stones' band, the closest 1.55 px apart at 320 by 180 over 18 shapes, four angles and
   nine times of the loop, 3 to 48 pixels of a frame there a sliver a pixel thin, a moment at a stone's wall or the
   row's crest (up to 116 while the raked field slid); finite at 16.8 million reads over the first 1,001 shapes, 966 of
   them holding three stones, the rest two; the still's CSS background 25.6 to 27.6 KiB at the design square over six
   looks, the first round's to the byte (its stones' band written in half pixels since, kit/svg.ts, up to 0.1 KiB more),
   traced in 36 to 55 ms. Every frame's SVG lies within the conformance suite's limits of kitRender at 320 by 180 and
   640 by 360 in seven palettes, two looks and three times (a mean of 0.38 hundredths at most, p99 1.28, far 0.00%), and
   the still within a mean of 0.22 and a p99 of 2.04 of its first frame's at the design square. The motion at 480 by
   270, its edges' speed (where the field lies within a pixel of a level, its change over 0.1 s over its change a
   pixel): 0.22 to 0.27 px a second at the median, 2.5 to 2.9 at the 95th percentile and 3.0 to 3.3 at the 99th over
   shapes 0, 7, 417 and 999 (the first round's 0.33 to 0.34, 0.77 to 1.04 and 1.29 to 1.37; with the field sliding and
   the grooves at 24 s, 0.47 to 0.55, 2.0 to 2.3 and 2.6 to 2.8): most of the garden holds while the rings breathe. Of the pixels that change by more than 12 over 3 s, the share near
   the stones against the share far off is 0.78 to 1.23 (0.56 to 0.84 with the field sliding). The frame 0.13 of a loop
   on lies past the frame limits of its first at all 336 times of seven palettes, four looks and twelve times (a mean of
   1.53 at the least, pastel, shape 417 at angle 210 and t 30, vivid's 2.14), where the first round drew one picture at
   t and t + 60 s; every 1.5 s of the loop, at 319 of 320 in vivid and 2,213 of 2,240 in the seven (the first round's
   302 and 2,093), the rest in the palettes of least contrast where the swell and the lift come back to their values
   15.6 s on. A loop ends on its first frame, its step over the end the size of the steps beside it. Its clips, against
   a pixel of the glass's longest (test/kit-weight.ts's measure, on a clips module built with this kernel, its frames
   kitRender's to the byte): 32.5 to 40.8 over four runs on a quiet machine, the median 38.3 to 38.6 (its clipWeight
   below); with the machine shared, 29.6 to 44.3 over three runs, the median 39.1 to 39.8, where the first round's
   kernel of 158 measured 31.6 to 38.0 in the same runs. */
import { kitRng, kitRound } from "../scene.ts";
import type { FieldEffect, KernelU, Track } from "../types.ts";

/** Stones a garden holds: three, a garden's usual group (four were busier, and the pebbles' form took the fourth's
    share of the kernel's budget). */
const STONES = 3;
/** A groove's width, D. */
const GROOVE = 0.048;

/** The field: the sand's level from the rake's coordinate d, and the stones over it. In the kernel subset
    (kit/README.md). U.rake: the row's line (its normal's x and y and offset), its softness squared and its lift at
    t = 0 less that softness, the union's blend and its growth a unit of d, the floor, the stones' level, the levels a
    unit of d, the grooves' depth and their wavenumber, then the stone's: its level at its edge, its wall's slope and
    its facet's top; last the raked lines' drift a unit of the lift's breath (DRIFT over the most that breath moves off
    its start) and the lift's cosine at t = 0. U.stone, eleven a stone: its middle, its radius, its ellipse's quadratic
    form (xx, yy, xy), its lump's axis (the cube root of the lump times its unit axis), its facet's slope and the level
    that slope starts from at its edge (FACET_SLOPE over the radius, and the wall's top less the slope's rise over the
    wall), and how far its rings swell either way (D, its sign its phase). F[0]: the grooves'
    phase; F[1]: the lift's, which the raked lines and the third stone's rings follow; F[2]: the swell of the main
    stone's rings and its companion's. The three stones are written out, each with its own breath: the swell's track at
    rest at t = 0, and the lift's cosine taken off its value there, so the still is the garden as it was drawn. */
export function zenField(x: number, y: number, U: KernelU, F: ArrayLike<number>): number {
  const v = U.rake[0] * x + U.rake[1] * y + U.rake[2];
  /* the lift's breath (F[1]), its cosine taken off its value at t = 0: the raked lines' drift and the third stone's
     rings */
  const slow = Math.cos(F[1]) - U.rake[16];
  /* the row's line, lifted off its zero as the still lifts it, drifting on the lift */
  let d = Math.sqrt(v * v + U.rake[3]) + U.rake[4] + U.rake[15] * slow;
  const swell = Math.cos(F[2]);
  /* the main stone: the nearest so far, its rings on the swell */
  let dx = x - U.stone[0];
  let dy = y - U.stone[1];
  let q = zenOval(dx, dy, U.stone[3], U.stone[4], U.stone[5]);
  let ring = Math.sqrt(q) - U.stone[2];
  let core = ring + zenLump(dx, dy, U.stone[6], U.stone[7], q);
  let slope = U.stone[8];
  let top = U.stone[9];
  d = zenUnion(d, ring - U.stone[10] * swell, U.rake[5], U.rake[6]);
  /* its companion, its rings on the swell against the main's */
  dx = x - U.stone[11];
  dy = y - U.stone[12];
  q = zenOval(dx, dy, U.stone[14], U.stone[15], U.stone[16]);
  ring = Math.sqrt(q) - U.stone[13];
  let e = ring + zenLump(dx, dy, U.stone[17], U.stone[18], q);
  if (e < core) {
    core = e;
    slope = U.stone[19];
    top = U.stone[20];
  }
  d = zenUnion(d, ring - U.stone[21] * swell, U.rake[5], U.rake[6]);
  /* the third, its rings on the lift */
  dx = x - U.stone[22];
  dy = y - U.stone[23];
  q = zenOval(dx, dy, U.stone[25], U.stone[26], U.stone[27]);
  ring = Math.sqrt(q) - U.stone[24];
  e = ring + zenLump(dx, dy, U.stone[28], U.stone[29], q);
  if (e < core) {
    core = e;
    slope = U.stone[30];
    top = U.stone[31];
  }
  d = zenUnion(d, ring - U.stone[32] * slow, U.rake[5], U.rake[6]);
  /* the sand, held at a stone's edge under it */
  const out = Math.max(0, d);
  const f =
    Math.max(U.rake[7], U.rake[8] - U.rake[9] * out) +
    U.rake[10] * Math.cos(U.rake[11] * out + F[0]);
  /* the nearest stone: its wall, falling away outside it, then its facet, a share of its radius in, to the facet's
     top (the facet's line meets the wall's top where the wall ends, and the wall is the steeper) */
  const g = Math.min(U.rake[12] - U.rake[13] * core, U.rake[14], top - slope * core);
  return Math.max(f, g);
}

/** A stone's ellipse: its quadratic form at (dx, dy) off its middle. */
function zenOval(dx: number, dy: number, xx: number, yy: number, xy: number): number {
  return dx * (dx * xx + dy * xy) + dy * dy * yy;
}

/** The lump: the axis' cube over the radius squared, a pebble's third harmonic that grows no faster than the distance,
    so the stone's distance stays a distance far off. */
function zenLump(dx: number, dy: number, ax: number, ay: number, q: number): number {
  const p = ax * dx + ay * dy;
  return (p * p * p) / (q + 0.000001);
}

/** The polynomial smooth union of the sand's distance d with a stone's rings r, its blend wider the farther out (inside
    a stone narrower, never under 0.009: the rings are at least minus the radius and the swell, 0.116 at most, and a
    union takes off a quarter of its blend at most). */
function zenUnion(d: number, r: number, k0: number, k1: number): number {
  const m = Math.min(d, r);
  const k = k0 + k1 * m;
  const h = Math.max(0, k - Math.abs(d - r));
  return m - (h * h) / (4 * k);
}

interface Stone {
  /** along the row and across it, D */
  a: number;
  n: number;
  rho: number;
  /** its ellipse: long over short, and the long axis' turn */
  q: number;
  turn: number;
}

/** A garden: the rake's tilt, the row's line, its lift and the stones, every stone within REACH of the middle, so
    the whole group stays in the box at any angle, and all three along the row, so no three make a tight triangle (the
    sand's distance peaks inside one, a dot of sand closed round). A main stone off the middle and a companion close
    by, sharing their rings; then a second companion on the main's other side one time in three (a group of three),
    else a third stone apart, GAP of sand from the others. */
function garden(seed: number) {
  const r = kitRng(seed);
  const tilt = (r() - 0.5) * 0.4;
  const row = (r() * 2 - 1) * 0.05;
  const lift = 0.1 + r() * 0.05;
  /* a small stone rounder than a large one: elongated and lumped, a small one read as a seed */
  const oval = (long: number) => ({ q: 1 + r() * long, turn: r() * Math.PI });
  const fits = (a: number, n: number, rho: number) => Math.hypot(a, n) + REACH_LUMP * rho <= REACH;
  const apart = (a: number, n: number, rho: number, gap: number) =>
    stones.every(p => Math.hypot(p.a - a, p.n - n) >= p.rho + rho + gap);
  const side = r() < 0.5 ? -1 : 1;
  const main = 0.08 + r() * 0.02;
  const at = side * (0.06 + r() * 0.1);
  const stones: Stone[] = [{ a: at, n: row + (r() - 0.5) * 0.04, rho: main, ...oval(0.45) }];
  /* a companion at an angle off the row, outward or, where that leaves the reach, inward */
  const companion = (toward: number) => {
    const rho = 0.05 + r() * 0.015;
    const dist = main + rho + 0.025 + r() * 0.035;
    const ang = (r() - 0.5) * 1.2;
    for (const way of [toward, -toward]) {
      const a = at + way * dist * Math.cos(ang);
      const n = stones[0].n + dist * Math.sin(ang);
      if (fits(a, n, rho) && apart(a, n, rho, 0.02)) {
        stones.push({ a, n, rho, ...oval(0.25) });
        return;
      }
    }
  };
  const out = r() < 0.5 ? 1 : -1;
  companion(out);
  const trio = r() < 1 / 3;
  if (trio) companion(-out);
  for (let tries = 0; stones.length < STONES && tries < 4000; tries++) {
    const rho = 0.05 + r() * 0.02;
    const a = (r() * 2 - 1) * REACH;
    const n = row + (r() * 2 - 1) * 0.06;
    if (fits(a, n, rho) && apart(a, n, rho, trio ? 0.02 : GAP))
      stones.push({ a, n, rho, ...oval(0.25) });
  }
  return { tilt, row, lift, stones };
}

/** How far from the middle a stone may reach, D, its lump taken as a quarter more than its radius: the half height of
    a 16 by 9 box (0.375) less a margin, so no angle of the view cuts a stone there or in a phone's 9 by 16 (the og
    card's 1.9 to 1 leaves 0.35); the second round's row ran 0.6 along, which the box's height cut at angle 0. */
const REACH = 0.36;
const REACH_LUMP = 1.25;
/** The sand between two stones that do not share their rings, D: under two grooves. */
const GAP = 0.09;

const TAU = Math.PI * 2;
/** The sand: the stones' level and the floor, a whole number of levels under it, and the grooves' depth. A groove's
    ridge rises 0.35 over its falling level and its trough falls 0.85 under it: three sheet edges a groove, as the
    first round's depth of 1 drew, but the cosine's slope 15% lower, so its levels lie 1.5 px apart at 320 by 180
    where the rings bend round an oval stone (they came to 1.34). At 14.83 every ridge and trough keeps 0.17 of a
    level or more from a sheet's edge through the grooves' whole swing (their phase 0.8 either way), the floor's ridges
    0.18 over level 4.5 and the first ridge round a stone 0.17 under the stone's outline at 15.5, so the swing never
    draws slivers along them (the first round's 14.74 kept 0.10; at 14.6 the troughs lay 0.09 over an edge and the breath
    drew slivers in and out, 810 loops in a still). */
const LEVEL = 14.83;
const FLOOR = 3.83;
const DEPTH = 0.85;
/** The stone: its edge at level 14, a wall of 110 levels a D up 1.8 levels (to 15.8), then, from where the wall ends,
    its facet a level higher over 0.29 of its radius (3.5 levels a radius). So its outline, level 15.5 (the seam), lies
    0.014 inside its edge, the sand's last level (14.5) a pale ring 0.009 wide between, and its facet's edge (16.5) 0.2
    of its radius past the wall: every stone a body and one facet. The facet starts where the wall ends, so their
    slopes never add (begun at a share of the radius, it overlapped a small stone's wall on its steep side and crowded
    it to 1.17 px at 320 by 180; added to a slope from the edge, 0.9), and it is a share of the stone's radius, so a
    small stone's is no dot (levels at fixed heights gave the large stones two terraces and the small ones a pupil). */
const STONE_EDGE = 14;
const STONE_WALL_LEVELS = 1.8;
const STONE_WALL = 110;
const FACET_LEVELS = 1;
const FACET_SLOPE = 3.5;
const FACET_FROM = STONE_WALL_LEVELS / STONE_WALL;
/** The lump: the share of the radius the cubic moves the outline, either way, 1.2 times this on a round stone and 0.75
    on the longest. At 0.1 the stones read as ovals again; at 0.32 the small ones as teeth and seeds. */
const LUMP = 0.2;
/** The motion (8 Nov 2026): each phase a breath of its own while the stones hold, where the first round's two (the
    grooves' phase four times a loop, the lift's twice) moved the edges 0.33 to 0.34 px a second at the median and 1.3
    to 1.4 at the 99th percentile at 480 by 270, a garden almost still, and drew one picture at t and t + 60 s. The
    lift breathes three times a loop (40 s), an odd count, so the frames half a loop apart differ. Its swing at t = 0,
    BREATH times the lift's cosine there, which a seed's draw puts anywhere between -1 and 1, is the still's, the row's
    lift as the first round drew it; from there the raked lines either side of the row drift toward it and back by
    DRIFT at most, a fifth of a groove. At BREATH, the first round's swing, the whole raked field slid 0.42 of a groove
    either way every 40 s, the picture's largest area and its strongest edges, so the far corners changed most while
    the rings by the stones held, and the crest along the row opened and closed a pale strip out to the frame's edge
    (its slivers a pixel thin up to 111 and 115 a frame at angle 105 in shapes 417 and 0, now 39 and 40). */
const BREATH = 0.02;
const DRIFT = 0.01;
const LIFT_CYCLES = 3;
/** The swell, D either way: the main stone's rings swell out and draw back six times a loop (20 s, a breath), its
    companion's against it by COUNTER as much, so where their rings merge the figure leans from one to the other; the
    third stone's rings follow the lift, SLOW at most from where they lie at t = 0, swelling as the raked lines drift
    in. The cosine of a sine holds each breath past 0.8 of its reach for 6 s of every 10, crossing in 4. With the far
    field held, the swell is the motion that reads, and the frames 15.6 s apart lean on it: at 0.012 to 0.015 a pastel
    palette's pair at 30 s in shape 417 (and at 0.013 its pair at 10 s in shape 7, where the lift comes back to its
    value) lay within the frame limits, which the first round's sliding field had carried; at 0.016 every pair of seven
    palettes, four looks and twelve times lies past them (pastel's nearest a mean of 1.53, vivid's 2.14), and the edges
    move 2.5 to 2.9 px a second at the 95th percentile at 480 by 270 and 3.0 to 3.3 at the 99th; at 0.018, with the
    field sliding too, 3.4 to 3.6 at the 95th, busy. More
    of the third stone's swell (0.012) did not help: in a merged trio its rings move against the raked lines. Each stone
    a phase of its own, not one swell for all: with neighbours along the row on one swell in opposite phases, the frame
    0.13 of a loop on lay within the frame limits of its first at 4 of 336 times over seven palettes and four looks (the
    lift's cosine the same at the two, the rings cancelling in a merged trio), none with the third on the lift. */
const SWELL = 0.016;
const COUNTER = 0.83;
const SWELL_CYCLES = 6;
const SLOW = 0.01;
/** The grooves' phase: it shifts each ridge within its groove, the levels holding, so no band starts or stops, twice a
    loop (60 s), the first round's swing, 0.8 either way about pi. It moves every groove at once, the rings' and the
    far field's alike: at five times a loop (24 s) it was most of the far field's motion (alone, 25% of its pixels
    changed over 3 s, the swell 7 to 14% there), so the garden drifted everywhere rather than holding while its rings
    breathed; at twice, the edges' median speed halves (0.47 to 0.55 px a second to 0.22 to 0.26 at 480 by 270, the
    swell at 0.012) while the 95th percentile, the swell's transits, stays (2.0 to 2.3 to 1.9 to 2.1), and an edge
    crosses the saddle between merged rings four times a loop, not ten. Three times a loop, with the lift's three and
    the swell's six, repeated every 40 s, and the light, symmetric about t = 30 s, drew the frames at 10 and 50 s as one
    picture; once a loop, the frames 15.6 s apart lay a mean of 1.55 apart at the nearest, at the limit. Every ridge
    and trough keeps 0.178 of a level or more from a sheet's edge for phases from pi - 1.8 to pi + 0.8, but the sand
    held flat at a stone's edge (where its rings swell out, and in a lumped stone's dents), LEVEL + DEPTH cos(phase),
    stays 0.17 under level 14.5 only within 0.94 of pi: further, a moat would change color at once. */
const GROOVE_CYCLES = 2;

export const zen: FieldEffect = {
  kind: "zen",
  loop: 120,
  span: 0.75,
  /* seed 1004 of 1000 to 1023: a stone apart on the left, a large pebble with its companion on the right, their
     rings merged into one figure, and the raked lines bending over the group and running on either side: the
     asymmetry of a garden of stones and every part of the look in one frame. 1006 was the same group with a seed of a
     stone apart, 1000 and 1002 a closer triangle, 1007, 1015 and 1017 three in a line, evenly spaced. */
  designedSeed: 1004,
  uniforms: { rake: 17, stone: 11 * STONES },
  tracks: 3,
  design(seed) {
    const { tilt, row, lift, stones } = garden(seed);
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    /* the stones' lumps from a draw of their own (a radius of 0.05 at least, where the smallest stone's facet
       crowded its wall) */
    const r = kitRng(seed ^ 0x2545f491);
    /* the phases the first round drew, which set the frame at t = 0: the grooves' and the lift's */
    const rt = kitRng(seed ^ 0x5bd1e995);
    const psi0 = kitRound(rt() * TAU);
    const psi1 = kitRound(rt() * TAU);
    /* the lift's cosine at t = 0, as every format reads it */
    const lift0 = kitRound(
      Math.cos(kitRound(Math.PI / 2) + kitRound(Math.PI / 2) * Math.sin(psi1))
    );
    /* how far each stone's rings swell: the main's, its companion's against it, the third's on the lift, its reach
       either way of where it starts at most SLOW, as the raked lines' is DRIFT (the lift's cosine moves at most
       1 + |lift0| off its start) */
    const reach = 1 + Math.abs(lift0);
    const swells = [SWELL, -COUNTER * SWELL, SLOW / reach];
    const stone: number[] = [];
    for (let i = 0; i < STONES; i++) {
      const p = stones[i];
      if (!p) {
        /* a stone the garden does not hold lies far off, a point */
        stone.push(50, 50, 0.001, 1, 1, 0, 0, 0, 0, 0, 0);
        continue;
      }
      /* the ellipse's quadratic form, its area the circle's: sqrt(q) times the radius along `turn`, over it across */
      const ct = Math.cos(p.turn);
      const st = Math.sin(p.turn);
      const ia = 1 / p.q;
      const ib = p.q;
      const axis = r() * TAU;
      /* a round stone lumped more, a long one less: a long one lumped along its length read as a teardrop */
      const cube = Math.cbrt(LUMP * (1.2 - (p.q - 1)));
      /* its facet: FACET_SLOPE levels a radius from where its wall ends, FACET_FROM in, at the wall's top */
      const slope = kitRound(FACET_SLOPE * kitRound(1 / p.rho));
      stone.push(
        c * p.a - s * p.n,
        s * p.a + c * p.n,
        p.rho,
        ct * ct * ia + st * st * ib,
        st * st * ia + ct * ct * ib,
        2 * ct * st * (ia - ib),
        cube * Math.cos(axis),
        cube * Math.sin(axis),
        slope,
        STONE_EDGE + STONE_WALL_LEVELS - kitRound(FACET_FROM) * slope,
        swells[i]
      );
    }
    /* the line's middle rounded over a quarter of a groove: wider (0.03) left a flat unraked path along the row */
    const soft = 0.012;
    const rake = [
      -s,
      c,
      -row,
      soft * soft,
      /* the row's lift at t = 0, as the first round drew it there: BREATH times the lift's cosine */
      lift - soft + BREATH * lift0,
      0.05,
      0.35,
      FLOOR,
      LEVEL,
      1 / GROOVE,
      DEPTH,
      TAU / GROOVE,
      STONE_EDGE,
      STONE_WALL,
      STONE_EDGE + STONE_WALL_LEVELS + FACET_LEVELS,
      DRIFT / reach,
      lift0
    ];
    /* the grooves' phase from where the first round drew it, twice a loop; cos(pi/2 + pi/2 sin) runs -1 to 1 and
       back, the lift's from where it was drawn, the swell's from 0 */
    const tracks: Track[] = [
      { rest: kitRound(Math.PI), swing: 0.8, cycles: GROOVE_CYCLES, psi: psi0 },
      { rest: kitRound(Math.PI / 2), swing: kitRound(Math.PI / 2), cycles: LIFT_CYCLES, psi: psi1 },
      { rest: kitRound(Math.PI / 2), swing: kitRound(Math.PI / 2), cycles: SWELL_CYCLES, psi: 0 }
    ];
    return { U: { rake: rake.map(kitRound), stone: stone.map(kitRound) }, tracks };
  },
  field: zenField,
  /* the sheets run on every whole level, so the ground never shows */
  ground: { pick: "darkest", lightness: 0.5, bound: 0.2, chroma: 0.7, lift: 0 },
  sheets: {
    base: 0.5,
    step: 1,
    count: null,
    /* the seam between levels 14 and 15: the sand by the stones the palette's first sixteenths, the far sand 0.62 to
       0.75 of it, the stones 0.88 and 0.94 under their band, a tone apart from the far sand (at offset 1 the far sand
       took the stones' own colors and the stones' flank two pale rings) */
    colors: { hop: -1 / 16, offset: 0.875, wrap: "cycle" },
    /* each shadow the sheet below darkened and each rim the sheet's own color lit, where the ink and white of the
       first round greyed the pastel and dark palettes: broad and faint on the sand, a quarter of a groove's flank in
       shade and a sixth lit, the ridges shaded as raking light shades sand (narrow ones drew each edge as a line, a
       contour map), and on a stone a lit face, a shaded one and a shadow on the sand. The light swings 35 degrees
       either way (25 hardly showed in a loop). A soft shadow (two to four layers) read most like sand but wrote a path
       a layer: the still 49 to 72 KiB */
    shadow: { angle: 55, distance: 0.012, alpha: 0.24, swing: 35, tint: "below", depth: 0.55 },
    rim: { distance: 0.008, alpha: 0.28, tint: "own", lift: 0.5 }
  },
  /* the stones' band, from a stone's outline (15.5) up: its body and facet the palette at 0.15 over their own colors
     at 0.45, a stone's muted tone, where the palette's far end alone was its brightest spot (vivid's red read as
     jelly beans, a purple-to-orange palette's as egg yolks); one band of every 30 levels, so the sand (2.98 to 15.32)
     holds none. The palette's darkest stop in its place kept vivid's red (its darkest is its end), and its start
     turned a palette that starts and ends white to white stones */
  lines: {
    base: 16.4,
    step: 30,
    half: 0.9,
    colors: { hop: 0, offset: 0.15, wrap: "clamp" },
    alpha: 0.45
  },
  /* its clips' weight (test/kit-weight.ts's measure, 8 Nov 2026, on a clips' module built with this kernel, its frames
     kitRender's to the byte, the machine quiet): its frames measured 32.5 to 40.8 against a pixel of the glass's
     longest clip over four runs (the median 38.3 to 38.6), in wide, tall and square clips at 60 and 30 frames a
     second and three palettes, where kitVideoWeight counts its kernel's costliest path, 73.8. With the machine shared
     they measured 29.6 to 44.3, and the kernel of 158 before the swell 31.6 to 38.0 in the same runs */
  clipWeight: { weight: 41, cost: 160 },
  about: {
    shows:
      "its colors as a raked sand garden seen from above, a group of stones ringed by the rake's grooves",
    video:
      "A looping video of a Grabient palette: a raked sand garden in its colors, the rings round its stones swelling and drawing back while the raked lines drift slowly.",
    describe:
      "{name} played as a zen garden: the palette {colors} raked into sand round a group of stones in its last colors, muted, a color a groove from the stones outward, the rings round the stones swelling and drawing back while the raked lines drift slowly and the light swings.",
    what: "the zen garden, the palette as raked sand round a group of stones"
  }
};

export default zen;
