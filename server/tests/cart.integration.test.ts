import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const uuidRegex =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("MCP tools/cart", () => {
	let client: Client | undefined;
	let prisma: PrismaClient | undefined;
	let productId = 0;

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
				price: 1999,
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
			items: [],
			totalQuantity: 0,
			totalPrice: 0,
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
});
