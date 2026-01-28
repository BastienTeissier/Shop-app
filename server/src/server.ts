import { randomUUID } from "node:crypto";
import { McpServer } from "skybridge/server";
import { z } from "zod";
import {
	addToCart,
	type CartSnapshot,
	type CartSummary,
	createCart,
	getCartBySessionId,
	getCartSummary,
	listProducts,
	removeFromCart,
} from "./db.js";

const cartSessionSchema = z.string().uuid();
const emptyCartSnapshot: CartSnapshot = {
	items: [],
	totalQuantity: 0,
	totalPrice: 0,
};
const textContent = (text: string) => [{ type: "text" as const, text }];

const invalidCartSessionResponse = {
	structuredContent: { sessionId: undefined, cart: emptyCartSnapshot },
	content: textContent("Invalid cart session"),
	isError: true,
};

const server = new McpServer(
	{
		name: "ecom-carousel-app",
		version: "0.0.1",
	},
	{ capabilities: {} },
)
	.registerWidget(
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
					content: textContent(JSON.stringify(filtered)),
					isError: false,
				};
			} catch (error) {
				return {
					content: textContent(`Error: ${error}`),
					isError: true,
				};
			}
		},
	)
	.registerWidget(
		"cart",
		{
			description: "Cart mutation tool",
		},
		{
			description: "Add or remove items from an anonymous cart session.",
			inputSchema: {
				action: z.enum(["add", "remove"]).describe("Cart mutation action"),
				productId: z.number().int().positive().describe("Product ID"),
				sessionId: z
					.string()
					.optional()
					.describe("Anonymous cart session ID (UUID)"),
			},
		},
		async ({ action, productId, sessionId }) => {
			let resolvedSessionId = sessionId;
			try {
				if (sessionId) {
					const validated = cartSessionSchema.safeParse(sessionId);
					if (!validated.success) {
						return invalidCartSessionResponse;
					}
				}

				let cart = null;

				if (sessionId) {
					cart = await getCartBySessionId(sessionId);
					if (!cart) {
						return invalidCartSessionResponse;
					}
				} else {
					resolvedSessionId = randomUUID();
					try {
						cart = await createCart(resolvedSessionId);
					} catch (error) {
						return {
							structuredContent: {
								sessionId: resolvedSessionId,
								cart: emptyCartSnapshot,
							},
							content: textContent(`Error: ${error}`),
							isError: true,
						};
					}
				}

				if (!cart) {
					return invalidCartSessionResponse;
				}

				let cartSnapshot: CartSnapshot;
				if (action === "add") {
					cartSnapshot = await addToCart(cart.id, productId);
				} else {
					cartSnapshot = await removeFromCart(cart.id, productId);
				}

				return {
					structuredContent: {
						sessionId: resolvedSessionId,
						cart: cartSnapshot,
					},
					content: textContent(
						JSON.stringify({
							sessionId: resolvedSessionId,
							cart: cartSnapshot,
						}),
					),
					isError: false,
				};
			} catch (error) {
				return {
					structuredContent: {
						sessionId: resolvedSessionId,
						cart: emptyCartSnapshot,
					},
					content: textContent(`Error: ${error}`),
					isError: true,
				};
			}
		},
	)
	.registerWidget(
		"cart-summary",
		{
			description: "Cart summary widget",
			_meta: {
				ui: {
					csp: {
						resourceDomains: ["https://fakestoreapi.com"],
					},
				},
			},
		},
		{
			description: "Display a read-only summary of the cart contents.",
			inputSchema: {
				sessionId: z.string().describe("Anonymous cart session ID (UUID)"),
			},
		},
		async ({ sessionId }) => {
			const validated = cartSessionSchema.safeParse(sessionId);
			if (!validated.success) {
				return {
					structuredContent: { sessionId, items: [], subtotal: 0 },
					content: textContent("Invalid cart session"),
					isError: true,
				};
			}

			const cart = await getCartBySessionId(sessionId);
			if (!cart) {
				return {
					structuredContent: { sessionId, items: [], subtotal: 0 },
					content: textContent("Invalid cart session"),
					isError: true,
				};
			}

			const summary: CartSummary = await getCartSummary(sessionId);

			return {
				structuredContent: {
					sessionId,
					items: summary.items,
					subtotal: summary.subtotal,
				},
				content: textContent(
					JSON.stringify({
						sessionId,
						items: summary.items,
						subtotal: summary.subtotal,
					}),
				),
				isError: false,
			};
		},
	);

export default server;
export type AppType = typeof server;
