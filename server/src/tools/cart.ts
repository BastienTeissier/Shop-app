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
	ERRORS,
	emptyCartSnapshot,
	errorResponse,
	successResponse,
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

type CartResponseData = {
	sessionId: string | undefined;
	cart: CartSnapshot;
};

const invalidSessionData: CartResponseData = {
	sessionId: undefined,
	cart: emptyCartSnapshot,
};

export async function cartHandler({ action, productId, sessionId }: CartInput) {
	let resolvedSessionId = sessionId;
	try {
		if (sessionId) {
			const validation = validateCartSession(sessionId);
			if (!validation.valid) {
				return errorResponse(ERRORS.INVALID_CART_SESSION, invalidSessionData);
			}
		}

		let cart = null;

		if (sessionId) {
			cart = await cartGetBySessionId(sessionId);
			if (!cart) {
				return errorResponse(ERRORS.INVALID_CART_SESSION, invalidSessionData);
			}
		} else {
			resolvedSessionId = randomUUID();
			try {
				cart = await cartCreate(resolvedSessionId);
			} catch (error) {
				return errorResponse(`Error: ${error}`, {
					sessionId: resolvedSessionId,
					cart: emptyCartSnapshot,
				});
			}
		}

		if (!cart) {
			return errorResponse(ERRORS.INVALID_CART_SESSION, invalidSessionData);
		}

		let cartSnapshot: CartSnapshot;
		if (action === "add") {
			cartSnapshot = await cartAddItem(cart.id, productId);
		} else {
			cartSnapshot = await cartRemoveItem(cart.id, productId);
		}

		return successResponse({
			sessionId: resolvedSessionId,
			cart: cartSnapshot,
		});
	} catch (error) {
		return errorResponse(`Error: ${error}`, {
			sessionId: resolvedSessionId,
			cart: emptyCartSnapshot,
		});
	}
}
