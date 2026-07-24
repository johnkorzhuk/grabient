import { serializeCoeffs } from "@repo/data-ops/serialization";
import {
  DEFAULT_GLOBALS,
  coeffsSchema,
  rawVectorInputSchema,
} from "@repo/data-ops/valibot-schema/grabient";
import * as v from "valibot";
import { canonicalSeed } from "./palette";

const rawCoeffsSchema = v.tuple([
  rawVectorInputSchema,
  rawVectorInputSchema,
  rawVectorInputSchema,
  rawVectorInputSchema,
]);

const PALETTE_PARAM_KEYS = ["style", "angle", "steps"] as const;

export type ParsedSearchInput = {
  kind: "vector" | "url" | "seed" | "text";
  query: string;
  searchParams: Record<string, string>;
};

function vectorSeed(input: string): string | null {
  if (!input.trim().startsWith("[[")) return null;
  try {
    const parsed = v.safeParse(rawCoeffsSchema, JSON.parse(input));
    if (!parsed.success) return null;
    const coeffs = v.safeParse(coeffsSchema, parsed.output);
    return coeffs.success ? serializeCoeffs(coeffs.output, DEFAULT_GLOBALS) : null;
  } catch {
    return null;
  }
}

function allowedGrabientHost(hostname: string, currentOrigin?: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "grabient.com" || host.endsWith(".grabient.com")) return true;
  if (host === "grabient-lite.jkorzhuk.workers.dev") return true;
  if (!currentOrigin) return false;
  try {
    return host === new URL(currentOrigin).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function grabientUrl(
  input: string,
  currentOrigin?: string,
): { seed: string; searchParams: Record<string, string> } | null {
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) {
    if (!/(?:^|\.)grabient\.com(?:\/|$)/i.test(value)) return null;
    value = `https://${value}`;
  }

  try {
    const url = new URL(value);
    if (!allowedGrabientHost(url.hostname, currentOrigin)) return null;
    const rawSeed = url.pathname.split("/").filter(Boolean)[0];
    const seed = rawSeed ? canonicalSeed(decodeURIComponent(rawSeed)) : null;
    if (!seed) return null;

    const searchParams: Record<string, string> = {};
    for (const key of PALETTE_PARAM_KEYS) {
      const param = url.searchParams.get(key);
      if (param !== null) searchParams[key] = param;
    }
    return { seed, searchParams };
  } catch {
    return null;
  }
}

/** Port of the current Grabient search input's vector/URL/seed/text routing. */
export function parseSearchInput(
  input: string,
  currentOrigin?: string,
): ParsedSearchInput | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromVector = vectorSeed(trimmed);
  if (fromVector)
    return { kind: "vector", query: fromVector, searchParams: {} };

  const fromUrl = grabientUrl(trimmed, currentOrigin);
  if (fromUrl)
    return {
      kind: "url",
      query: fromUrl.seed,
      searchParams: fromUrl.searchParams,
    };

  const seed = canonicalSeed(trimmed);
  if (seed) return { kind: "seed", query: seed, searchParams: {} };

  return { kind: "text", query: trimmed, searchParams: {} };
}

export function searchRouteSegment(query: string): string {
  const seed = canonicalSeed(query);
  if (seed) return encodeURIComponent(seed);
  return encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, "-"));
}
