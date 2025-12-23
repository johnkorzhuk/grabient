// Server function for palette generation (auth-protected)
// This file is kept minimal to avoid importing server-only modules on the client

import { createServerFn } from "@tanstack/react-start";
import { adminFunctionMiddleware } from "@/core/middleware/auth";
import * as v from "valibot";
import { paletteStyleValidator } from "@repo/data-ops/valibot-schema/grabient";

export type { GenerateEvent, GenerateRequest } from "./generate-v6";

const generateRequestSchema = v.object({
    query: v.string(),
    sessionId: v.optional(v.string()),
    style: v.optional(v.union([v.literal("auto"), paletteStyleValidator])),
    steps: v.optional(v.union([v.literal("auto"), v.number()])),
    angle: v.optional(v.union([v.literal("auto"), v.number()])),
});

export const generatePalettes = createServerFn({ method: "POST" })
    .middleware([adminFunctionMiddleware])
    .inputValidator((input) => v.parse(generateRequestSchema, input))
    .handler(async (ctx) => {
        // Dynamic import to avoid bundling cloudflare:workers on client
        const { generatePalettesSSE } = await import("./generate-v6");
        const userId = ctx.context.userId;
        return generatePalettesSSE(ctx.data, userId);
    });
