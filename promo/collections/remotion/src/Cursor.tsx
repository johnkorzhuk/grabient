// The pointer the headless browser never draws: a macOS-style arrow, and the pointing hand where the page asks for
// `cursor: pointer`, at the exact spot the capture moved Playwright's mouse to. A press squeezes it a little and leaves a
// soft ring where it landed.
import { Easing, interpolate } from "remotion";

const ARROW = "M3 1.5 L3 19.4 L7.35 15.25 L10.15 21.75 L13.05 20.5 L10.25 14.1 L16.2 14.1 Z";
const HAND =
  "M9.25 1.6 C10.25 1.6 11 2.4 11 3.35 L11 9.6 C11.3 9.05 11.85 8.75 12.45 8.75 C13.35 8.75 14.05 9.35 14.15 10.15 " +
  "C14.45 9.75 14.95 9.55 15.5 9.55 C16.4 9.55 17.1 10.25 17.2 11.05 C17.5 10.75 17.9 10.6 18.35 10.6 " +
  "C19.25 10.6 19.95 11.3 19.95 12.2 L19.95 16.6 C19.95 20.2 17.4 22.75 13.9 22.75 L12 22.75 " +
  "C9.85 22.75 8.55 22.05 7.35 20.85 L3.45 16.95 C2.75 16.25 2.75 15.15 3.45 14.45 C4.15 13.75 5.25 13.75 5.95 14.45 " +
  "L7.5 16 L7.5 3.35 C7.5 2.4 8.25 1.6 9.25 1.6 Z";
const CREASES = "M11 9.6 L11 13.2 M14.15 10.15 L14.15 13.4 M17.2 11.05 L17.2 13.6";
/** where each shape points, in its 24-unit box */
const HOT = { arrow: { x: 3, y: 1.5 }, hand: { x: 9.25, y: 1.6 } };

export function Cursor(props: { x: number; y: number; size: number; hand: boolean; pressed: number }) {
  const kind = props.hand ? "hand" : "arrow";
  const k = props.size / 24;
  // a press squeezes the pointer toward its tip
  const squeeze = 1 - 0.1 * props.pressed;
  return (
    <svg
      viewBox="0 0 24 24"
      width={props.size}
      height={props.size}
      style={{
        position: "absolute",
        left: props.x - HOT[kind].x * k,
        top: props.y - HOT[kind].y * k,
        overflow: "visible",
        transformOrigin: `${HOT[kind].x * k}px ${HOT[kind].y * k}px`,
        scale: String(squeeze)
        // no drop shadow: a soft shadow on a dark panel is what a GIF encoder leaves behind as a ghost of the pointer
      }}
    >
      {props.hand ? (
        <>
          <path d={HAND} fill="#fff" stroke="#111" strokeWidth={1.15} strokeLinejoin="round" />
          <path d={CREASES} fill="none" stroke="#111" strokeWidth={0.9} strokeLinecap="round" />
        </>
      ) : (
        <path d={ARROW} fill="#111" stroke="#fff" strokeWidth={1.45} strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** The ring a press leaves, `age` frames after the button went down, in `ink` (an "r,g,b": light on the dark theme,
    dark on the light one). */
export function Ripple(props: { x: number; y: number; age: number; radius: number; ink: string }) {
  const life = 16;
  if (props.age < 0 || props.age > life) return null;
  const t = props.age / life;
  const r = interpolate(t, [0, 1], [0.18, 1], { easing: Easing.out(Easing.cubic) }) * props.radius;
  // up at once, then out with a last step big enough that a GIF encoder clears it rather than leave a faint ring
  const opacity = interpolate(t, [0, 0.15, 1], [0, 0.7, 0], { easing: [Easing.out(Easing.quad), Easing.in(Easing.quad)] });
  return (
    <div
      style={{
        position: "absolute",
        left: props.x - r,
        top: props.y - r,
        width: 2 * r,
        height: 2 * r,
        borderRadius: "50%",
        opacity,
        // a crisp ring and nothing soft around it, for the same reason as the pointer's missing shadow
        border: `${Math.max(1.5, props.radius * 0.08)}px solid rgba(${props.ink},0.9)`
      }}
    />
  );
}
