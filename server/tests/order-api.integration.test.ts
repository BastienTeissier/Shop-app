import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createEventMockContext } from "./helpers/a2ui-mocks.js";

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let orderCreateApiHandler: (req: Request, res: Response) => Promise<void>;
let orderGetApiHandler: (req: Request, res: Response) => Promise<void>;
let prisma: PrismaClient;
let testProductId: number;
let testProduct2Id: number;

beforeAll(async () => {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL must be set in .env.test");
	}

	prisma = new PrismaClient();

	await prisma.orderItem.deleteMany();
	await prisma.order.deleteMany();
	await prisma.cartItem.deleteMany();
	await prisma.cart.deleteMany();
	await prisma.product.deleteMany();

	const product = await prisma.product.create({
		data: {
			title: "Running Shoes",
			description: "Great for running",
			imageUrl: "https://example.com/shoes.png",
			price: 9999,
		},
	});
	testProductId = product.id;

	const product2 = await prisma.product.create({
		data: {
			title: "Running Socks",
			description: "Perfect for running",
			imageUrl: "https://example.com/socks.png",
			price: 1499,
		},
	});
	testProduct2Id = product2.id;

	const api = await import("../src/api/order.js");
	orderCreateApiHandler = api.orderCreateApiHandler;
	orderGetApiHandler = api.orderGetApiHandler;
});

beforeEach(async () => {
	await prisma.orderItem.deleteMany();
	await prisma.order.deleteMany();
	await prisma.cartItem.deleteMany();
	await prisma.cart.deleteMany();
});

afterAll(async () => {
	await prisma.orderItem.deleteMany();
	await prisma.order.deleteMany();
	await prisma.cartItem.deleteMany();
	await prisma.cart.deleteMany();
	await prisma.product.deleteMany();
	await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(
	body: unknown = {},
	params: Record<string, string> = {},
) {
	const ctx = createEventMockContext(body);
	ctx.req.params = params;
	return ctx;
}

async function seedCartWithItems(sessionId: string) {
	const cart = await prisma.cart.create({ data: { sessionId } });
	await prisma.cartItem.create({
		data: {
			cartId: cart.id,
			productId: testProductId,
			quantity: 2,
			priceSnapshot: 9999,
		},
	});
	await prisma.cartItem.create({
		data: {
			cartId: cart.id,
			productId: testProduct2Id,
			quantity: 1,
			priceSnapshot: 1499,
		},
	});
	return cart;
}

// ---------------------------------------------------------------------------
// POST /api/orders
// ---------------------------------------------------------------------------

describe("POST /api/orders", () => {
	it("creates order and returns reference", async () => {
		const sessionId = crypto.randomUUID();
		await seedCartWithItems(sessionId);

		const ctx = createMockContext({
			sessionId,
			customerName: "John",
			customerEmail: "john@example.com",
		});
		await orderCreateApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(201);
		const body = ctx.responseBody() as { ok: boolean; reference: string };
		expect(body.ok).toBe(true);
		expect(body.reference).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	it("deletes cart items after order creation", async () => {
		const sessionId = crypto.randomUUID();
		const cart = await seedCartWithItems(sessionId);

		const ctx = createMockContext({
			sessionId,
			customerName: "John",
			customerEmail: "john@example.com",
		});
		await orderCreateApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(201);
		const count = await prisma.cartItem.count({
			where: { cartId: cart.id },
		});
		expect(count).toBe(0);
	});

	it("persists order with correct data", async () => {
		const sessionId = crypto.randomUUID();
		await seedCartWithItems(sessionId);

		const ctx = createMockContext({
			sessionId,
			customerName: "Jane Doe",
			customerEmail: "jane@example.com",
		});
		await orderCreateApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		const body = ctx.responseBody() as { ok: boolean; reference: string };
		const order = await prisma.order.findUnique({
			where: { reference: body.reference },
			include: { items: true },
		});

		expect(order).not.toBeNull();
		expect(order?.customerName).toBe("Jane Doe");
		expect(order?.customerEmail).toBe("jane@example.com");
		expect(order?.totalPrice).toBe(9999 * 2 + 1499);
		expect(order?.items).toHaveLength(2);
		expect(order?.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					productId: testProductId,
					title: "Running Shoes",
					unitPrice: 9999,
					quantity: 2,
				}),
				expect.objectContaining({
					productId: testProduct2Id,
					title: "Running Socks",
					unitPrice: 1499,
					quantity: 1,
				}),
			]),
		);
	});

	it("returns 400 for empty cart", async () => {
		const sessionId = crypto.randomUUID();
		await prisma.cart.create({ data: { sessionId } });

		const ctx = createMockContext({
			sessionId,
			customerName: "John",
			customerEmail: "john@example.com",
		});
		await orderCreateApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(400);
		expect(ctx.responseBody()).toEqual({
			ok: false,
			error: "Cart is empty",
		});
	});

	it("returns 404 for unknown session", async () => {
		const ctx = createMockContext({
			sessionId: crypto.randomUUID(),
			customerName: "John",
			customerEmail: "john@example.com",
		});
		await orderCreateApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(404);
		expect(ctx.responseBody()).toEqual({
			ok: false,
			error: "Cart not found",
		});
	});

	it("returns 400 for invalid body (missing name)", async () => {
		const ctx = createMockContext({
			sessionId: crypto.randomUUID(),
			customerEmail: "a@b.com",
		});
		await orderCreateApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(400);
		expect(ctx.responseBody()).toEqual({
			ok: false,
			error: "Invalid input",
		});
	});

	it("returns 400 for invalid email format", async () => {
		const ctx = createMockContext({
			sessionId: crypto.randomUUID(),
			customerName: "John",
			customerEmail: "not-an-email",
		});
		await orderCreateApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(400);
		expect(ctx.responseBody()).toEqual({
			ok: false,
			error: "Invalid input",
		});
	});

	it("returns 400 for name exceeding 255 chars", async () => {
		const ctx = createMockContext({
			sessionId: crypto.randomUUID(),
			customerName: "a".repeat(256),
			customerEmail: "john@example.com",
		});
		await orderCreateApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(400);
		expect(ctx.responseBody()).toEqual({
			ok: false,
			error: "Invalid input",
		});
	});
});

