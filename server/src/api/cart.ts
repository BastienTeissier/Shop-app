import type { CartSummary } from "@shared/types.js";
import type { Request, Response } from "express";
import { cartGetSummary } from "../db/cart.js";
import { validateCartSession } from "../tools/utils.js";

export type CartSummaryApiResponse = CartSummary & { notFound: boolean };

const NOT_FOUND_CART_FALLBACK: CartSummaryApiResponse = {
	items: [],
	subtotal: 0,
	notFound: true,
};

export async function cartSummaryApiHandler(
	req: Request<{ sessionId: string }>,
	res: Response,
) {
	const { sessionId } = req.params;

	const validation = validateCartSession(sessionId);
	if (!validation.valid) {
		res.status(400).json(NOT_FOUND_CART_FALLBACK);
		return;
	}

	try {
		const summary = await cartGetSummary(sessionId);
		if (!summary) {
			res.json(NOT_FOUND_CART_FALLBACK);
			return;
		}
		res.json({ ...summary, notFound: false });
	} catch {
		res.status(500).json(NOT_FOUND_CART_FALLBACK);
	}
}
