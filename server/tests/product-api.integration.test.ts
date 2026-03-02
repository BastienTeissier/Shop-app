import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEventMockContext } from "./helpers/a2ui-mocks.js";

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let productGetApiHandler: (req: Request, res: Response) => Promise<void>;
let prisma: PrismaClient;
let testProductId: number;

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
			title: "Trail Shoe",
			description: "Great for trails",
			imageUrl: "https://example.com/trail.png",
			price: 12999,
		},
	});
	testProductId = product.id;

	const api = await import("../src/api/products.js");
	productGetApiHandler = api.productGetApiHandler;
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

function createMockContext(params: Record<string, string> = {}) {
	const ctx = createEventMockContext({});
	ctx.req.params = params;
	return ctx;
}

// ---------------------------------------------------------------------------
// GET /api/products/:id
// ---------------------------------------------------------------------------

describe("GET /api/products/:id", () => {
	it("returns product for valid ID", async () => {
		const ctx = createMockContext({ id: String(testProductId) });
		await productGetApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		const body = ctx.responseBody() as Record<string, unknown>;
		expect(body).toMatchObject({
			id: testProductId,
			title: "Trail Shoe",
			description: "Great for trails",
			imageUrl: "https://example.com/trail.png",
			price: 12999,
			notFound: false,
		});
	});

	it("returns 404 for unknown product ID", async () => {
		const ctx = createMockContext({ id: "99999" });
		await productGetApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(404);
		expect(ctx.responseBody()).toEqual({ notFound: true });
	});

	it("returns 400 for non-numeric ID", async () => {
		const ctx = createMockContext({ id: "abc" });
		await productGetApiHandler(
			ctx.req as unknown as Request,
			ctx.res as unknown as Response,
		);

		expect(ctx.statusCode()).toBe(400);
		expect(ctx.responseBody()).toEqual({ notFound: true });
	});
});
