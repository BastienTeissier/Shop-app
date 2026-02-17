import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createEventMockContext } from "./helpers/a2ui-mocks.js";

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let cartSummaryApiHandler: (req: Request, res: Response) => Promise<void>;
let cartAddItemApiHandler: (req: Request, res: Response) => Promise<void>;
let cartUpdateItemApiHandler: (req: Request, res: Response) => Promise<void>;
let cartRemoveItemApiHandler: (req: Request, res: Response) => Promise<void>;
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

	const api = await import("../src/api/cart.js");
	cartSummaryApiHandler = api.cartSummaryApiHandler;
	cartAddItemApiHandler = api.cartAddItemApiHandler;
	cartUpdateItemApiHandler = api.cartUpdateItemApiHandler;
	cartRemoveItemApiHandler = api.cartRemoveItemApiHandler;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(
	sessionId: string,
	body: unknown = {},
	params: Record<string, string> = {},
) {
	const ctx = createEventMockContext(body);
	ctx.req.params = { sessionId, ...params };
	return ctx;
}

// ---------------------------------------------------------------------------
// GET /api/cart/:sessionId/summary
// ---------------------------------------------------------------------------

describe("GET /api/cart/:sessionId/summary", () => {
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

// ---------------------------------------------------------------------------
// POST /api/cart/:sessionId/items
// ---------------------------------------------------------------------------

describe("POST /api/cart/:sessionId/items", () => {
	it("adds item and returns updated summary", async () => {
		const sessionId = crypto.randomUUID();
		await prisma.cart.create({ data: { sessionId } });

		const ctx = createMockContext(sessionId, {
			productId: testProductId,
		});
		await cartAddItemApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		const body = ctx.responseBody() as {
			items: unknown[];
			subtotal: number;
			notFound: boolean;
		};
		expect(body.notFound).toBe(false);
		expect(body.items).toHaveLength(1);
		expect(body.subtotal).toBe(9999);
	});

	it("increments quantity for existing item", async () => {
		const sessionId = crypto.randomUUID();
		const cart = await prisma.cart.create({ data: { sessionId } });
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId: testProductId,
				quantity: 1,
				priceSnapshot: 9999,
			},
		});

		const ctx = createMockContext(sessionId, {
			productId: testProductId,
		});
		await cartAddItemApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		const body = ctx.responseBody() as {
			items: { quantity: number }[];
			subtotal: number;
			notFound: boolean;
		};
		expect(body.notFound).toBe(false);
		expect(body.items).toHaveLength(1);
		expect(body.items[0].quantity).toBe(2);
		expect(body.subtotal).toBe(9999 * 2);
	});

	it("returns 404 for unknown session", async () => {
		const ctx = createMockContext(crypto.randomUUID(), {
			productId: testProductId,
		});
		await cartAddItemApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(404);
		expect(ctx.responseBody()).toEqual({
			items: [],
			subtotal: 0,
			notFound: true,
		});
	});

	it("returns 400 for invalid session", async () => {
		const ctx = createMockContext("not-a-uuid", {
			productId: testProductId,
		});
		await cartAddItemApiHandler(
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

	it("returns 400 for invalid body", async () => {
		const sessionId = crypto.randomUUID();
		await prisma.cart.create({ data: { sessionId } });

		const ctx = createMockContext(sessionId, { productId: "abc" });
		await cartAddItemApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(400);
	});
});

// ---------------------------------------------------------------------------
// PUT /api/cart/:sessionId/items/:productId
// ---------------------------------------------------------------------------

describe("PUT /api/cart/:sessionId/items/:productId", () => {
	it("sets item quantity and returns updated summary", async () => {
		const sessionId = crypto.randomUUID();
		const cart = await prisma.cart.create({ data: { sessionId } });
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId: testProductId,
				quantity: 1,
				priceSnapshot: 9999,
			},
		});

		const ctx = createMockContext(
			sessionId,
			{ quantity: 5 },
			{ productId: String(testProductId) },
		);
		await cartUpdateItemApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		const body = ctx.responseBody() as {
			items: { quantity: number }[];
			subtotal: number;
			notFound: boolean;
		};
		expect(body.notFound).toBe(false);
		expect(body.items).toHaveLength(1);
		expect(body.items[0].quantity).toBe(5);
		expect(body.subtotal).toBe(9999 * 5);
	});

	it("removes item when quantity set to 0", async () => {
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

		const ctx = createMockContext(
			sessionId,
			{ quantity: 0 },
			{ productId: String(testProductId) },
		);
		await cartUpdateItemApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		const body = ctx.responseBody() as {
			items: unknown[];
			subtotal: number;
			notFound: boolean;
		};
		expect(body.notFound).toBe(false);
		expect(body.items).toHaveLength(1);
		expect(body.subtotal).toBe(1499);
	});

	it("returns 404 for unknown session", async () => {
		const ctx = createMockContext(
			crypto.randomUUID(),
			{ quantity: 5 },
			{ productId: String(testProductId) },
		);
		await cartUpdateItemApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(404);
		expect(ctx.responseBody()).toEqual({
			items: [],
			subtotal: 0,
			notFound: true,
		});
	});

	it("returns 400 for invalid quantity", async () => {
		const sessionId = crypto.randomUUID();
		await prisma.cart.create({ data: { sessionId } });

		const ctx = createMockContext(
			sessionId,
			{ quantity: -1 },
			{ productId: String(testProductId) },
		);
		await cartUpdateItemApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(400);
	});
});

// ---------------------------------------------------------------------------
// DELETE /api/cart/:sessionId/items/:productId
// ---------------------------------------------------------------------------

describe("DELETE /api/cart/:sessionId/items/:productId", () => {
	it("removes item and returns updated summary", async () => {
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

		const ctx = createMockContext(sessionId, {}, {
			productId: String(testProductId),
		});
		await cartRemoveItemApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		const body = ctx.responseBody() as {
			items: unknown[];
			subtotal: number;
			notFound: boolean;
		};
		expect(body.notFound).toBe(false);
		expect(body.items).toHaveLength(1);
		expect(body.subtotal).toBe(1499);
	});

	it("returns 404 for unknown session", async () => {
		const ctx = createMockContext(crypto.randomUUID(), {}, {
			productId: String(testProductId),
		});
		await cartRemoveItemApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(404);
		expect(ctx.responseBody()).toEqual({
			items: [],
			subtotal: 0,
			notFound: true,
		});
	});
});
