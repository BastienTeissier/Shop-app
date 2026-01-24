import { PrismaClient, type Product } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
	prisma?: PrismaClient;
};

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
	});

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

function scheduleDisconnect(): void {
	void prisma.$disconnect();
}

process.once("beforeExit", scheduleDisconnect);
process.once("SIGINT", scheduleDisconnect);
process.once("SIGTERM", scheduleDisconnect);

export async function listProducts(
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