// ---------------------------------------------------------------------------
// GET /api/orders/:reference
// ---------------------------------------------------------------------------

describe("GET /api/orders/:reference", () => {
	it("returns order summary for valid reference", async () => {
		const reference = crypto.randomUUID();
		await prisma.order.create({
			data: {
				reference,
				sessionId: crypto.randomUUID(),
				customerName: "John",
				customerEmail: "john@example.com",
				totalPrice: 21497,
				items: {
					create: [
						{
							productId: testProductId,
							title: "Running Shoes",
							imageUrl: "https://example.com/shoes.png",
							unitPrice: 9999,
							quantity: 2,
						},
						{
							productId: testProduct2Id,
							title: "Running Socks",
							imageUrl: "https://example.com/socks.png",
							unitPrice: 1499,
							quantity: 1,
						},
					],
				},
			},
		});

		const ctx = createMockContext({}, { reference });
		await orderGetApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		const body = ctx.responseBody() as Record<string, unknown>;
		expect(body.notFound).toBe(false);
		expect(body.reference).toBe(reference);
		expect(body.customerName).toBe("John");
		expect(body.customerEmail).toBe("john@example.com");
		expect(body.totalPrice).toBe(21497);
		expect(body.items).toHaveLength(2);
	});

	it("returns 404 for unknown reference", async () => {
		const ctx = createMockContext({}, { reference: crypto.randomUUID() });
		await orderGetApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(404);
		expect(ctx.responseBody()).toEqual({ notFound: true });
	});

	it("returns 400 for invalid (non-UUID) reference", async () => {
		const ctx = createMockContext({}, { reference: "not-a-uuid" });
		await orderGetApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(400);
		expect(ctx.responseBody()).toEqual({ notFound: true });
	});
});
