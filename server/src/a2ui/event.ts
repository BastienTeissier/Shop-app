import type { UserAction } from "@shared/a2ui-types.js";
import type { Request, Response } from "express";
import {
	handleAddToCart,
	handleRecommend,
	handleRefine,
	handleSelectProduct,
} from "./handlers/index.js";
import { getSession } from "./session.js";

/**
 * POST endpoint for handling user actions from the A2UI widget.
 */
export async function a2uiEventHandler(
	req: Request,
	res: Response,
): Promise<void> {
	const action = req.body as UserAction;

	if (!action.sessionId || !action.action) {
		res.status(400).json({ error: "Missing sessionId or action" });
		return;
	}

	const session = getSession(action.sessionId);
	if (!session) {
		res.status(404).json({ error: "Session not found" });
		return;
	}

	try {
		switch (action.action) {
			case "search":
				// Uses LLM-powered recommendations instead of simple search
				await handleRecommend(action.sessionId, action.payload.query as string);
				break;

			case "selectProduct":
				await handleSelectProduct(
					action.sessionId,
					action.payload.productId as number,
				);
				break;

			case "addToCart":
				await handleAddToCart(
					action.sessionId,
					action.payload.productId as number,
				);
				break;

			case "refine":
				await handleRefine(action.sessionId, action.payload.query as string);
				break;

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
