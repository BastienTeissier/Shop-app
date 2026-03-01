import type { CartSummaryApiResponse } from "@shared/types.js";
import type { Request, Response } from "express";
import { z } from "zod";
import {
	cartAddItem,
	cartGetBySessionId,
	cartGetSummary,
	cartRemoveItem,
	cartSetItemQuantity,
} from "../db/cart.js";
import { validateCartSession } from "../tools/utils.js";

const CART_NOT_FOUND: CartSummaryApiResponse = {
	items: [],
	subtotal: 0,
	notFound: true,
};

const BAD_REQUEST: CartSummaryApiResponse = {
	items: [],
	subtotal: 0,
	notFound: false,
	error: "bad_request",
};

const INTERNAL_ERROR: CartSummaryApiResponse = {
	items: [],
	subtotal: 0,
	notFound: false,
	error: "internal_error",
};

const addItemBodySchema = z.object({
	productId: z.number().int().positive(),
});

const updateItemBodySchema = z.object({
	quantity: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveCart(sessionId: string, res: Response) {
	const validation = validateCartSession(sessionId);
	if (!validation.valid) {
		res.status(400).json(BAD_REQUEST);
		return null;
	}

	const cart = await cartGetBySessionId(sessionId);
	if (!cart) {
		res.status(404).json(CART_NOT_FOUND);
		return null;
	}

	return cart;
}

async function respondWithSummary(sessionId: string, res: Response) {
	const summary = await cartGetSummary(sessionId);
	if (!summary) {
		res.json(CART_NOT_FOUND);
		return;
	}
	res.json({ ...summary, notFound: false });
}

// ---------------------------------------------------------------------------
// GET /api/cart/:sessionId/summary
// ---------------------------------------------------------------------------

export async function cartSummaryApiHandler(
	req: Request<{ sessionId: string }>,
	res: Response,
) {
	const { sessionId } = req.params;

	const validation = validateCartSession(sessionId);
	if (!validation.valid) {
		res.status(400).json(BAD_REQUEST);
		return;
	}

	try {
		const summary = await cartGetSummary(sessionId);
		if (!summary) {
			res.json(CART_NOT_FOUND);
			return;
		}
		res.json({ ...summary, notFound: false });
	} catch (err) {
		console.error("cartSummaryApiHandler failed:", err);
		res.status(500).json(INTERNAL_ERROR);
	}
}

// ---------------------------------------------------------------------------
// POST /api/cart/:sessionId/items
// ---------------------------------------------------------------------------

export async function cartAddItemApiHandler(
	req: Request<{ sessionId: string }>,
	res: Response,
) {
	const { sessionId } = req.params;

	const bodyResult = addItemBodySchema.safeParse(req.body);
	if (!bodyResult.success) {
		res.status(400).json(BAD_REQUEST);
		return;
	}

	try {
		const cart = await resolveCart(sessionId, res);
		if (!cart) return;

		await cartAddItem(cart.id, bodyResult.data.productId);
		await respondWithSummary(sessionId, res);
	} catch (err) {
		console.error("cartAddItemApiHandler failed:", err);
		res.status(500).json(INTERNAL_ERROR);
	}
}

// ---------------------------------------------------------------------------
// PUT /api/cart/:sessionId/items/:productId
// ---------------------------------------------------------------------------

export async function cartUpdateItemApiHandler(
	req: Request<{ sessionId: string; productId: string }>,
	res: Response,
) {
	const { sessionId, productId: productIdParam } = req.params;

	const bodyResult = updateItemBodySchema.safeParse(req.body);
	if (!bodyResult.success) {
		res.status(400).json(BAD_REQUEST);
		return;
	}

	const productId = Number(productIdParam);
	if (!Number.isInteger(productId) || productId <= 0) {
		res.status(400).json(BAD_REQUEST);
		return;
	}

	try {
		const cart = await resolveCart(sessionId, res);
		if (!cart) return;

		const { quantity } = bodyResult.data;
		if (quantity === 0) {
			await cartRemoveItem(cart.id, productId);
		} else {
			await cartSetItemQuantity(cart.id, productId, quantity);
		}

		await respondWithSummary(sessionId, res);
	} catch (err) {
		console.error("cartUpdateItemApiHandler failed:", err);
		res.status(500).json(INTERNAL_ERROR);
	}
}

// ---------------------------------------------------------------------------
// DELETE /api/cart/:sessionId/items/:productId
// ---------------------------------------------------------------------------

export async function cartRemoveItemApiHandler(
	req: Request<{ sessionId: string; productId: string }>,
	res: Response,
) {
	const { sessionId, productId: productIdParam } = req.params;

	const productId = Number(productIdParam);
	if (!Number.isInteger(productId) || productId <= 0) {
		res.status(400).json(BAD_REQUEST);
		return;
	}

	try {
		const cart = await resolveCart(sessionId, res);
		if (!cart) return;

		await cartRemoveItem(cart.id, productId);
		await respondWithSummary(sessionId, res);
	} catch (err) {
		console.error("cartRemoveItemApiHandler failed:", err);
		res.status(500).json(INTERNAL_ERROR);
	}
}
