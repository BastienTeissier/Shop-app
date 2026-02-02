import { PrismaClient } from "@prisma/client";
import type {
	A2UIMessage,
	DataModelUpdateMessage,
} from "@shared/a2ui-types.js";
import type { Request, Response } from "express";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest";

// =============================================================================
// Mock Types
// =============================================================================

interface MockResponse {
	setHeader: Mock<[name: string, value: string], MockResponse>;
	flushHeaders: Mock<[], void>;
	write: Mock<[data: string], boolean>;
	on: Mock<[event: string, handler: () => void], MockResponse>;
	end: Mock<[], MockResponse>;
	status: Mock<[code: number], MockResponse>;
	json: Mock<[data: unknown], MockResponse>;
}

interface MockRequest {
	query: Record<string, string>;
	body: unknown;
	on: Mock<[event: string, handler: () => void], MockRequest>;
}

interface MockContext {
	req: MockRequest;
	res: MockResponse;
	messages: A2UIMessage[];
	closeHandlers: (() => void)[];
	triggerClose: () => void;
}

// =============================================================================
// Mock Factories
// =============================================================================

function createSSEMockContext(query: Record<string, string> = {}): MockContext {
	const messages: A2UIMessage[] = [];
	const closeHandlers: (() => void)[] = [];

	const res: MockResponse = {
		setHeader: vi.fn().mockReturnThis(),
		flushHeaders: vi.fn(),
		write: vi.fn((data: string) => {
			if (data.startsWith("data: ")) {
				const jsonStr = data.slice(6).trim();
				if (jsonStr) {
					try {
						messages.push(JSON.parse(jsonStr) as A2UIMessage);
					} catch {
						// Ignore parse errors
					}
				}
			}
			return true;
		}),
		on: vi.fn().mockReturnThis(),
		end: vi.fn().mockReturnThis(),
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
	};

	const req: MockRequest = {
		query,
		body: {},
		on: vi.fn((event: string, handler: () => void) => {
			if (event === "close") {
				closeHandlers.push(handler);
			}
			return req;
		}),
	};

	return {
		req,
		res,
		messages,
		closeHandlers,
		triggerClose: () => {
			for (const handler of closeHandlers) {
				handler();
			}
		},
	};
}

function createEventMockContext(body: unknown): {
	req: MockRequest;
	res: MockResponse;
	statusCode: () => number | undefined;
	responseBody: () => unknown;
} {
	let lastStatus: number | undefined;
	let lastJson: unknown;

	const res: MockResponse = {
		setHeader: vi.fn().mockReturnThis(),
		flushHeaders: vi.fn(),
		write: vi.fn().mockReturnValue(true),
		on: vi.fn().mockReturnThis(),
		end: vi.fn().mockReturnThis(),
		status: vi.fn((code: number) => {
			lastStatus = code;
			return res;
		}),
		json: vi.fn((data: unknown) => {
			lastJson = data;
			return res;
		}),
	};

	const req: MockRequest = {
		query: {},
		body,
		on: vi.fn().mockReturnThis(),
	};

	return {
		req,
		res,
		statusCode: () => lastStatus,
		responseBody: () => lastJson,
	};
}

// =============================================================================
// Type Guards
// =============================================================================

function isDataModelUpdate(msg: A2UIMessage): msg is DataModelUpdateMessage {
	return msg.type === "dataModelUpdate";
}

// =============================================================================
// Tests
// =============================================================================

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
});
