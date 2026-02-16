import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createEventMockContext } from "./helpers/a2ui-mocks.js";

describe("GET /api/cart/:sessionId/summary", () => {
	let cartSummaryApiHandler: (req: Request, res: Response) => Promise<void>;
	let prisma: PrismaClient;
	let testProductId: number;
	let testProduct2Id: number;

	beforeAll(async () => {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL must be set in .env.test");
		}

		prisma = new PrismaClient();

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

		const { cartSummaryApiHandler: handler } = await import(
			"../src/api/cart.js"
		);
		cartSummaryApiHandler = handler;
	});

	beforeEach(async () => {
		await prisma.cartItem.deleteMany();
		await prisma.cart.deleteMany();
	});

	afterAll(async () => {
		await prisma.cartItem.deleteMany();
		await prisma.cart.deleteMany();
		await prisma.product.deleteMany();
		await prisma.$disconnect();
	});

	function createMockContext(sessionId: string) {
		const ctx = createEventMockContext({});
		ctx.req.params = { sessionId };
		return ctx;
	}

	it("returns cart summary for valid session with items", async () => {
		const sessionId = crypto.randomUUID();
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

		const ctx = createMockContext(sessionId);
		await cartSummaryApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		const body = ctx.responseBody();
		expect(body).toMatchObject({
			notFound: false,
			subtotal: 9999 * 2 + 1499,
		});
		const items = (body as { items: unknown[] }).items;
		expect(items).toHaveLength(2);
	});

	it("returns empty items for valid session with empty cart", async () => {
		const sessionId = crypto.randomUUID();
		await prisma.cart.create({ data: { sessionId } });

		const ctx = createMockContext(sessionId);
		await cartSummaryApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.responseBody()).toEqual({
			items: [],
			subtotal: 0,
			notFound: false,
		});
	});

	it("returns notFound for unknown session ID", async () => {
		const ctx = createMockContext(crypto.randomUUID());
		await cartSummaryApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.responseBody()).toEqual({
			items: [],
			subtotal: 0,
			notFound: true,
		});
	});

	it("returns 400 for invalid (non-UUID) session ID", async () => {
		const ctx = createMockContext("not-a-uuid");
		await cartSummaryApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(400);
		expect(ctx.responseBody()).toEqual({
			items: [],
			subtotal: 0,
			notFound: true,
		});
	});
});
