// The public palette MCP server.
//
// Same data as the JSON endpoints, shaped as tools an agent can call directly:
// search the corpus, read one palette, build a new one from coefficients, nudge
// an existing one along the four named axes, and render a PNG. Everything is a
// pure function of the seed except search, which needs Vectorize.
//
// AUTH POSTURE, and why it is built this way before there is any auth at all.
// Every tool is public today: zero friction is the whole adoption argument, and
// no MCP client requires OAuth. The intention is to gate some tools behind an
// account later, so identity is threaded through from the start rather than
// retrofitted — `requireAccount()` is the single enforcement point and every
// tool already receives a viewer that is simply null while nothing is gated.
//
// The gated path is better-auth's MCP plugin, which this project is already set
// up for (better-auth backs Google + magic-link sign-in today). Wiring it means
// adding `mcp({ loginPage: "/login" })` to the auth config, wrapping this
// handler in `withMcpAuth(auth, (req, session) => ...)`, and serving
// `oAuthDiscoveryMetadata(auth)`. The plugin emits the 401 with
// `WWW-Authenticate: Bearer resource_metadata="..."` that MCP clients use to
// start an OAuth flow, so existing accounts become MCP credentials with no new
// identity system.

import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import {
  DEFAULT_ANGLE,
  DEFAULT_PAGE_LIMIT,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  PALETTE_STYLES,
} from "@repo/data-ops/valibot-schema/grabient";
import { deserializeCoeffs, serializeCoeffs } from "@repo/data-ops/serialization";
import { paletteJson } from "./palette-json";
import { normalizeSemanticQuery, searchSemanticPalettes } from "./semantic-search";

/**
 * Who is calling, when anyone is. Null means anonymous, which is every caller
 * today.
 *
 * Deliberately a plain value passed into the server factory rather than read
 * from a framework global: better-auth's MCP plugin hands the session to the
 * handler (`withMcpAuth(auth, (req, session) => ...)`), while Cloudflare's
 * handler exposes it through `getMcpAuthContext()`. Threading it as an argument
 * keeps the tools working under either, so choosing an auth path later does not
 * touch a single tool.
 */
export interface Viewer {
  id: string;
  email?: string;
}

/**
 * The gate. Tools that need an account call this first; public tools never do.
 * Nothing is gated today, so it is dormant — but it is the one place that has
 * to change when something is.
 *
 * Throwing is correct: the SDK turns a thrown error into a tool error the
 * client shows the user, which is what should happen when a human needs to go
 * create an account.
 */
function requireAccount(viewer: Viewer | null): Viewer {
  if (!viewer)
    throw new Error(
      "This tool needs a Grabient account. Sign in at https://grabient.com/login and reconnect.",
    );
  return viewer;
}

const styleSchema = z.enum(PALETTE_STYLES as unknown as [string, ...string[]]);
const stepsSchema = z.number().int().min(2).max(50);
const angleSchema = z.number().int().min(0).max(360);
/** Matches the site's coefficient bounds (coeffs.ts), so an agent gets a
 * schema error rather than a silently clamped palette. */
