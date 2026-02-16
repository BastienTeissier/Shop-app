import type { Product } from "@shared/types.js";
import { tool } from "ai";
import { z } from "zod";

const productSchema = z.object({
	id: z.number(),
	title: z.string(),
	description: z.string(),
	price: z.number().describe("Price in cents"),
	imageUrl: z.string(),
	category: z.string().nullable().optional(),
});

/**
 * Agent tool for ranking and filtering products based on user preferences.
 * Scores products by budget constraints and preference matching.
 */
export const rankProductsTool = tool({
	description:
		"Rank and filter products based on user preferences like budget and features. Returns scored products sorted by relevance.",
	inputSchema: z.object({
		products: z.array(productSchema).describe("Array of products to rank"),
		budget: z
			.number()
			.optional()
			.describe("Maximum price in cents (e.g., 10000 for $100)"),
		preferences: z
			.array(z.string())
			.optional()
			.describe(
				"User preferences/features to match (e.g., 'lightweight', 'beginner')",
			),
	}),
	execute: async ({
		products,
		budget,
		preferences,
	}: {
		products: Product[];
		budget?: number;
		preferences?: string[];
	}) => {
		let filtered = products;

		// Filter by budget if specified
		if (budget !== undefined) {
			filtered = filtered.filter((p) => p.price <= budget);
		}

		// Score by preference matching
		const scored = filtered.map((p) => {
			let score = 0;
			const matchedPreferences: string[] = [];

			if (preferences && preferences.length > 0) {
				for (const pref of preferences) {
					const lower = pref.toLowerCase();
					const titleLower = p.title.toLowerCase();
					const descLower = p.description.toLowerCase();

					if (titleLower.includes(lower) || descLower.includes(lower)) {
						score += 10;
						matchedPreferences.push(pref);
					}
				}
			}

			return {
				...p,
				score,
				matchedPreferences,
			};
		});

		// Sort by score descending, then by price ascending for ties
		return scored.sort((a, b) => {
			if (b.score !== a.score) {
				return b.score - a.score;
			}
			return a.price - b.price;
		});
	},
});
