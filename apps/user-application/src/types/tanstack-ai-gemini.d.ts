import "@tanstack/ai-gemini";

declare module "@tanstack/ai-gemini" {
    interface GeminiAdapterConfig {
        generationConfig?: {
            maxOutputTokens?: number;
            temperature?: number;
            topP?: number;
            topK?: number;
            stopSequences?: string[];
        };
    }
}
