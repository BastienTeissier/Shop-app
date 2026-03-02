import type { Product as PrismaProduct } from "@prisma/client";
import type { Product } from "@shared/types.js";
import { prisma } from "./client.js";

export type { Product } from "@shared/types.js";

export async function productList(
	query: string,
	limit = 10,
): Promise<Product[]> {
	const trimmedQuery = query.trim();
	const safeLimit = Math.max(0, Math.floor(limit));

	if (!trimmedQuery || safeLimit === 0) {
		return [];
	}

	const products: PrismaProduct[] = await prisma.product.findMany({
		where: {
			OR: [
				{ title: { contains: trimmedQuery } },
				{ description: { contains: trimmedQuery } },
			],
		},
		orderBy: { id: "desc" },
		take: safeLimit,
	});

	return products;
}

export async function productGetById(id: number): Promise<Product | null> {
	return prisma.product.findUnique({ where: { id } });
}

export async function productListByCategories(
	categories: string[],
	limit = 20,
): Promise<Product[]> {
	const safeLimit = Math.max(0, Math.floor(limit));

	if (categories.length === 0 || safeLimit === 0) {
		return [];
	}

	const products: PrismaProduct[] = await prisma.product.findMany({
		where: {
			OR: categories.map((cat) => ({
				category: { contains: cat },
			})),
		},
		orderBy: { id: "desc" },
		take: safeLimit,
	});

	return products;
}
