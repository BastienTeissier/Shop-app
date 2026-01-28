import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const uuidRegex =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("MCP tools/cart", () => {
	let client: Client | undefined;
	let prisma: PrismaClient | undefined;
	let productId = 0;
	const productPrice = 1999;

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
				title: "Test Bike",
				description: "A fast test bike",
				imageUrl: "https://example.com/test-bike.png",
				price: productPrice,
			},
		});
		productId = product.id;

		const { default: server } = await import("../src/server.js");
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);

		client = new Client({
			name: "cart-test",
			version: "0.0.0",
		});
		await client.connect(clientTransport);
	});

	beforeEach(async () => {
		// Clean cart data between tests
		await prisma?.cartItem.deleteMany();
		await prisma?.cart.deleteMany();
	});

	afterAll(async () => {
		await client?.close();
		if (prisma) {
			await prisma.cartItem.deleteMany();
			await prisma.cart.deleteMany();
			await prisma.product.deleteMany();
			await prisma.$disconnect();
		}
	});

	it("creates session on first add", async () => {
		if (!client) {
			throw new Error("Client not initialized");
		}

		const result = await client.callTool({
			name: "cart",
			arguments: { action: "add", productId },
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent?.sessionId).toMatch(uuidRegex);
		expect(result.structuredContent?.cart).toEqual({
			items: [{ productId, quantity: 1, priceSnapshot: productPrice }],
			totalQuantity: 1,
			totalPrice: productPrice,
		});
	});

	it("rejects invalid session", async () => {
		if (!client) {
			throw new Error("Client not initialized");
		}

		const result = await client.callTool({
			name: "cart",
			arguments: { action: "add", productId, sessionId: "nope" },
		});

		expect(result.isError).toBe(true);
		expect(result.content?.[0]?.text).toBe("Invalid cart session");
	});

	it("increments quantity on repeated add", async () => {
		if (!client) {
			throw new Error("Client not initialized");
		}

		// First add
		const firstResult = await client.callTool({
			name: "cart",
			arguments: { action: "add", productId },
		});

		expect(firstResult.isError).toBe(false);
		const sessionId = firstResult.structuredContent?.sessionId;
		expect(sessionId).toMatch(uuidRegex);

		// Second add - should increment quantity
		const secondResult = await client.callTool({
			name: "cart",
			arguments: { action: "add", productId, sessionId },
		});

		expect(secondResult.isError).toBe(false);
		expect(secondResult.structuredContent?.cart).toEqual({
			items: [{ productId, quantity: 2, priceSnapshot: productPrice }],
			totalQuantity: 2,
			totalPrice: productPrice * 2,
		});
	});

	it("removes line on remove action", async () => {
		if (!client) {
			throw new Error("Client not initialized");
		}

		// First add item
		const addResult = await client.callTool({
			name: "cart",
			arguments: { action: "add", productId },
		});

		expect(addResult.isError).toBe(false);
		const sessionId = addResult.structuredContent?.sessionId;

		// Then remove
		const removeResult = await client.callTool({
			name: "cart",
			arguments: { action: "remove", productId, sessionId },
		});

		expect(removeResult.isError).toBe(false);
		expect(removeResult.structuredContent?.cart).toEqual({
			items: [],
			totalQuantity: 0,
			totalPrice: 0,
		});
	});

	it("snapshots price on first add", async () => {
		if (!client || !prisma) {
			throw new Error("Client or Prisma not initialized");
		}

		// Add item to cart
		const result = await client.callTool({
			name: "cart",
			arguments: { action: "add", productId },
		});

		expect(result.isError).toBe(false);
		const cartItem = result.structuredContent?.cart?.items?.[0];
		expect(cartItem?.priceSnapshot).toBe(productPrice);

		// Verify price snapshot is stored in database
		const dbCartItem = await prisma.cartItem.findFirst({
			where: { productId },
		});
		expect(dbCartItem?.priceSnapshot).toBe(productPrice);
	});
});
