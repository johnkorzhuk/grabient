import { createOpenAI } from "@tanstack/ai-openai";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export const KIMI_K2_MODEL = "moonshotai/kimi-k2-instruct";

export interface GroqConfig {
    apiKey: string;
}

export function createGroqAdapter(config: GroqConfig) {
    return createOpenAI(config.apiKey, {
        baseURL: GROQ_BASE_URL,
    });
}
