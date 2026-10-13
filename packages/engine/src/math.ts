export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
/** A change of hue the short way round, -180 to 180. */
export const shortTurn = (d: number) => d - 360 * Math.round(d / 360);
/** A hue's place on the wheel, 0 up to 360. */
export const onWheel = (h: number) => ((h % 360) + 360) % 360;
