import type { Request, Response } from "express";

import type { ProductApiResponse } from "@shared/types.js";

import { productGetById } from "../db/products.js";

const NOT_FOUND: ProductApiResponse = { notFound: true };

export async function productGetApiHandler(
	req: Request<{ id: string }>,
	res: Response,
) {
	const id = Number(req.params.id);
	if (!Number.isInteger(id) || id <= 0) {
		res.status(400).json(NOT_FOUND);
		return;
	}

	try {
		const product = await productGetById(id);
		if (!product) {
			res.status(404).json(NOT_FOUND);
			return;
		}
		res.json({ ...product, notFound: false } satisfies ProductApiResponse);
	} catch (err) {
		console.error("productGetApiHandler failed:", err);
		res.status(500).json({ notFound: false, error: "internal_error" });
	}
}
