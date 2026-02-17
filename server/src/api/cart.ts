import type { CartSummary } from "@shared/types.js";
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

export type CartSummaryApiResponse = CartSummary & { notFound: boolean };

const NOT_FOUND_CART_FALLBACK: CartSummaryApiResponse = {
	items: [],
	subtotal: 0,
	notFound: true,
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
		res.status(400).json(NOT_FOUND_CART_FALLBACK);
		return null;
	}

	const cart = await cartGetBySessionId(sessionId);
	if (!cart) {
		res.status(404).json(NOT_FOUND_CART_FALLBACK);
		return null;
	}

	return cart;
}

async function respondWithSummary(sessionId: string, res: Response) {
	const summary = await cartGetSummary(sessionId);
	if (!summary) {
		res.json(NOT_FOUND_CART_FALLBACK);
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
		res.status(400).json(NOT_FOUND_CART_FALLBACK);
		return;
	}

	try {
		const cart = await resolveCart(sessionId, res);
		if (!cart) return;

		await cartAddItem(cart.id, bodyResult.data.productId);
		await respondWithSummary(sessionId, res);
	} catch {
		res.status(500).json(NOT_FOUND_CART_FALLBACK);
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
		res.status(400).json(NOT_FOUND_CART_FALLBACK);
		return;
	}

	const productId = Number(productIdParam);
	if (!Number.isInteger(productId) || productId <= 0) {
		res.status(400).json(NOT_FOUND_CART_FALLBACK);
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
	} catch {
		res.status(500).json(NOT_FOUND_CART_FALLBACK);
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
		res.status(400).json(NOT_FOUND_CART_FALLBACK);
		return;
	}

	try {
		const cart = await resolveCart(sessionId, res);
		if (!cart) return;

		await cartRemoveItem(cart.id, productId);
		await respondWithSummary(sessionId, res);
	} catch {
		res.status(500).json(NOT_FOUND_CART_FALLBACK);
	}
}
