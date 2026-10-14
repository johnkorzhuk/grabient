import type { Palette } from "@grabient/engine/palette.ts";
import { createEffect, createMemo, createSignal, onSettled } from "solid-js";
import { t } from "./i18n.ts";
import { type PickMode, pickModeOf } from "./Keyframes.tsx";
import { paintMarks } from "./marks.ts";
import { reducedMotion } from "./motion.ts";
import { createHold, SLOP } from "./press.ts";
import styles from "./Solid.module.css";
import {
  CAM0,
  type Cam,
  drawPointer,
  nearestOnPath,
  PATH_REACH,
  PATH_REACH_TOUCH,
  type SceneResult,
  type SolidFrame,
  type SolidInk,
  solidFrame,
  solidScene
} from "./solid.ts";

export { CAM0, type Cam };

/* The color solid, live: the scene on a canvas. A drag turns it; resting on the parked solid in the corner flies it
   home, and a click (a tap) keeps it there. A finger that starts sideways orbits and one that starts up or down scrolls
   the page, since on a phone the scene is a third of the sheet. A press on the path holds the keyframe nearest it (Shift
   extends, Ctrl or Cmd adds, a finger's long press adds), a press that runs along it takes the run between, and the
   scene never turns meanwhile. The theme's colors are read through four probes. The scene is kept as a picture, drawn
   again only when the camera, the palette, the flight, the size or the theme changes, and only while some of it is in
   the window; a pointer's ring and reading are drawn over it. */
