import type { ProductTier } from "@shared/a2ui-types.js";
import { generateText, stepCountIs } from "ai";
import { getRecommendationModel } from "./openrouter-provider.js";
import { rankProductsTool, searchProductsTool } from "./tools/index.js";

const SYSTEM_PROMPT = `You are a helpful product recommendation assistant for a sports equipment store.

Your job is to:
1. Understand the user's needs from their natural language query
2. Identify relevant product categories based on the activity (e.g., "skiing" → categories: ["ski"], "hiking trip" → categories: ["hiking", "apparel"])
3. Search for relevant products using the search_products tool with categories and/or keywords
4. Optionally rank and filter products based on their preferences using the rank_products tool
5. Assign a tier to each product based on activity relevance:
   - "essential": Must-have items for the activity
   - "recommended": Helpful items that enhance the experience
   - "optional": Nice-to-have items
6. Return recommendations with personalized explanations

Available product categories: ski, hiking, running, beach, cycling, apparel, accessories, electronics

For each recommended product, provide:
- tier: The importance tier ("essential", "recommended", or "optional")
- highlights: Key features that match the user's needs (array of 1-3 short strings)
- reasonWhy: Why this product is recommended for them (array of 1-2 short sentences)

Always be helpful and focus on matching products to the user's actual needs.
If the user mentions a budget, convert it to cents (e.g., $100 = 10000 cents) for the rank_products tool.`;

/**
 * Result from the recommendation agent.
 */
export interface RecommendationResult {
	products: Array<{
		id: number;
		title: string;
		description: string;
		imageUrl: string;
		price: number;
		highlights: string[];
		reasonWhy: string[];
		tier?: ProductTier;
	}>;
	summary: string;
}

/**
 * Context for refining recommendations.
 */
export interface RefinementContext {
	previousQuery: string;
	previousProducts: RecommendationResult["products"];
}

/**
 * Run the recommendation agent with the given user query.
 * Uses Gemini to understand the query, search products, and generate explanations.
 */
export async function runRecommendationAgent(
	query: string,
	refinementContext?: RefinementContext,
): Promise<RecommendationResult> {
	const model = getRecommendationModel();

	let userPrompt = `User query: "${query}"

Please search for products using categories when appropriate, optionally rank them based on the user's needs, and provide recommendations with personalized highlights, reasons, and tier assignment.

Return your final response as JSON in this exact format (no markdown code blocks, just the raw JSON):
{
  "products": [
    {
      "id": <number>,
      "title": "<string>",
      "description": "<string>",
      "imageUrl": "<string>",
      "price": <number>,
      "tier": "essential" | "recommended" | "optional",
      "highlights": ["<string>", ...],
      "reasonWhy": ["<string>", ...]
    }
  ],
  "summary": "<brief summary of recommendations>"
}`;

	if (refinementContext) {
		userPrompt = `Previous query: "${refinementContext.previousQuery}"
Previous recommendations (IDs): [${refinementContext.previousProducts.map((p) => p.id).join(", ")}]

Refinement request: "${query}"

The user wants to refine their previous recommendations. Please adjust the recommendations based on their feedback.
- If they want to exclude items, remove products matching their description
- If they mention a budget constraint, filter to products under that price (convert to cents: $100 = 10000)
- If they want different options, search for alternatives

Return your final response as JSON in this exact format (no markdown code blocks, just the raw JSON):
{
  "products": [
    {
      "id": <number>,
      "title": "<string>",
      "description": "<string>",
      "imageUrl": "<string>",
      "price": <number>,
      "tier": "essential" | "recommended" | "optional",
      "highlights": ["<string>", ...],
      "reasonWhy": ["<string>", ...]
    }
  ],
  "summary": "<brief summary of refined recommendations>"
}`;
	}

	const result = await generateText({
		model,
		system: SYSTEM_PROMPT,
		tools: {
			search_products: searchProductsTool,
			rank_products: rankProductsTool,
		},
		stopWhen: stepCountIs(5), // Allow up to 5 tool call steps
		prompt: userPrompt,
	});

	// Parse the agent's response
	try {
		// Try to find JSON in the response (might be wrapped in markdown code blocks)
		let jsonStr = result.text;

		// Remove markdown code blocks if present
		const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (codeBlockMatch) {
			jsonStr = codeBlockMatch[1].trim();
		}

		// Find the JSON object
		const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]) as RecommendationResult;

			// Validate the structure
			if (Array.isArray(parsed.products)) {
				return {
					products: parsed.products.map((p) => ({
						id: p.id,
						title: p.title || "",
						description: p.description || "",
						imageUrl: p.imageUrl || "",
						price: p.price || 0,
						highlights: Array.isArray(p.highlights) ? p.highlights : [],
						reasonWhy: Array.isArray(p.reasonWhy) ? p.reasonWhy : [],
						tier: isValidTier(p.tier) ? p.tier : undefined,
					})),
					summary: parsed.summary || "Here are your recommendations.",
				};
			}
		}
	} catch (error) {
		console.error("Failed to parse agent response:", error);
		console.error("Raw response:", result.text);
	}

	return { products: [], summary: "No recommendations found." };
}

function isValidTier(tier: unknown): tier is ProductTier {
	return tier === "essential" || tier === "recommended" || tier === "optional";
}
