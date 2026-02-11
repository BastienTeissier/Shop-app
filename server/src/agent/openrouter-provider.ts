import { createOpenRouter } from "@openrouter/ai-sdk-provider";

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
 * Get the recommendation model via OpenRouter.
 * Using GPT-4o-mini through OpenRouter for good price/performance.
 */
export function getRecommendationModel() {
	const openrouter = createOpenRouterProvider();
	return openrouter("openai/gpt-4o-mini");
}