const coeffSchema = z.number().min(-131.072).max(131.071);
const rgbSchema = z.tuple([coeffSchema, coeffSchema, coeffSchema]);

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function createPaletteServer(env: Env, origin: string, viewer: Viewer | null = null) {
  const server = new McpServer({ name: "grabient", version: "1.0.0" });

  server.registerTool(
    "search_palettes",
    {
      description:
        "Find gradient palettes by description — a color, mood, theme or season " +
        "('warm sunset', 'muted earth tones', 'pastel purple'). Returns palettes " +
        "with their hex colors, CSS and permanent URLs. Results are nearest " +
        "matches with no relevance floor, so judge them rather than assuming the " +
        "top hit is good.",
      inputSchema: {
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(48).optional(),
      },
    },
    async ({ query, limit }) => {
      const normalized = normalizeSemanticQuery(query);
      if (!normalized) return fail("Query is empty after normalization.");
      const results = await searchSemanticPalettes(
        env,
        normalized,
        limit ?? DEFAULT_PAGE_LIMIT,
      );
      return json({
        query: normalized,
        count: results.length,
        results: results
          .slice(0, limit ?? DEFAULT_PAGE_LIMIT)
          .map((result) =>
            paletteJson(result.seed, result.style, result.steps, result.angle, origin),
          )
          .filter(Boolean),
      });
    },
  );

  server.registerTool(
    "get_palette",
    {
      description:
        "Read one palette by its seed (the string in a grabient.com URL). Returns " +
        "hex colors, cosine coefficients, global modifiers, CSS and tags. Accepts " +
        "the compact '_'-prefixed seed or 12/16 comma-separated numbers.",
      inputSchema: {
        seed: z.string().min(1),
        style: styleSchema.optional(),
        steps: stepsSchema.optional(),
        angle: angleSchema.optional(),
      },
    },
    async ({ seed, style, steps, angle }) => {
      const payload = paletteJson(
        seed,
        (style as never) ?? DEFAULT_STYLE,
        steps ?? DEFAULT_STEPS,
        angle ?? DEFAULT_ANGLE,
        origin,
      );
      return payload ? json(payload) : fail(`Not a decodable seed: ${seed}`);
    },
  );

  server.registerTool(
    "build_palette",
    {
      description:
        "Build a palette from cosine coefficients. Each RGB channel is " +
        "clamp01(a + b * cos(2*PI*(c*t + d))) sampled at t = i/(steps-1). " +
        "Pass a (offset), b (amplitude), c (frequency), d (phase) as [R,G,B] " +
        "triples. Returns the resulting colors and a permanent URL.",
      inputSchema: {
        a: rgbSchema,
        b: rgbSchema,
        c: rgbSchema,
        d: rgbSchema,
        style: styleSchema.optional(),
        steps: stepsSchema.optional(),
        angle: angleSchema.optional(),
      },
    },
    async ({ a, b, c, d, style, steps, angle }) => {
      try {
        const seed = serializeCoeffs(
          [
            [...a, 1],
            [...b, 1],
            [...c, 1],
            [...d, 1],
          ] as never,
          [0, 1, 1, 0],
        );
        const payload = paletteJson(
          seed,
          (style as never) ?? DEFAULT_STYLE,
          steps ?? DEFAULT_STEPS,
          angle ?? DEFAULT_ANGLE,
          origin,
        );
        return payload ? json(payload) : fail("Coefficients did not produce a palette.");
      } catch (error) {
        return fail(`Invalid coefficients: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "tweak_palette",
    {
      description:
        "Adjust an existing palette without replacing it: exposure brightens, " +
        "contrast deepens saturation, frequency packs more color cycles into the " +
        "ramp, phase rotates hues. Deltas are applied to the palette's current " +
        "modifiers and the result is a new permanent URL.",
      inputSchema: {
        seed: z.string().min(1),
        exposure: z.number().min(-1).max(1).optional(),
        contrast: z.number().min(0).max(2).optional(),
        frequency: z.number().min(0).max(2).optional(),
        phase: z.number().min(-1).max(1).optional(),
        style: styleSchema.optional(),
        steps: stepsSchema.optional(),
        angle: angleSchema.optional(),
      },
    },
    async ({ seed, exposure, contrast, frequency, phase, style, steps, angle }) => {
      try {
        const { coeffs, globals } = deserializeCoeffs(seed);
        // Deltas, not absolutes: "make it brighter" should compose with whatever
        // the palette already carries rather than resetting it.
        const next: [number, number, number, number] = [
          clamp(globals[0] + (exposure ?? 0), -1, 1),
          clamp(globals[1] * (contrast ?? 1), 0, 2),
          clamp(globals[2] * (frequency ?? 1), 0, 2),
          clamp(globals[3] + (phase ?? 0), -1, 1),
        ];
        const payload = paletteJson(
          serializeCoeffs(coeffs, next),
          (style as never) ?? DEFAULT_STYLE,
          steps ?? DEFAULT_STEPS,
          angle ?? DEFAULT_ANGLE,
          origin,
        );
        return payload ? json(payload) : fail("Tweak did not produce a valid palette.");
      } catch (error) {
        return fail(`Could not tweak ${seed}: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "render_png",
    {
      description:
        "Get the URL of a rendered PNG for a palette, at a chosen size (16-2400 " +
        "px per side). The image needs no authentication and is CORS-open, so it " +
        "can be fetched or embedded directly.",
      inputSchema: {
        seed: z.string().min(1),
        width: z.number().int().min(16).max(2400).optional(),
        height: z.number().int().min(16).max(2400).optional(),
        style: styleSchema.optional(),
        steps: stepsSchema.optional(),
        angle: angleSchema.optional(),
      },
    },
    async ({ seed, width, height, style, steps, angle }) => {
      const payload = paletteJson(
        seed,
        (style as never) ?? DEFAULT_STYLE,
        steps ?? DEFAULT_STEPS,
        angle ?? DEFAULT_ANGLE,
        origin,
      );
      if (!payload) return fail(`Not a decodable seed: ${seed}`);
      const url = new URL(payload.png);
      if (width) url.searchParams.set("w", String(width));
      if (height) url.searchParams.set("h", String(height));
      if (style) url.searchParams.set("style", style);
      if (steps) url.searchParams.set("steps", String(steps));
      if (angle) url.searchParams.set("angle", String(angle));
      return json({ png: url.toString(), page: payload.url, hexColors: payload.hexColors });
    },
  );

  return server;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * `allowedHostnames` is mandatory for custom domains: the default allow-list is
 * localhost plus workers.dev, so omitting it passes the staging smoke test and
 * then rejects every request on grabient.com.
 */
export function paletteMcpHandler(
  env: Env,
  origin: string,
  hostname: string,
  viewer: Viewer | null = null,
) {
  return createMcpHandler(() => createPaletteServer(env, origin, viewer), {
    route: "/mcp",
    allowedHostnames: [hostname, "grabient.com", "www.grabient.com"],
  });
}

export { requireAccount };
