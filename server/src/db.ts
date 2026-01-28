import { type Cart, PrismaClient, type Product } from "@prisma/client";

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

export async function getCartBySessionId(
	sessionId: string,
): Promise<Cart | null> {
	return prisma.cart.findUnique({
		where: { sessionId },
	});
}

export async function createCart(sessionId: string): Promise<Cart> {
	return prisma.cart.create({
		data: { sessionId },
	});
}

export type CartSnapshotItem = {
	productId: number;
	quantity: number;
	priceSnapshot: number;
};

export type CartSnapshot = {
	items: CartSnapshotItem[];
	totalQuantity: number;
	totalPrice: number;
};

export async function getCartSnapshot(cartId: number): Promise<CartSnapshot> {
	const items = await prisma.cartItem.findMany({
		where: { cartId },
		select: { productId: true, quantity: true, priceSnapshot: true },
	});

	const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
	const totalPrice = items.reduce(
		(sum, item) => sum + item.quantity * item.priceSnapshot,
		0,
	);

	return { items, totalQuantity, totalPrice };
}

export type { Product };
