import { z } from "zod";
import { productList } from "../db/products.js";
import { textContent } from "./utils.js";

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

		return {
			structuredContent: { products: filtered },
			content: textContent(JSON.stringify(filtered)),
			isError: false,
		};
	} catch (error) {
		return {
			content: textContent(`Error: ${error}`),
			isError: true,
		};
	}
}
