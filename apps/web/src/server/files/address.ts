/* How the file and picture routes read an address: its query, and the name before a file's extension. */
import { type ParamReader, parseView, type Style, type View } from "@grabient/engine/view.ts";

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
    defaults; steps never under the palette's keyframes. */
export function viewAt(
  params: URLSearchParams,
  keyframes: number,
  saved: Saved = {}
): Pick<View, "style" | "steps" | "angle"> {
  const reader: ParamReader = {
    get: key => {
      if (params.has(key)) return params.get(key);
      const value = saved[key as keyof Saved];
      return value == null ? null : String(value);
    }
  };
  const { style, steps, angle } = parseView(reader);
  return { style, steps: Math.max(steps, keyframes), angle };
}
