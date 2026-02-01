import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("MCP tools/call", () => {
	let client: Client | undefined;
	let prisma: PrismaClient | undefined;

	beforeAll(async () => {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL must be set in .env.test");
		}

		prisma = new PrismaClient();
		await prisma.product.deleteMany();
		await prisma.product.create({
			data: {
				title: "Test Bike",
				description: "A fast test bike",
				imageUrl: "https://example.com/test-bike.png",
				price: 1999,
			},
		});

		const { default: server } = await import("../src/server.js");

		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);

		client = new Client({
			name: "ecom-carousel-test",
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

	it("returns matching products for tools/call", async () => {
		if (!client) {
			throw new Error("Client not initialized");
		}

		const result = await client.callTool({
			name: "ecom-carousel",
			arguments: { query: "Bike" },
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent?.products).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					title: "Test Bike",
					price: 1999,
				}),
			]),
		);
	});
});
