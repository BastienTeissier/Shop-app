import type { Product } from "@prisma/client";
import { prisma } from "./client.js";

export async function productList(
	query: string,
	limit = 10,
): Promise<Product[]> {
	const trimmedQuery = query.trim();
	const safeLimit = Math.max(0, Math.floor(limit));

	if (!trimmedQuery || safeLimit === 0) {
		return [];
	}

	return prisma.product.findMany({
		where: {
			OR: [
				{ title: { contains: trimmedQuery } },
				{ description: { contains: trimmedQuery } },
			],
		},
		orderBy: { id: "desc" },
		take: safeLimit,
	});
}

export type { Product };
