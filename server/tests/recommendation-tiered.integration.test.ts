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

import type {
	DataModelUpdateMessage,
	RecommendationProduct,
} from "@shared/a2ui-types.js";

import {
	createEventMockContext,
	createSSEMockContext,
	isDataModelUpdate,
} from "./helpers/a2ui-mocks.js";

// Mock the recommendation agent before any imports
const mockRunRecommendationAgent = vi.fn();
vi.mock("../src/agent/index.js", () => ({
	runRecommendationAgent: mockRunRecommendationAgent,
}));

describe("Tiered Recommendations Integration", () => {
	let a2uiStreamHandler: (req: Request, res: Response) => void;
	let a2uiEventHandler: (req: Request, res: Response) => Promise<void>;
	let prisma: PrismaClient;
	let skiJacketId: number;
	let skiBootsId: number;
	let skiGogglesId: number;

	beforeAll(async () => {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL must be set in .env.test");
		}

		prisma = new PrismaClient();

		// Clean up and seed test data
		await prisma.cartItem.deleteMany();
		await prisma.cart.deleteMany();
		await prisma.product.deleteMany();

		// Create test products with categories
		const skiJacket = await prisma.product.create({
			data: {
				title: "Snowboard Jacket",
				description: "Warm winter jacket for skiing",
				imageUrl: "https://example.com/jacket.png",
				price: 19999,
				category: "ski",
			},
		});
		skiJacketId = skiJacket.id;

		const skiBoots = await prisma.product.create({
			data: {
				title: "Ski Boots Pro",
				description: "Professional ski boots",
				imageUrl: "https://example.com/boots.png",
				price: 29999,
				category: "ski",
			},
		});
		skiBootsId = skiBoots.id;

		const skiGoggles = await prisma.product.create({
			data: {
				title: "Snow Goggles",
				description: "UV protection goggles for snow",
				imageUrl: "https://example.com/goggles.png",
				price: 4999,
				category: "ski",
			},
		});
		skiGogglesId = skiGoggles.id;

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
	});

	describe("test_recommend_returns_tiered_products", () => {
		it("returns products with tier field assigned", async () => {
			const sessionId = crypto.randomUUID();

			// Mock agent to return products with tier field
			mockRunRecommendationAgent.mockResolvedValue({
				products: [
					{
						id: skiBootsId,
						title: "Ski Boots Pro",
						description: "Professional ski boots",
						imageUrl: "https://example.com/boots.png",
						price: 29999,
						highlights: ["Professional grade"],
						reasonWhy: ["Essential for skiing"],
						tier: "essential",
					},
					{
						id: skiJacketId,
						title: "Snowboard Jacket",
						description: "Warm winter jacket for skiing",
						imageUrl: "https://example.com/jacket.png",
						price: 19999,
						highlights: ["Warm", "Waterproof"],
						reasonWhy: ["Keeps you warm on the slopes"],
						tier: "recommended",
					},
					{
						id: skiGogglesId,
						title: "Snow Goggles",
						description: "UV protection goggles for snow",
						imageUrl: "https://example.com/goggles.png",
						price: 4999,
						highlights: ["UV protection"],
						reasonWhy: ["Nice to have for visibility"],
						tier: "optional",
					},
				],
				summary: "Gear for skiing",
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
				payload: { query: "skiing gear" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			expect(eventCtx.responseBody()).toEqual({ success: true });

			// Find products update
			const newMessages = sseCtx.messages.slice(initialMessageCount);
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			) as DataModelUpdateMessage | undefined;

			expect(productsUpdate).toBeDefined();

			const products = productsUpdate?.value as RecommendationProduct[];
			expect(products.length).toBe(3);

			// Verify tiers are assigned
			const essential = products.find((p) => p.tier === "essential");
			const recommended = products.find((p) => p.tier === "recommended");
			const optional = products.find((p) => p.tier === "optional");

			expect(essential).toBeDefined();
			expect(essential?.title).toBe("Ski Boots Pro");

			expect(recommended).toBeDefined();
			expect(recommended?.title).toBe("Snowboard Jacket");

			expect(optional).toBeDefined();
			expect(optional?.title).toBe("Snow Goggles");

			sseCtx.triggerClose();
		});
	});

	describe("test_refine_action_works", () => {
		it("refine action updates recommendations based on feedback", async () => {
			const sessionId = crypto.randomUUID();

			// Mock agent for initial search
			mockRunRecommendationAgent.mockResolvedValueOnce({
				products: [
					{
						id: skiBootsId,
						title: "Ski Boots Pro",
						description: "Professional ski boots",
						imageUrl: "https://example.com/boots.png",
						price: 29999,
						highlights: ["Professional grade"],
						reasonWhy: ["Essential for skiing"],
						tier: "essential",
					},
					{
						id: skiJacketId,
						title: "Snowboard Jacket",
						description: "Warm winter jacket",
						imageUrl: "https://example.com/jacket.png",
						price: 19999,
						highlights: ["Warm"],
						reasonWhy: ["Keeps you warm"],
						tier: "recommended",
					},
				],
				summary: "Ski gear",
			});

			// Connect SSE client
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			// Initial search
			const searchCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "skiing gear" },
			});

			await a2uiEventHandler(
				searchCtx.req as unknown as Request,
				searchCtx.res as unknown as Response,
			);

			expect(searchCtx.responseBody()).toEqual({ success: true });

			// Mock agent for refinement - exclude jacket
			mockRunRecommendationAgent.mockResolvedValueOnce({
				products: [
					{
						id: skiBootsId,
						title: "Ski Boots Pro",
						description: "Professional ski boots",
						imageUrl: "https://example.com/boots.png",
						price: 29999,
						highlights: ["Professional grade"],
						reasonWhy: ["Essential for skiing"],
						tier: "essential",
					},
				],
				summary: "Refined gear without jacket",
			});

			const initialCount = sseCtx.messages.length;

			// POST refine action
			const refineCtx = createEventMockContext({
				sessionId,
				action: "refine",
				payload: { query: "I already have a jacket" },
			});

			await a2uiEventHandler(
				refineCtx.req as unknown as Request,
				refineCtx.res as unknown as Response,
			);

			expect(refineCtx.responseBody()).toEqual({ success: true });

			// Verify agent was called with refinement context
			expect(mockRunRecommendationAgent).toHaveBeenLastCalledWith(
				"I already have a jacket",
				expect.objectContaining({
					previousQuery: "skiing gear",
					previousProducts: expect.any(Array),
				}),
			);

			// Verify products were updated
			const newMessages = sseCtx.messages.slice(initialCount);
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			) as DataModelUpdateMessage | undefined;

			expect(productsUpdate).toBeDefined();

			const products = productsUpdate?.value as RecommendationProduct[];
			expect(products.length).toBe(1);
			expect(products[0].title).toBe("Ski Boots Pro");

			sseCtx.triggerClose();
		});
	});

	describe("test_refine_without_prior_recommendation_returns_error", () => {
		it("refine action without prior search shows error", async () => {
			const sessionId = crypto.randomUUID();

			// Connect SSE client (creates fresh session)
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			const initialCount = sseCtx.messages.length;

			// POST refine action without prior search
			const refineCtx = createEventMockContext({
				sessionId,
				action: "refine",
				payload: { query: "exclude jackets" },
			});

			await a2uiEventHandler(
				refineCtx.req as unknown as Request,
				refineCtx.res as unknown as Response,
			);

			expect(refineCtx.responseBody()).toEqual({ success: true });

			// Verify error status was broadcast
			const newMessages = sseCtx.messages.slice(initialCount);
			const statusUpdate = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/status" &&
					(msg.value as { phase: string }).phase === "error",
			) as DataModelUpdateMessage | undefined;

			expect(statusUpdate).toBeDefined();
			expect((statusUpdate?.value as { message: string }).message).toContain(
				"No previous recommendation",
			);

			// Verify agent was NOT called
			expect(mockRunRecommendationAgent).not.toHaveBeenCalled();

			sseCtx.triggerClose();
		});
	});

	describe("test_empty_tier_not_in_response", () => {
		it("only returns tiers that have products", async () => {
			const sessionId = crypto.randomUUID();

			// Mock agent to return products only in essential tier
			mockRunRecommendationAgent.mockResolvedValue({
				products: [
					{
						id: skiBootsId,
						title: "Ski Boots Pro",
						description: "Professional ski boots",
						imageUrl: "https://example.com/boots.png",
						price: 29999,
						highlights: ["Professional grade"],
						reasonWhy: ["Essential for skiing"],
						tier: "essential",
					},
				],
				summary: "Essential gear only",
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
				payload: { query: "boots" },
			});

			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);

			// Find products update
			const newMessages = sseCtx.messages.slice(initialMessageCount);
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			) as DataModelUpdateMessage | undefined;

			const products = productsUpdate?.value as RecommendationProduct[];
			expect(products.length).toBe(1);
			expect(products[0].tier).toBe("essential");

			// No recommended or optional products
			expect(products.filter((p) => p.tier === "recommended")).toHaveLength(0);
			expect(products.filter((p) => p.tier === "optional")).toHaveLength(0);

			sseCtx.triggerClose();
		});
	});
});
