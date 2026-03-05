import { z } from "zod";

export const FormattedQuerySchema = z.object({
	normalizedQuery: z.string().describe("Cleaned-up user intent"),
	inferredCategories: z
		.array(z.string())
		.default([])
		.describe("Mapped to catalog categories"),
	constraints: z
		.object({
			gender: z.string().optional().describe("Inferred gender preference"),
			budgetMax: z.number().optional().describe("Maximum budget in cents"),
			budgetMin: z.number().optional().describe("Minimum budget in cents"),
			activity: z.string().optional().describe("Primary activity"),
			size: z.string().optional().describe("Size preference"),
			season: z.string().optional().describe("Season preference"),
		})
		.describe("Inferred constraints from the query"),
	formattedQueryForRecommender: z
		.string()
		.describe("Optimized prompt string for the recommendation agent"),
});

export type FormattedQuery = z.infer<typeof FormattedQuerySchema>;
