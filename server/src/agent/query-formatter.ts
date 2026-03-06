import { generateObject } from "ai";

import { getRecommendationModel } from "./openrouter-provider.js";
import { type FormattedQuery, FormattedQuerySchema } from "./schemas/index.js";

const SYSTEM_PROMPT = `You are a query formatter for a sports equipment store recommendation engine.

Your job is to normalize natural language queries into structured, optimized inputs.

Available product categories: ski, hiking, running, beach, cycling, apparel, accessories, electronics

Instructions:
1. Clean up the user query into a clear normalizedQuery
2. Expand abbreviations and slang (e.g., "kicks" → shoes, "shades" → sunglasses)
3. Infer relevant categories from the available list above
4. Infer constraints when mentioned or implied (gender, budget, activity, size, season)
5. Produce a formattedQueryForRecommender that is an optimized, expanded search string for the recommendation agent

Examples:
- "something for the beach" → categories: ["beach", "apparel", "accessories"], formattedQueryForRecommender: "beach essentials including swimwear, sunglasses, sandals, and sun protection gear"
- "ski trip under $500" → categories: ["ski"], constraints: { budgetMax: 50000, activity: "skiing", season: "winter" }, formattedQueryForRecommender: "skiing equipment and apparel for a ski trip, budget under $500 including jacket, boots, goggles, and accessories"
- "running gear for women" → categories: ["running", "apparel"], constraints: { gender: "female", activity: "running" }, formattedQueryForRecommender: "women's running gear including shoes, clothing, and accessories for female runners"`;

/**
 * Run the query formatter to normalize a natural language query into structured input.
 * Uses generateObject() for structured output — no tools, stateless.
 */
export async function runQueryFormatter(
	query: string,
	options?: { abortSignal?: AbortSignal },
): Promise<FormattedQuery> {
	const model = getRecommendationModel();

	const result = await generateObject({
		model,
		schema: FormattedQuerySchema,
		system: SYSTEM_PROMPT,
		prompt: `User query: "${query}"`,
		abortSignal: options?.abortSignal,
	});

	return result.object;
}
