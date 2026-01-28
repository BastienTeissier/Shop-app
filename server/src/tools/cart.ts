import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
	type CartSnapshot,
	cartAddItem,
	cartCreate,
	cartGetBySessionId,
	cartRemoveItem,
} from "../db/cart.js";
import {
	emptyCartSnapshot,
	textContent,
	validateCartSession,
} from "./utils.js";

export const cartOptions = {
	description: "Cart mutation tool",
};

export const cartToolOptions = {
	description: "Add or remove items from an anonymous cart session.",
	inputSchema: {
		action: z.enum(["add", "remove"]).describe("Cart mutation action"),
		productId: z.number().int().positive().describe("Product ID"),
		sessionId: z
			.string()
			.optional()
			.describe("Anonymous cart session ID (UUID)"),
	},
};

type CartInput = {
	action: "add" | "remove";
	productId: number;
	sessionId?: string;
};

const invalidCartSessionResponse = {
	structuredContent: { sessionId: undefined, cart: emptyCartSnapshot },
	content: textContent("Invalid cart session"),
	isError: true,
};

export async function cartHandler({ action, productId, sessionId }: CartInput) {
	let resolvedSessionId = sessionId;
	try {
		if (sessionId) {
			const validation = validateCartSession(sessionId);
			if (!validation.valid) {
				return invalidCartSessionResponse;
			}
		}

		let cart = null;

		if (sessionId) {
			cart = await cartGetBySessionId(sessionId);
			if (!cart) {
				return invalidCartSessionResponse;
			}
		} else {
			resolvedSessionId = randomUUID();
			try {
				cart = await cartCreate(resolvedSessionId);
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
			cartSnapshot = await cartAddItem(cart.id, productId);
		} else {
			cartSnapshot = await cartRemoveItem(cart.id, productId);
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
}
