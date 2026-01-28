import { z } from "zod";
import {
	type CartSummary,
	cartGetBySessionId,
	cartGetSummary,
} from "../db/cart.js";
import { textContent, validateCartSession } from "./utils.js";

export const cartSummaryOptions = {
	description: "Cart summary widget",
	_meta: {
		ui: {
			csp: {
				resourceDomains: ["https://fakestoreapi.com"],
			},
		},
	},
};

export const cartSummaryToolOptions = {
	description: "Display a read-only summary of the cart contents.",
	inputSchema: {
		sessionId: z.string().describe("Anonymous cart session ID (UUID)"),
	},
};

export async function cartSummaryHandler({ sessionId }: { sessionId: string }) {
	const validation = validateCartSession(sessionId);
	if (!validation.valid) {
		return {
			structuredContent: { sessionId, items: [], subtotal: 0 },
			content: textContent("Invalid cart session"),
			isError: true,
		};
	}

	const cart = await cartGetBySessionId(sessionId);
	if (!cart) {
		return {
			structuredContent: { sessionId, items: [], subtotal: 0 },
			content: textContent("Invalid cart session"),
			isError: true,
		};
	}

	const summary: CartSummary = await cartGetSummary(sessionId);

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
}
