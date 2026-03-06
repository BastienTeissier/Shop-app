import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import type { DataModelUpdateMessage } from "@shared/a2ui-types.js";

import {
	createEventMockContext,
	createSSEMockContext,
	isDataModelUpdate,
} from "./helpers/a2ui-mocks.js";

// Mock the search pipeline before any imports
const mockRunSearchPipeline = vi.fn();
vi.mock("../src/agent/index.js", () => ({
	runSearchPipeline: mockRunSearchPipeline,
	runRefinementAgent: vi.fn().mockResolvedValue({ chips: [] }),
	buildProductSummary: vi.fn(() => ({
		titles: [],
		prices: [],
		tiers: [],
		subCategories: [],
	})),
}));

describe("A2UI Event Integration", () => {
	let a2uiStreamHandler: (req: Request, res: Response) => void;
	let a2uiEventHandler: (req: Request, res: Response) => Promise<void>;
	let prisma: PrismaClient;
	let testProductId: number;
	let testProduct2Id: number;

	beforeAll(async () => {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL must be set in .env.test");
		}

		prisma = new PrismaClient();

		// Clean up and seed test data
		await prisma.cartItem.deleteMany();
		await prisma.cart.deleteMany();
		await prisma.product.deleteMany();

		// Create test products
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

		// Import handlers after mocking
		const streamModule = await import("../src/a2ui/stream.js");
		const eventModule = await import("../src/a2ui/event.js");

		a2uiStreamHandler = streamModule.a2uiStreamHandler;
		a2uiEventHandler = eventModule.a2uiEventHandler;
	});

	beforeEach(() => {
		// Reset mock before each test
		mockRunSearchPipeline.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	afterAll(async () => {
		await prisma.cartItem.deleteMany();
		await prisma.cart.deleteMany();
		await prisma.product.deleteMany();
		await prisma.$disconnect();
	});

	describe("test_search_action_updates_products", () => {
		it("POST search action updates connected SSE client with products", async () => {
			const sessionId = crypto.randomUUID();

			// Mock agent to return products
			mockRunSearchPipeline.mockResolvedValue({
				products: [
					{
						id: testProductId,
						title: "Running Shoes",
						description: "Great for running",
						imageUrl: "https://example.com/shoes.png",
						price: 9999,
						highlights: ["Comfortable"],
						reasonWhy: ["Great for beginners"],
					},
					{
						id: testProduct2Id,
						title: "Running Socks",
						description: "Perfect for running",
						imageUrl: "https://example.com/socks.png",
						price: 1499,
						highlights: ["Breathable"],
						reasonWhy: ["Pairs well with running shoes"],
					},
				],
				summary: "Found 2 products for running",
				timings: { formatterMs: 10, recommenderMs: 20 },
			});

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			// Clear initial messages
			const initialMessageCount = sseCtx.messages.length;
			expect(initialMessageCount).toBe(4); // begin, surface, data, end

			// POST search action
			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "running" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			// Verify success response
			expect(eventCtx.responseBody()).toEqual({ success: true });

			// Verify pipeline was called
			expect(mockRunSearchPipeline).toHaveBeenCalledWith(
				"running",
				expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
			);

			// Verify SSE client received updates
			const newMessages = sseCtx.messages.slice(initialMessageCount);
			expect(newMessages.length).toBeGreaterThan(0);

			// Find products update
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			) as DataModelUpdateMessage | undefined;

			expect(productsUpdate).toBeDefined();
			expect(Array.isArray(productsUpdate?.value)).toBe(true);

			const products = productsUpdate?.value as Array<{ title: string }>;
			expect(products.length).toBe(2);
			expect(products.some((p) => p.title === "Running Shoes")).toBe(true);
			expect(products.some((p) => p.title === "Running Socks")).toBe(true);

			// Find status update
			const statusUpdate = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/status" &&
					(msg.value as { phase: string }).phase === "completed",
			) as DataModelUpdateMessage | undefined;

			expect(statusUpdate).toBeDefined();
			expect((statusUpdate?.value as { message: string }).message).toContain(
				"Found 2 products",
			);

			sseCtx.triggerClose();
		});
	});

	describe("test_add_to_cart_action", () => {
		it("POST addToCart action broadcasts cart state update", async () => {
			const sessionId = crypto.randomUUID();

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			const initialMessageCount = sseCtx.messages.length;

			// POST addToCart action
			const eventCtx = createEventMockContext({
				sessionId,
				action: "addToCart",
				payload: { productId: testProductId },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			// Verify success response
			expect(eventCtx.responseBody()).toEqual({ success: true });

			// Verify SSE client received cart update
			const newMessages = sseCtx.messages.slice(initialMessageCount);

			const cartUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/cart",
			) as DataModelUpdateMessage | undefined;

			expect(cartUpdate).toBeDefined();

			const cart = cartUpdate?.value as {
				items: unknown[];
				totalQuantity: number;
				totalPrice: number;
			};
			expect(cart.totalQuantity).toBe(1);
			expect(cart.totalPrice).toBe(9999);
			expect(cart.items.length).toBe(1);

			sseCtx.triggerClose();
		});
	});

	describe("test_invalid_session_returns_error", () => {
		it("POST with non-existent sessionId returns 404", async () => {
			const eventCtx = createEventMockContext({
				sessionId: "non-existent-session-id",
				action: "search",
				payload: { query: "test" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			expect(eventCtx.statusCode()).toBe(404);
			expect(eventCtx.responseBody()).toEqual({ error: "Session not found" });
		});
	});

	describe("test_missing_action_returns_error", () => {
		it("POST with missing action field returns 400", async () => {
			const eventCtx = createEventMockContext({
				sessionId: crypto.randomUUID(),
				// action missing
				payload: { query: "test" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			expect(eventCtx.statusCode()).toBe(400);
			expect(eventCtx.responseBody()).toEqual({
				error: "Invalid request body",
			});
		});

		it("POST with missing sessionId returns 400", async () => {
			const eventCtx = createEventMockContext({
				// sessionId missing
				action: "search",
				payload: { query: "test" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			expect(eventCtx.statusCode()).toBe(400);
			expect(eventCtx.responseBody()).toEqual({
				error: "Invalid request body",
			});
		});
	});

	describe("test_search_empty_query_returns_empty_products", () => {
		it("POST search with empty query returns empty products array", async () => {
			const sessionId = crypto.randomUUID();

			// Mock pipeline to return empty products for empty query
			mockRunSearchPipeline.mockResolvedValue({
				products: [],
				summary: "No recommendations found.",
				timings: { formatterMs: 10, recommenderMs: 20 },
			});

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			const initialMessageCount = sseCtx.messages.length;

			// POST search with empty query
			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			// Verify success response
			expect(eventCtx.responseBody()).toEqual({ success: true });

			// Verify empty products
			const newMessages = sseCtx.messages.slice(initialMessageCount);
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			) as DataModelUpdateMessage | undefined;

			expect(productsUpdate).toBeDefined();
			expect(productsUpdate?.value).toEqual([]);

			// Verify status message
			const statusUpdate = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/status" &&
					(msg.value as { phase: string }).phase === "completed",
			) as DataModelUpdateMessage | undefined;

			expect(statusUpdate).toBeDefined();
			expect((statusUpdate?.value as { message: string }).message).toBe(
				"No recommendations found",
			);

			sseCtx.triggerClose();
		});
	});

	describe("test_unknown_action_returns_error", () => {
		it("POST with unknown action returns 400", async () => {
			const sessionId = crypto.randomUUID();

			// Connect SSE client to create session
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			// POST unknown action
			const eventCtx = createEventMockContext({
				sessionId,
				action: "unknownAction",
				payload: {},
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			expect(eventCtx.statusCode()).toBe(400);
			expect(eventCtx.responseBody()).toEqual({
				error: "Unknown action: unknownAction",
			});

			sseCtx.triggerClose();
		});
	});
});
