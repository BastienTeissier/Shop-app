import type { OrderSummary, OrderSummaryItem } from "@shared/types.js";
import { prisma } from "./client.js";

export async function orderCreate(data: {
	sessionId: string;
	customerName: string;
	customerEmail: string;
	reference: string;
	totalPrice: number;
	items: {
		productId: number;
		title: string;
		imageUrl: string;
		unitPrice: number;
		quantity: number;
	}[];
}): Promise<void> {
	await prisma.$transaction([
		prisma.order.create({
			data: {
				reference: data.reference,
				sessionId: data.sessionId,
				customerName: data.customerName,
				customerEmail: data.customerEmail,
				totalPrice: data.totalPrice,
				items: { create: data.items },
			},
		}),
		prisma.cartItem.deleteMany({
			where: { cart: { sessionId: data.sessionId } },
		}),
	]);
}

export async function orderGetByReference(
	reference: string,
): Promise<OrderSummary | null> {
	const order = await prisma.order.findUnique({
		where: { reference },
		include: { items: true },
	});

	if (!order) return null;

	const items: OrderSummaryItem[] = order.items.map((item) => ({
		productId: item.productId,
		title: item.title,
		imageUrl: item.imageUrl,
		unitPrice: item.unitPrice,
		quantity: item.quantity,
		lineTotal: item.unitPrice * item.quantity,
	}));

	return {
		reference: order.reference,
		customerName: order.customerName,
		customerEmail: order.customerEmail,
		items,
		totalPrice: order.totalPrice,
		createdAt: order.createdAt.toISOString(),
	};
}
