import { PrismaClient } from "@prisma/client";
import type { DataModelUpdateMessage } from "@shared/a2ui-types.js";
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
import {
	createEventMockContext,
	createSSEMockContext,
	isDataModelUpdate,
} from "./helpers/a2ui-mocks.js";

describe("Recommendation Agent Integration", () => {
	let a2uiStreamHandler: (req: Request, res: Response) => void;
	let a2uiEventHandler: (req: Request, res: Response) => Promise<void>;
	let prisma: PrismaClient;
	let testProductId: number;

	// Mock the recommendation agent module
	const mockRunRecommendationAgent = vi.fn();

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
				title: "Running Shoes Pro",
				description: "Professional running shoes for beginners and experts",
				imageUrl: "https://example.com/shoes.png",
				price: 9999,
			},
		});
		testProductId = product.id;

		await prisma.product.create({
			data: {
				title: "Running Socks Comfort",
				description: "Comfortable socks perfect for running",
				imageUrl: "https://example.com/socks.png",
				price: 1499,
			},
		});

		// Mock the agent module before importing handlers
		vi.doMock("../src/agent/index.js", () => ({
			runRecommendationAgent: mockRunRecommendationAgent,
		}));

		// Import handlers after mocking
		const streamModule = await import("../src/a2ui/stream.js");
		const eventModule = await import("../src/a2ui/event.js");

		a2uiStreamHandler = streamModule.a2uiStreamHandler;
		a2uiEventHandler = eventModule.a2uiEventHandler;
	});

	beforeEach(() => {
		mockRunRecommendationAgent.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	afterAll(async () => {
		await prisma.cartItem.deleteMany();
		await prisma.cart.deleteMany();
		await prisma.product.deleteMany();
		await prisma.$disconnect();
		vi.doUnmock("../src/agent/index.js");
	});

	describe("test_recommend_action_returns_products_with_reasons", () => {
		it("Search action returns products with highlights and reasonWhy from agent", async () => {
			const sessionId = crypto.randomUUID();

			// Mock agent response
			mockRunRecommendationAgent.mockResolvedValue({
				products: [
					{
						id: testProductId,
						title: "Running Shoes Pro",
						description: "Professional running shoes",
						imageUrl: "https://example.com/shoes.png",
						price: 9999,
						highlights: ["Lightweight", "Breathable"],
						reasonWhy: ["Perfect for beginners starting their running journey"],
					},
				],
				summary: "Found 1 great running shoe for you!",
			});

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			const initialMessageCount = sseCtx.messages.length;
			expect(initialMessageCount).toBe(4); // begin, surface, data, end

			// POST search action (which now uses recommend handler)
			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "running shoes for beginners" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			// Verify success response
			expect(eventCtx.responseBody()).toEqual({ success: true });

			// Verify agent was called with the query
			expect(mockRunRecommendationAgent).toHaveBeenCalledWith(
				"running shoes for beginners",
			);

			// Verify SSE client received products with highlights and reasonWhy
			const newMessages = sseCtx.messages.slice(initialMessageCount);

			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			) as DataModelUpdateMessage | undefined;

			expect(productsUpdate).toBeDefined();
			const products = productsUpdate?.value as Array<{
				id: number;
				highlights: string[];
				reasonWhy: string[];
			}>;

			expect(products.length).toBe(1);
			expect(products[0].id).toBe(testProductId);
			expect(products[0].highlights).toEqual(["Lightweight", "Breathable"]);
			expect(products[0].reasonWhy).toEqual([
				"Perfect for beginners starting their running journey",
			]);

			sseCtx.triggerClose();
		});
	});

	describe("test_recommend_action_handles_empty_results", () => {
		it("Search action gracefully handles no matches from agent", async () => {
			const sessionId = crypto.randomUUID();

			// Mock empty agent response
			mockRunRecommendationAgent.mockResolvedValue({
				products: [],
				summary: "No recommendations found.",
			});

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			const initialMessageCount = sseCtx.messages.length;

			// POST search action
			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "nonexistent product xyz" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

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

	describe("test_recommend_action_broadcasts_status_updates", () => {
		it("Search action broadcasts searching and completed status", async () => {
			const sessionId = crypto.randomUUID();

			// Mock agent response
			mockRunRecommendationAgent.mockResolvedValue({
				products: [
					{
						id: testProductId,
						title: "Test Product",
						description: "Test",
						imageUrl: "https://example.com/test.png",
						price: 1000,
						highlights: [],
						reasonWhy: [],
					},
				],
				summary: "Here are your recommendations.",
			});

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			const initialMessageCount = sseCtx.messages.length;

			// POST search action
			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "test query" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			// Find status updates
			const newMessages = sseCtx.messages.slice(initialMessageCount);
			const statusUpdates = newMessages.filter(
				(msg) => isDataModelUpdate(msg) && msg.path === "/status",
			) as DataModelUpdateMessage[];

			// Should have at least searching and completed status
			expect(statusUpdates.length).toBeGreaterThanOrEqual(2);

			// First status should be searching
			const searchingStatus = statusUpdates.find(
				(msg) => (msg.value as { phase: string }).phase === "searching",
			);
			expect(searchingStatus).toBeDefined();

			// Last status should be completed
			const completedStatus = statusUpdates.find(
				(msg) => (msg.value as { phase: string }).phase === "completed",
			);
			expect(completedStatus).toBeDefined();

			sseCtx.triggerClose();
		});
	});

	describe("test_recommend_action_handles_agent_error", () => {
		it("Search action broadcasts error status when agent fails", async () => {
			const sessionId = crypto.randomUUID();

			// Mock agent error
			mockRunRecommendationAgent.mockRejectedValue(
				new Error("API rate limit exceeded"),
			);

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			const initialMessageCount = sseCtx.messages.length;

			// POST search action
			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "running shoes" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			// Should still return success (handler caught the error)
			expect(eventCtx.responseBody()).toEqual({ success: true });

			// Verify error status was broadcast
			const newMessages = sseCtx.messages.slice(initialMessageCount);
			const errorStatus = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/status" &&
					(msg.value as { phase: string }).phase === "error",
			) as DataModelUpdateMessage | undefined;

			expect(errorStatus).toBeDefined();
			expect((errorStatus?.value as { message: string }).message).toContain(
				"Failed to get recommendations",
			);

			sseCtx.triggerClose();
		});
	});

	describe("test_agent_returns_subcategory_per_product", () => {
		it("Agent returns products with subCategory field", async () => {
			const sessionId = crypto.randomUUID();

			// Mock agent response with subCategory
			mockRunRecommendationAgent.mockResolvedValue({
				products: [
					{
						id: testProductId,
						title: "Running Shoes Pro",
						description: "Professional running shoes",
						imageUrl: "https://example.com/shoes.png",
						price: 9999,
						highlights: ["Lightweight"],
						reasonWhy: ["Great for running"],
						subCategory: "running-shoes",
					},
				],
				summary: "Found running gear for you!",
			});

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			const initialMessageCount = sseCtx.messages.length;

			// POST search action
			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "running gear" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			// Verify products have subCategory
			const newMessages = sseCtx.messages.slice(initialMessageCount);
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			) as DataModelUpdateMessage | undefined;

			expect(productsUpdate).toBeDefined();
			const products = productsUpdate?.value as Array<{
				id: number;
				subCategory?: string;
			}>;

			expect(products.length).toBe(1);
			expect(products[0].subCategory).toBe("running-shoes");

			sseCtx.triggerClose();
		});
	});

	describe("test_empty_query_triggers_popular_products", () => {
		it("Empty query automatically searches for popular products", async () => {
			// Mock agent response
			mockRunRecommendationAgent.mockResolvedValue({
				products: [
					{
						id: testProductId,
						title: "Popular Running Shoes",
						description: "Best seller",
						imageUrl: "https://example.com/shoes.png",
						price: 9999,
						highlights: ["Popular"],
						reasonWhy: ["Best seller"],
						subCategory: "running-shoes",
					},
				],
				summary: "Here are popular products!",
			});

			// Connect SSE client with empty query
			const sseCtx = createSSEMockContext({ session: crypto.randomUUID() });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			// Wait a bit for auto-trigger to execute
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Verify agent was called with "popular products"
			expect(mockRunRecommendationAgent).toHaveBeenCalledWith(
				"popular products",
			);

			sseCtx.triggerClose();
		});
	});

	describe("test_recommendations_with_diversity_applied", () => {
		it("Diversity filter removes duplicate sub-categories", async () => {
			const sessionId = crypto.randomUUID();

			// Mock agent response with duplicate sub-categories
			mockRunRecommendationAgent.mockResolvedValue({
				products: [
					{
						id: 1,
						title: "Hiking Boots Pro",
						description: "Pro boots",
						imageUrl: "https://example.com/boots1.png",
						price: 15000,
						highlights: ["Waterproof"],
						reasonWhy: ["Best for trails"],
						tier: "essential" as const,
						subCategory: "hiking-boots",
					},
					{
						id: 2,
						title: "Hiking Poles",
						description: "Trekking poles",
						imageUrl: "https://example.com/poles.png",
						price: 5000,
						highlights: ["Lightweight"],
						reasonWhy: ["Stability"],
						tier: "recommended" as const,
						subCategory: "trekking-poles",
					},
					{
						id: 3,
						title: "Hiking Boots Budget",
						description: "Budget boots",
						imageUrl: "https://example.com/boots2.png",
						price: 8000,
						highlights: ["Affordable"],
						reasonWhy: ["Good value"],
						tier: "recommended" as const,
						subCategory: "hiking-boots", // Duplicate!
					},
				],
				summary: "Found hiking gear!",
			});

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			const initialMessageCount = sseCtx.messages.length;

			// POST search action
			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "hiking gear" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			// Verify only first hiking-boots kept
			const newMessages = sseCtx.messages.slice(initialMessageCount);
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			) as DataModelUpdateMessage | undefined;

			expect(productsUpdate).toBeDefined();
			const products = productsUpdate?.value as Array<{
				id: number;
				subCategory: string;
			}>;

			// Should have 2 products (boots1 and poles), not 3
			expect(products.length).toBe(2);
			expect(products.map((p) => p.id)).toEqual([1, 2]);

			sseCtx.triggerClose();
		});
	});

	describe("test_shows_fewer_products_when_all_same_subcategory", () => {
		it("Shows only one product when all have same sub-category", async () => {
			const sessionId = crypto.randomUUID();

			// Mock agent response with all same sub-category
			mockRunRecommendationAgent.mockResolvedValue({
				products: [
					{
						id: 1,
						title: "Running Shoes Pro",
						description: "Pro shoes",
						imageUrl: "https://example.com/shoes1.png",
						price: 15000,
						highlights: ["Premium"],
						reasonWhy: ["Best quality"],
						subCategory: "running-shoes",
					},
					{
						id: 2,
						title: "Running Shoes Budget",
						description: "Budget shoes",
						imageUrl: "https://example.com/shoes2.png",
						price: 8000,
						highlights: ["Affordable"],
						reasonWhy: ["Good value"],
						subCategory: "running-shoes",
					},
					{
						id: 3,
						title: "Running Shoes Mid",
						description: "Mid-range shoes",
						imageUrl: "https://example.com/shoes3.png",
						price: 10000,
						highlights: ["Balanced"],
						reasonWhy: ["Great compromise"],
						subCategory: "running-shoes",
					},
				],
				summary: "Found running shoes!",
			});

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			const initialMessageCount = sseCtx.messages.length;

			// POST search action
			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "running shoes" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			// Verify only 1 product returned
			const newMessages = sseCtx.messages.slice(initialMessageCount);
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			) as DataModelUpdateMessage | undefined;

			expect(productsUpdate).toBeDefined();
			const products = productsUpdate?.value as Array<{ id: number }>;

			// Should have only 1 product
			expect(products.length).toBe(1);
			expect(products[0].id).toBe(1); // First one kept

			sseCtx.triggerClose();
		});
	});

	describe("test_fallback_when_ai_inference_fails", () => {
		it("Shows all products when subCategory is missing (fallback)", async () => {
			const sessionId = crypto.randomUUID();

			// Mock agent response without subCategory fields
			mockRunRecommendationAgent.mockResolvedValue({
				products: [
					{
						id: 1,
						title: "Product 1",
						description: "Test",
						imageUrl: "https://example.com/1.png",
						price: 1000,
						highlights: ["Feature"],
						reasonWhy: ["Reason"],
						// No subCategory
					},
					{
						id: 2,
						title: "Product 2",
						description: "Test",
						imageUrl: "https://example.com/2.png",
						price: 2000,
						highlights: ["Feature"],
						reasonWhy: ["Reason"],
						// No subCategory
					},
					{
						id: 3,
						title: "Product 3",
						description: "Test",
						imageUrl: "https://example.com/3.png",
						price: 3000,
						highlights: ["Feature"],
						reasonWhy: ["Reason"],
						// No subCategory
					},
				],
				summary: "Found products!",
			});

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			const initialMessageCount = sseCtx.messages.length;

			// POST search action
			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "outdoor gear" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			// Verify all 3 products are shown (no filtering applied)
			const newMessages = sseCtx.messages.slice(initialMessageCount);
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			) as DataModelUpdateMessage | undefined;

			expect(productsUpdate).toBeDefined();
			const products = productsUpdate?.value as Array<{ id: number }>;

			// All 3 products should be present (fallback behavior)
			expect(products.length).toBe(3);
			expect(products.map((p) => p.id)).toEqual([1, 2, 3]);

			sseCtx.triggerClose();
		});
	});
});
