import { z } from "zod";

import { productList } from "../db/products.js";
import { errorResponse, successResponse } from "./utils.js";

export const ecomCarouselOptions = {
	description: "E-commerce Product Carousel",
	_meta: {
		ui: {
			csp: {
				resourceDomains: ["https://fakestoreapi.com"],
			},
		},
	},
};

export const ecomCarouselToolOptions = {
	description: "Display a carousel of products from the store.",
	inputSchema: {
		query: z.string().describe("Search query for products"),
	},
};

export async function ecomCarouselHandler({ query }: { query: string }) {
	try {
		const filtered = await productList(query);
		return successResponse({ products: filtered });
	} catch (error) {
		return errorResponse(`Error: ${error}`);
	}
}
