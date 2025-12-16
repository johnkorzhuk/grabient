// Available models configuration - shared between client and server
// All models rated 3+ stars for palette generation task

export const AVAILABLE_MODELS = {
    // ===== TIER 4: SWEET SPOT ($0.31-$0.50/M) - 5 stars =====
    "gemini-2.5-flash-lite": {
        id: "google/gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite ($0.40)",
        provider: "openrouter" as const,
    },
    // ===== GROQ MODELS (Direct - uses streamText with manual parsing, no json_schema support) =====
    "llama-3.3-70b-groq": {
        id: "llama-3.3-70b-versatile",
        name: "🚀 Llama 3.3 70B (Groq)",
        provider: "groq" as const,
    },
    "llama-4-scout-groq": {
        id: "meta-llama/llama-4-scout-17b-16e-instruct",
        name: "🚀 Llama 4 Scout (Groq)",
        provider: "groq" as const,
    },
    "llama-4-maverick-groq": {
        id: "meta-llama/llama-4-maverick-17b-128e-instruct",
        name: "🚀 Llama 4 Maverick (Groq)",
        provider: "groq" as const,
    },
    "kimi-k2-groq": {
        id: "moonshotai/kimi-k2-instruct-0905",
        name: "🚀 Kimi K2 (Groq)",
        provider: "groq" as const,
    },
    // ===== OPENAI (Direct) =====
    "gpt-4.1-nano": {
        id: "gpt-4.1-nano",
        name: "GPT-4.1 Nano (OpenAI)",
        provider: "openai" as const,
    },
    // ===== GOOGLE GENERATIVE AI (Direct) =====
    "gemini-2.0-flash-google": {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash (Google Direct)",
        provider: "google" as const,
    },
} as const;

export type ModelKey = keyof typeof AVAILABLE_MODELS;
export type Provider = typeof AVAILABLE_MODELS[ModelKey]["provider"];

export const DEFAULT_MODEL: ModelKey = "gemini-2.0-flash-google";
