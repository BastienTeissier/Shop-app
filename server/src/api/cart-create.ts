import type { CreateCartResponse } from "@shared/types.js";
import type { Request, Response } from "express";
import { cartCreate } from "../db/cart.js";

export async function cartCreateApiHandler(_req: Request, res: Response) {
	try {
		const sessionId = crypto.randomUUID();
		await cartCreate(sessionId);
		res.status(201).json({ sessionId } satisfies CreateCartResponse);
	} catch (err) {
		console.error("cartCreateApiHandler failed:", err);
		res.status(500).json({ error: "internal_error" });
	}
}
