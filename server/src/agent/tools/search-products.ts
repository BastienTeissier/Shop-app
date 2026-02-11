import { tool } from "ai";
import { z } from "zod";
import type { Product } from "../../db/products.js";
import { productList, productListByCategories } from "../../db/products.js";

/**
 * Agent tool for searching products by keyword query and/or categories.
 * Wraps the existing productList() and productListByCategories() functions from the database layer.
 */
export const searchProductsTool = tool({
	description:
		"Search for products in the sports equipment store by keyword query and/or categories. Returns matching products with their details.",
	inputSchema: z.object({
		query: z
			.string()
			.optional()
			.describe(
				"Search keywords to find products (optional if categories provided)",
			),
		categories: z
			.array(z.string())
			.optional()
			.describe(
				"Product categories to filter by (e.g., ['ski', 'hiking', 'running', 'beach', 'cycling', 'apparel', 'accessories', 'electronics'])",
			),
		limit: z
			.number()
			.optional()
			.default(20)
			.describe("Maximum number of results to return"),
	}),
	execute: async ({
		query,
		categories,
		limit,
	}: {
		query?: string;
		categories?: string[];
		limit: number;
	}) => {
		let products: Product[];

		if (categories && categories.length > 0) {
			products = await productListByCategories(categories, limit);
			console.info(
				`searchProductsTool: found ${products.length} products for categories [${categories.join(", ")}]`,
			);
		} else if (query) {
			products = await productList(query, limit);
			console.info(
				`searchProductsTool: found ${products.length} products for query "${query}"`,
			);
		} else {
			console.info("searchProductsTool: no query or categories provided");
			return [];
		}

		return products.map((p) => ({
			id: p.id,
			title: p.title,
			description: p.description,
			price: p.price,
			imageUrl: p.imageUrl,
			category: p.category,
		}));
	},
});
