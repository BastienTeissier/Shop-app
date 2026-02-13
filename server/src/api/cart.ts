import type { Request, Response } from "express";
import { cartGetSummary } from "../db/cart.js";
import { validateCartSession } from "../tools/utils.js";

export async function cartSummaryApiHandler(
	req: Request<{ sessionId: string }>,
	res: Response,
) {
	const { sessionId } = req.params;

	const validation = validateCartSession(sessionId);
	if (!validation.valid) {
		res.json({ items: [], subtotal: 0, notFound: true });
		return;
	}

	const summary = await cartGetSummary(sessionId);
	res.json(summary);
}
