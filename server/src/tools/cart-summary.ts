import { z } from "zod";
import {
	type CartSummary,
	cartGetBySessionId,
	cartGetSummary,
} from "../db/cart.js";
import {
	ERRORS,
	errorResponse,
	successResponse,
	validateCartSession,
} from "./utils.js";

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

type CartSummaryData = {
	sessionId: string;
	items: CartSummary["items"];
	subtotal: number;
};

const emptyCartSummary = (sessionId: string): CartSummaryData => ({
	sessionId,
	items: [],
	subtotal: 0,
});

export async function cartSummaryHandler({ sessionId }: { sessionId: string }) {
	const validation = validateCartSession(sessionId);
	if (!validation.valid) {
		return errorResponse(
			ERRORS.INVALID_CART_SESSION,
			emptyCartSummary(sessionId),
		);
	}

	const cart = await cartGetBySessionId(sessionId);
	if (!cart) {
		return errorResponse(
			ERRORS.INVALID_CART_SESSION,
			emptyCartSummary(sessionId),
		);
	}

	const summary = await cartGetSummary(sessionId);
	if (!summary) {
		return errorResponse(
			ERRORS.INVALID_CART_SESSION,
			emptyCartSummary(sessionId),
		);
	}

	return successResponse({
		sessionId,
		items: summary.items,
		subtotal: summary.subtotal,
	});
}
