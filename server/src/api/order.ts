import type { Request, Response } from "express";
import { z } from "zod";
import { cartGetSummary } from "../db/cart.js";
import { orderCreate, orderGetByReference } from "../db/order.js";

const createOrderBodySchema = z.object({
	sessionId: z.string().uuid(),
	customerName: z.string().min(1).max(255),
	customerEmail: z.string().email().max(255),
});

const referenceSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// POST /api/orders
// ---------------------------------------------------------------------------

export async function orderCreateApiHandler(req: Request, res: Response) {
	const bodyResult = createOrderBodySchema.safeParse(req.body);
	if (!bodyResult.success) {
		res.status(400).json({ ok: false, error: "Invalid input" });
		return;
	}

	const { sessionId, customerName, customerEmail } = bodyResult.data;

	try {
		const summary = await cartGetSummary(sessionId);
		if (!summary) {
			res.status(404).json({ ok: false, error: "Cart not found" });
			return;
		}

		if (summary.items.length === 0) {
			res.status(400).json({ ok: false, error: "Cart is empty" });
			return;
		}

		const reference = crypto.randomUUID();

		await orderCreate({
			sessionId,
			customerName,
			customerEmail,
			reference,
			totalPrice: summary.subtotal,
			items: summary.items.map((item) => ({
				productId: item.productId,
				title: item.title,
				imageUrl: item.imageUrl,
				unitPrice: item.unitPriceSnapshot,
				quantity: item.quantity,
			})),
		});

		res.status(201).json({ ok: true, reference });
	} catch (err) {
		console.error("orderCreateApiHandler failed:", err);
		res.status(500).json({ ok: false, error: "Something went wrong" });
	}
}

// ---------------------------------------------------------------------------
// GET /api/orders/:reference
// ---------------------------------------------------------------------------

export async function orderGetApiHandler(
	req: Request<{ reference: string }>,
	res: Response,
) {
	const { reference } = req.params;

	const refResult = referenceSchema.safeParse(reference);
	if (!refResult.success) {
		res.status(400).json({ notFound: true });
		return;
	}

	try {
		const order = await orderGetByReference(reference);
		if (!order) {
			res.status(404).json({ notFound: true });
			return;
		}

		res.json({ ...order, notFound: false });
	} catch (err) {
		console.error("orderGetApiHandler failed:", err);
		res.status(500).json({ notFound: true });
	}
}
