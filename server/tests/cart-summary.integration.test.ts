import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const uuidRegex =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("MCP tools/cart-summary", () => {
	let client: Client | undefined;
	let prisma: PrismaClient | undefined;
	let productId = 0;
	const productPrice = 1999;
	const productTitle = "Test Bike";
	const productImageUrl = "https://example.com/test-bike.png";

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
				title: productTitle,
				description: "A fast test bike",
				imageUrl: productImageUrl,
				price: productPrice,
			},
		});
		productId = product.id;

		const { default: server } = await import("../src/server.js");
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);

		client = new Client({
			name: "cart-summary-test",
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

	it("returns items and subtotal", async () => {
		if (!client) {
			throw new Error("Client not initialized");
		}

		// First add item to cart to get a session
		const addResult = await client.callTool({
			name: "cart",
			arguments: { action: "add", productId },
		});

		expect(addResult.isError).toBe(false);
		const sessionId = addResult.structuredContent?.sessionId;
		expect(sessionId).toMatch(uuidRegex);

		// Now get the summary
		const summaryResult = await client.callTool({
			name: "cart-summary",
			arguments: { sessionId },
		});

		expect(summaryResult.isError).toBe(false);
		expect(summaryResult.structuredContent?.sessionId).toBe(sessionId);
		expect(summaryResult.structuredContent?.items).toEqual([
			{
				productId,
				title: productTitle,
				imageUrl: productImageUrl,
				unitPriceSnapshot: productPrice,
				quantity: 1,
				lineTotal: productPrice,
			},
		]);
		expect(summaryResult.structuredContent?.subtotal).toBe(productPrice);
	});

	it("returns isError on invalid session", async () => {
		if (!client) {
			throw new Error("Client not initialized");
		}

		const result = await client.callTool({
			name: "cart-summary",
			arguments: { sessionId: "invalid-uuid" },
		});

		expect(result.isError).toBe(true);
		expect(result.content?.[0]?.text).toBe("Invalid cart session");
		expect(result.structuredContent?.items).toEqual([]);
		expect(result.structuredContent?.subtotal).toBe(0);
	});

	it("returns isError on non-existent session", async () => {
		if (!client) {
			throw new Error("Client not initialized");
		}

		const result = await client.callTool({
			name: "cart-summary",
			arguments: { sessionId: "00000000-0000-0000-0000-000000000000" },
		});

		expect(result.isError).toBe(true);
		expect(result.content?.[0]?.text).toBe("Invalid cart session");
		expect(result.structuredContent?.items).toEqual([]);
		expect(result.structuredContent?.subtotal).toBe(0);
	});
});
