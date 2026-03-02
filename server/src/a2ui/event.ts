import type { Request, Response } from "express";
import { z } from "zod";

import {
	handleAddToCart,
	handleRecommend,
	handleRefine,
	handleSelectProduct,
} from "./handlers/index.js";
import { getSession } from "./session.js";

const userActionSchema = z.object({
	sessionId: z.string().min(1),
	action: z.string().min(1),
	payload: z.record(z.string(), z.unknown()).default({}),
});

/**
 * POST endpoint for handling user actions from the A2UI widget.
 */
export async function a2uiEventHandler(
	req: Request,
	res: Response,
): Promise<void> {
	const parsed = userActionSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: "Invalid request body" });
		return;
	}
	const action = parsed.data;

	const session = getSession(action.sessionId);
	if (!session) {
		res.status(404).json({ error: "Session not found" });
		return;
	}

	try {
		switch (action.action) {
			case "search": {
				const query = z.string().safeParse(action.payload.query);
				if (!query.success) {
					res.status(400).json({ error: "Missing or invalid query" });
					return;
				}
				await handleRecommend(action.sessionId, query.data);
				break;
			}

			case "selectProduct": {
				const productId = z.number().safeParse(action.payload.productId);
				if (!productId.success) {
					res.status(400).json({ error: "Missing or invalid productId" });
					return;
				}
				await handleSelectProduct(action.sessionId, productId.data);
				break;
			}

			case "addToCart": {
				const productId = z.number().safeParse(action.payload.productId);
				if (!productId.success) {
					res.status(400).json({ error: "Missing or invalid productId" });
					return;
				}
				await handleAddToCart(action.sessionId, productId.data);
				break;
			}

			case "refine": {
				const query = z.string().safeParse(action.payload.query);
				if (!query.success) {
					res.status(400).json({ error: "Missing or invalid query" });
					return;
				}
				await handleRefine(action.sessionId, query.data);
				break;
			}

			default:
				res.status(400).json({ error: `Unknown action: ${action.action}` });
				return;
		}

		res.json({ success: true });
	} catch (error) {
		console.error(`Error handling action ${action.action}:`, error);
		res.status(500).json({ error: "Internal server error" });
	}
}
