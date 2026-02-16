import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider-v2";

/**
 * Create a configured OpenRouter provider.
 */
export function createOpenRouterProvider() {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error("OPENROUTER_API_KEY is required");
	}
	return createOpenRouter({ apiKey });
}

/**
 * Get the recommendation model.
 * When USE_LOCAL_MODEL=true, uses Devstral via local Ollama.
 * Otherwise, uses GPT-4o-mini through OpenRouter.
 */
export function getRecommendationModel(): LanguageModelV3 {
	if (process.env.USE_LOCAL_MODEL === "true") {
		const ollama = createOllama({
			baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/api",
		});
		return ollama(process.env.LOCAL_MODEL_NAME ?? "devstral-small-2:latest");
	}

	const openrouter = createOpenRouterProvider();
	return openrouter("openai/gpt-4o-mini");
}
