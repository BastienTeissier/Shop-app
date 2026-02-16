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
		res.status(400).json({ items: [], subtotal: 0, notFound: true });
		return;
	}

	try {
		const summary = await cartGetSummary(sessionId);
		res.json(summary);
	} catch {
		res.status(500).json({ items: [], subtotal: 0, notFound: true });
	}
}
