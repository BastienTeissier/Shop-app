import { McpServer } from "skybridge/server";
import { z } from "zod";
import { listProducts } from "./db.js";

const server = new McpServer(
	{
		name: "ecom-carousel-app",
		version: "0.0.1",
	},
	{ capabilities: {} },
).registerWidget(
	"ecom-carousel",
	{
		description: "E-commerce Product Carousel",
		_meta: {
			ui: {
				csp: {
					resourceDomains: ["https://fakestoreapi.com"],
				},
			},
		},
	},
	{
		description: "Display a carousel of products from the store.",
		inputSchema: {
			query: z.string().describe("Search query for products"),
		},
	},
	async ({ query }) => {
		try {
			const filtered = await listProducts(query);

			return {
				structuredContent: { products: filtered },
				content: [{ type: "text", text: JSON.stringify(filtered) }],
				isError: false,
			};
		} catch (error) {
			return {
				content: [{ type: "text", text: `Error: ${error}` }],
				isError: true,
			};
		}
	},
);

export default server;
export type AppType = typeof server;
