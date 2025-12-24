import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

const turnstileVerifyInputSchema = v.object({
    token: v.pipe(v.string(), v.minLength(1, "Turnstile token is required")),
});

const turnstileResponseSchema = v.object({
    success: v.boolean(),
    challenge_ts: v.optional(v.string()),
    hostname: v.optional(v.string()),
    "error-codes": v.optional(v.array(v.string())),
    action: v.optional(v.string()),
    cdata: v.optional(v.string()),
});

export type TurnstileVerifyResult = {
    success: boolean;
    error?: string;
};

export const verifyTurnstile = createServerFn({ method: "POST" })
    .inputValidator((input) => v.parse(turnstileVerifyInputSchema, input))
    .handler(async (ctx): Promise<TurnstileVerifyResult> => {
        const { token } = ctx.data;
        const env = process.env;

        if (!env.TURNSTILE_SECRET_KEY) {
            console.error("TURNSTILE_SECRET_KEY is not configured");
            return { success: false, error: "Turnstile not configured" };
        }

        const formData = new FormData();
        formData.append("secret", env.TURNSTILE_SECRET_KEY);
        formData.append("response", token);

        try {
            const response = await fetch(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                {
                    method: "POST",
                    body: formData,
                },
            );

            const result = await response.json();
            const parsed = v.safeParse(turnstileResponseSchema, result);

            if (!parsed.success) {
                console.error("Invalid Turnstile response:", result);
                return { success: false, error: "Invalid verification response" };
            }

            if (!parsed.output.success) {
                const errorCode = parsed.output["error-codes"]?.[0] || "unknown";
                console.warn("Turnstile verification failed:", errorCode);
                return { success: false, error: `Verification failed: ${errorCode}` };
            }

            return { success: true };
        } catch (error) {
            console.error("Turnstile verification error:", error);
            return { success: false, error: "Verification request failed" };
        }
    });
