/* How the file and picture routes read an address: its query, and the name before a file's extension. */
import { EFFECT_KINDS, isEffect } from "@grabient/engine/effect.ts";
import {
  type ParamReader,
  parseSize,
  parseView,
  type Style,
  type View
} from "@grabient/engine/view.ts";

/** The query as every file and picture reads it: a key a crawler copied from HTML as `amp;style` is read as `style`,
    and of a repeated key the last wins. */
export function addressParams(query: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of query) {
    params.set(key.startsWith("amp;") ? key.slice(4) : key, value);
  }
  return params;
}

/** The name a path gives before `.extension` (`kAbc` of /kAbc.css, `@ada/warm` of /@ada/warm.md), URL-decoded; a bad
    escape names nothing. */
export function fileName(path: string, extension: string): string {
  const raw = path.slice(1, -extension.length - 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

/** A palette's view as saved somewhere. */
export interface Saved {
  style?: Style;
  steps?: number;
  angle?: number;
}

/** The view an address asks for: style, steps and angle from its query, each one it leaves out as saved, then as the
    defaults; steps never under the palette's keyframes; no soft where its style is an effect that takes none (the
    blob), whatever it says; and its steps as saved where its style is an effect that takes steps of its own (the
    sandstone's, its look's: engine/effect.ts parseEffect), so the palette's own view stands beside the effect. */
export function viewAt(
  params: URLSearchParams,
  keyframes: number,
  saved: Saved = {}
): Pick<View, "style" | "steps" | "angle" | "soft" | "grain"> {
  const kind = params.get("style");
  const stepped = isEffect(kind) && EFFECT_KINDS[kind].steps !== null;
  const reader: ParamReader = {
    get: key => {
      if (params.has(key) && !(stepped && key === "steps")) return params.get(key);
      const value = saved[key as keyof Saved];
      return value == null ? null : String(value);
    }
  };
  const { style, steps, angle, soft, grain } = parseView(reader);
  return {
    style,
    steps: Math.max(steps, keyframes),
    angle,
    ...(soft && !(isEffect(kind) && !EFFECT_KINDS[kind].soft) ? { soft } : {}),
    ...(grain ? { grain } : {})
  };
}

/** The SVG's size: `w` and `h` first, as a PNG's, so an address keeps its size when .png becomes .svg; a pair the
    size's bounds refuse leaves the view's own. */
export function svgSize(params: URLSearchParams) {
  const side = (key: string) => {
    const raw = params.get(key);
    return raw && /^\d+$/.test(raw) ? raw : null;
  };
  const w = side("w");
  const h = side("h");
  return ((w || h) && parseSize(`${w ?? "auto"}x${h ?? "auto"}`)) || parseView(params).size;
}