export function Solid(props: {
  palette: Palette;
  wide?: boolean;
  steps: number;
  /** the stops as hard bands: the dots are what ships */
  stepped?: boolean;
  selection?: readonly number[];
  /** a press on the path: the keyframe nearest it, as a chip is picked */
  onSelect?: (i: number, mode: PickMode) => void;
  /** a press that went on along the path, from the keyframe it began at to the one nearest now */
  onSweep?: (from: number, to: number) => void;
  height?: number;
  onHover?: (t: number | null) => void;
  /** the solid kept home by a click; the press that lets it go is the host's */
  kept?: boolean;
  onKept?: (kept: boolean) => void;
  /** the camera as it stands, for a figure copied from this view */
  onView?: (view: { cam: Cam }) => void;
}) {
  let host!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  const probes: Record<keyof SolidInk, HTMLSpanElement | undefined> = {
    ink: undefined,
    ink3: undefined,
    edge: undefined,
    paper: undefined
  };
  let cam: Cam = { ...CAM0 };
  let hover: [number, number] | null = null;
  let raf = 0;
  /* the scene as drawn last: the path and the bay as they stand on screen, for a press to be judged against */
  let last: SceneResult | null = null;
  const pickable = () => !!(props.onSelect || props.onSweep);
  /* a press that landed on the path: the keyframe it holds, how, and the run since (`to`, once `live`) */
  let pick: { i: number; mode: PickMode; wasHeld: boolean; to: number; live: boolean } | null =
    null;
  let hullK = 0;
  let hullTarget = 0;
  let hullHot = false;
  let hullRaf = 0;
  let keptHere = false;
  /* where a press that never became a drag let go, for the next frame to judge against the corner */
  let tapAt: [number, number] | null = null;
  const kept = () => (props.onKept ? !!props.kept : keptHere);
  const setKept = (on: boolean) => {
    if (props.onKept) props.onKept(on);
    else keptHere = on;
  };
  const frame = createMemo(() =>
    solidFrame(props.palette, props.steps, !!props.stepped, !!props.wide, props.selection ?? [])
  );
  /* worked out and drawn only while some of it is in the window: a palette a drag changes out of sight is drawn once,
     as it comes into sight */
  const [seen, setSeen] = createSignal(false);
  const paint = () => {
    if (!raf && seen()) raf = requestAnimationFrame(draw);
  };
  const fly = () => {
    hullRaf = 0;
    if (Math.abs(hullK - hullTarget) < 0.004) {
      if (hullK !== hullTarget) {
        hullK = hullTarget;
        paint();
      }
      return;
    }
    hullK += (hullTarget - hullK) * 0.28;
    paint();
    hullRaf = requestAnimationFrame(fly);
  };
  /* the solid flies home and back; with less motion it is simply there */
  const aim = (to: number) => {
    if (hullTarget === to) return;
    hullTarget = to;
    if (reducedMotion()) {
      cancelAnimationFrame(hullRaf);
      hullRaf = 0;
      hullK = to;
      paint();
      return;
    }
    hullRaf ||= requestAnimationFrame(fly);
  };
  let K: SolidInk | null = null;
  let picture: HTMLCanvasElement | null = null;
  let pictureKey = "";
  let pictureFrame: SolidFrame | null = null;
  const draw = () => {
    raf = 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = Math.max(120, host.clientWidth);
    const H = props.height ?? 300;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(W * dpr);
    const ph = Math.round(H * dpr);
    /* a canvas given a size drops its pixels, so only when the size changed */
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
      canvas.style.height = `${H}px`;
    }
    K ??= {
      ink: getComputedStyle(probes.ink as Element).color,
      ink3: getComputedStyle(probes.ink3 as Element).color,
      edge: getComputedStyle(probes.edge as Element).color,
      paper: getComputedStyle(probes.paper as Element).color
    };
    const f = frame();
    const key = `${pw} ${ph} ${dpr} ${cam.yaw} ${cam.pitch} ${hullK} ${K.ink} ${K.ink3} ${K.edge} ${K.paper}`;
    picture ??= document.createElement("canvas");
    if (key !== pictureKey || f !== pictureFrame || !last) {
      if (picture.width !== pw || picture.height !== ph) {
        picture.width = pw;
        picture.height = ph;
      }
      const pctx = picture.getContext("2d");
      if (!pctx) return;
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.clearRect(0, 0, W, H);
      last = solidScene(f, cam, K, W, H, { hullK, outline: true });
      paintMarks(pctx, last.marks);
      pictureKey = key;
      pictureFrame = f;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(picture, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const at = hover ?? tapAt;
    const read = at
      ? drawPointer(ctx, last.scene, K, { hover: at, kept: kept(), pick: pickable() })
      : null;
    hullHot = !!read?.hullHot;
    if (tapAt) {
      tapAt = null;
      if (hullHot) setKept(!kept());
      /* a finger's tap left no hover: the next frame draws the scene without the reading it was judged by */
      if (!hover) {
        hullHot = false;
        paint();
      }
    }
    aim(kept() || hullHot ? 1 : 0);
    canvas.style.cursor =
      hullHot || (pickable() && (pick || read?.hoverT != null)) ? "pointer" : "grab";
    props.onHover?.(hover ? (read?.hoverT ?? null) : null);
  };
  onSettled(() => {
    const sizes = new ResizeObserver(paint);
    sizes.observe(host);
    const sight = new IntersectionObserver(entries =>
      setSeen(entries[entries.length - 1].isIntersecting)
    );
    sight.observe(host);
    /* a theme change, on the page or from the device, reads the colors again */
    const retheme = () => {
      K = null;
      paint();
    };
    const marks = new MutationObserver(retheme);
    marks.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"]
    });
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", retheme);
    paint();
    props.onView?.({ cam });
    return () => {
      sizes.disconnect();
      sight.disconnect();
      marks.disconnect();
      scheme.removeEventListener("change", retheme);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(hullRaf);
    };
  });
  createEffect(
    () => (seen() ? ([frame(), props.height, props.kept] as const) : null),
    now => {
      /* in sight, as the compute read */
      if (now && !raf) raf = requestAnimationFrame(draw);
    }
  );
  let pointer: number | null = null;
  let x0 = 0;
  let y0 = 0;
  let moved = false;
  let finger = false;
  const at = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onPath = (p: [number, number]) =>
    last
      ? nearestOnPath(
          last.path,
          frame().cont.map(c => c.t),
          p
        )
      : null;
  const keyOf = (t: number) =>
    Math.round(Math.max(0, Math.min(1, t)) * Math.max(0, props.palette.anchors.length - 1));
  const inBay = (p: [number, number]) => {
    const b = last?.bay;
    return !!b && p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h;
  };
  /* a finger's long press on the path adds the keyframe to the hold or lets it go, as Ctrl or Cmd does */
  const hold = createHold(() => {
    if (pick && !pick.live) props.onSelect?.(pick.i, "toggle");
  });
  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointer = e.pointerId;
    x0 = e.clientX;
    y0 = e.clientY;
    moved = false;
    finger = e.pointerType !== "mouse";
    hover = at(e);
    canvas.setPointerCapture(e.pointerId);
    const p = at(e);
    const on = pickable() && !inBay(p) ? onPath(p) : null;
    if (!on || on.d > (finger ? PATH_REACH_TOUCH : PATH_REACH)) return;
    /* on the path: this press holds keyframes and never turns the scene. A mouse holds as it lands, but a plain press on
       a held keyframe lets it go only if it stays a click; a finger waits for a tap, a long press or a slide */
    const i = keyOf(on.t);
    const wasHeld = !!props.selection?.includes(i);
    const mode: PickMode = finger ? "one" : pickModeOf(e);
    pick = { i, mode, wasHeld, to: i, live: false };
    hover = [on.x, on.y];
    if (finger) hold.down(e);
    else if (mode !== "one" || !wasHeld) props.onSelect?.(i, mode);
    paint();
  };
  const move = (e: PointerEvent) => {
    if (pick && e.pointerId === pointer) {
      if (finger) hold.move(e);
      const on = onPath(at(e));
      if (on) {
        const to = keyOf(on.t);
        /* the run starts once a mouse reaches another keyframe or a finger slides past the slop; from then every
           keyframe it reaches is the run's other end, the first one again included */
        if (
          !pick.live &&
          (finger ? Math.hypot(e.clientX - x0, e.clientY - y0) > SLOP : to !== pick.i)
        ) {
          pick.live = true;
          pick.to = -1;
        }
        if (pick.live && to !== pick.to) {
          pick.to = to;
          props.onSweep?.(pick.i, to);
        }
        hover = [on.x, on.y];
      }
      paint();
      return;
    }
    if (e.pointerId === pointer) {
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (!moved && (finger ? Math.hypot(dx, dy) > SLOP : Math.abs(dx) + Math.abs(dy) > 2))
        moved = true;
      if (moved) {
        cam = {
          yaw: cam.yaw + dx * 0.01,
          pitch: Math.max(0.05, Math.min(1.5, cam.pitch + dy * 0.01))
        };
        x0 = e.clientX;
        y0 = e.clientY;
        props.onView?.({ cam });
      }
    }
    hover = at(e);
    paint();
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    canvas.releasePointerCapture(e.pointerId);
    pointer = null;
    if (pick) {
      const p = pick;
      pick = null;
      if (finger) {
        if (hold.up(e) === "tap" && !p.live) props.onSelect?.(p.i, "one");
      } else if (!p.live && p.mode === "one" && p.wasHeld) props.onSelect?.(p.i, "one");
      hover = finger ? null : at(e);
      paint();
      return;
    }
    if (!moved) {
      tapAt = at(e);
      hover = at(e);
    }
    paint();
    if (e.pointerType !== "mouse") {
      hover = null;
      paint();
    }
  };
  /* the page took the finger for a scroll: no orbit, and no tap to keep the solid */
  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (pick) {
      hold.cancel();
      pick = null;
    }
    pointer = null;
    hover = null;
    paint();
  };
  return (
    <div ref={host} class={styles.host} dir="ltr">
      <span class={styles.probe} aria-hidden="true">
        <span
          ref={el => {
            probes.ink = el;
          }}
          data-ink="ink"
        />
        <span
          ref={el => {
            probes.ink3 = el;
          }}
          data-ink="ink3"
        />
        <span
          ref={el => {
            probes.edge = el;
          }}
          data-ink="edge"
        />
        <span
          ref={el => {
            probes.paper = el;
          }}
          data-ink="paper"
        />
      </span>
      <canvas
        ref={canvas}
        class={styles.canvas}
        role="img"
        aria-label={t("The palette in the color space")}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onPointerLeave={() => {
          if (pick) return;
          hover = null;
          paint();
        }}
      />
    </div>
  );
}
