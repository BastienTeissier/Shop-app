import type { Cart } from "@prisma/client";
import type {
	CartSnapshot,
	CartSummary,
	CartSummaryItem,
} from "@shared/types.js";
import { prisma } from "./client.js";

export type {
	CartSnapshot,
	CartSnapshotItem,
	CartSummary,
	CartSummaryItem,
} from "@shared/types.js";

export async function cartGetBySessionId(
	sessionId: string,
): Promise<Cart | null> {
	return prisma.cart.findUnique({
		where: { sessionId },
	});
}

export async function cartCreate(sessionId: string): Promise<Cart> {
	return prisma.cart.create({
		data: { sessionId },
	});
}

export async function cartGetSnapshot(cartId: number): Promise<CartSnapshot> {
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

export async function cartAddItem(
	cartId: number,
	productId: number,
): Promise<CartSnapshot> {
	const existingItem = await prisma.cartItem.findFirst({
		where: { cartId, productId },
	});

	if (existingItem) {
		await prisma.cartItem.update({
			where: { id: existingItem.id },
			data: { quantity: existingItem.quantity + 1 },
		});
	} else {
		const product = await prisma.product.findUnique({
			where: { id: productId },
			select: { price: true },
		});

		if (!product) {
			return cartGetSnapshot(cartId);
		}

		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				quantity: 1,
				priceSnapshot: product.price,
			},
		});
	}

	return cartGetSnapshot(cartId);
}

export async function cartRemoveItem(
	cartId: number,
	productId: number,
): Promise<CartSnapshot> {
	await prisma.cartItem.deleteMany({
		where: { cartId, productId },
	});

	return cartGetSnapshot(cartId);
}

export async function cartGetSummary(sessionId: string): Promise<CartSummary> {
	const cart = await prisma.cart.findUnique({
		where: { sessionId },
		include: {
			items: {
				include: {
					product: {
						select: { title: true, imageUrl: true },
					},
				},
			},
		},
	});

	if (!cart) {
		return { items: [], subtotal: 0, notFound: true };
	}

	const items: CartSummaryItem[] = cart.items.map((item) => ({
		productId: item.productId,
		title: item.product.title,
		imageUrl: item.product.imageUrl,
		unitPriceSnapshot: item.priceSnapshot,
		quantity: item.quantity,
		lineTotal: item.priceSnapshot * item.quantity,
	}));

	const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

	return { items, subtotal, notFound: false };
}
