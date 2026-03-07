import { generateObject } from "ai";

import { getRecommendationModel } from "./openrouter-provider.js";
import type { RecommendationResult } from "./recommendation-agent.js";
import type { FormattedQuery } from "./schemas/index.js";
import { type Suggestions, SuggestionsSchema } from "./schemas/index.js";

const SYSTEM_PROMPT = `You are a suggestion chip generator for a sports equipment store.

Given a user's search query and a summary of the products found, generate suggestion chips that help the user refine their search.

Produce two kinds of chips:

1. **Constrained chips** — pick from a fixed vocabulary when relevant to the returned products:
   - gender: "Men", "Women", "Unisex" — only if products span multiple genders
   - priceRange: "Under $50", "Under $100", "$100–$200", "Over $200" — buckets based on actual price distribution
   - size: meaningful size filters — only if sizing is relevant to the product type

2. **Dynamic chips** (2–3 max) — AI-generated suggestions based on query context and returned products:
   - material (e.g., "Gore-Tex", "Merino Wool")
   - activity (e.g., "Trail Running", "Backcountry")
   - brand (e.g., a dominant brand in results)
   - color, season, feature, or other relevant refinements

Rules:
- Total chips ≤ 8
- Only include constrained chips when they meaningfully narrow results
- Dynamic chips should reflect patterns in the actual products, not generic suggestions
- Keep labels short (1–3 words)
- Do not repeat information already in the query`;

export type ProductSummary = {
	titles: string[];
	prices: number[];
	tiers: string[];
	subCategories: string[];
};

export function buildProductSummary(
	products: RecommendationResult["products"],
): ProductSummary {
	return {
		titles: products.map((p) => p.title),
		prices: products.map((p) => p.price / 100),
		tiers: [
			...new Set(products.map((p) => p.tier).filter(Boolean)),
		] as string[],
		subCategories: [
			...new Set(products.map((p) => p.subCategory).filter(Boolean)),
		] as string[],
	};
}

/**
 * Run the refinement agent to generate suggestion chips.
 * Uses generateObject() for structured output — no tools, stateless.
 */
export async function runRefinementAgent(
	formattedQuery: FormattedQuery,
	productSummary: ProductSummary,
	options?: { abortSignal?: AbortSignal },
): Promise<Suggestions> {
	const model = getRecommendationModel();

	const result = await generateObject({
		model,
		schema: SuggestionsSchema,
		system: SYSTEM_PROMPT,
		prompt: `Search query: "${formattedQuery.normalizedQuery}"
Categories: ${formattedQuery.inferredCategories.join(", ") || "none"}
Constraints: ${JSON.stringify(formattedQuery.constraints)}

Products found:
- Titles: ${productSummary.titles.join(", ")}
- Prices: ${productSummary.prices.map((p) => `$${p}`).join(", ")}
- Tiers: ${productSummary.tiers.join(", ") || "none"}
- Sub-categories: ${productSummary.subCategories.join(", ") || "none"}`,
		abortSignal: options?.abortSignal,
	});

	return result.object;
}
