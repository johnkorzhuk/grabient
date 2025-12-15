// Available models configuration - shared between client and server

export const AVAILABLE_MODELS = {
    "groq-oss-120b": {
        id: "openai/gpt-oss-120b",
        name: "Groq OSS 120B",
        provider: "groq" as const,
    },
    "gemini-2.0-flash-lite": {
        id: "gemini-2.0-flash-lite",
        name: "Gemini 2.0 Flash Lite",
        provider: "gemini" as const,
    },
    "gemini-2.5-flash-lite": {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite",
        provider: "gemini" as const,
    },
    "gemini-2.0-flash": {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        provider: "gemini" as const,
    },
} as const;

export type ModelKey = keyof typeof AVAILABLE_MODELS;

export const DEFAULT_MODEL: ModelKey = "groq-oss-120b";

// Type helpers for extracting model IDs by provider
type GeminiModelKeys = {
    [K in ModelKey]: typeof AVAILABLE_MODELS[K]["provider"] extends "gemini" ? K : never
}[ModelKey];

export type GeminiModelId = typeof AVAILABLE_MODELS[GeminiModelKeys]["id"];

// Type guard to check if a model config is for Gemini
export function isGeminiModel(config: typeof AVAILABLE_MODELS[ModelKey]): config is typeof AVAILABLE_MODELS[GeminiModelKeys] {
    return config.provider === "gemini";
}
