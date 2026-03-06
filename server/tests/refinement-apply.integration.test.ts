import type { Request, Response } from "express";
import {
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

// Mock the search pipeline and refinement agent before any imports
const mockRunSearchPipeline = vi.fn();
const mockRunRefinementAgent = vi.fn();
vi.mock("../src/agent/index.js", () => ({
	runSearchPipeline: mockRunSearchPipeline,
	runRefinementAgent: mockRunRefinementAgent,
	buildProductSummary: vi.fn(() => ({
		titles: [],
		prices: [],
		tiers: [],
		subCategories: [],
	})),
}));

// =============================================================================
// Test Helpers
// =============================================================================

function makeSearchResult(
	products = makeProducts(),
	options?: { formattedQuery?: unknown },
) {
	return {
		products,
		summary: "Test results",
		formattedQuery:
			options === undefined
				? {
						normalizedQuery: "jacket",
						inferredCategories: ["outerwear"],
						constraints: {},
						formattedQueryForRecommender: "jacket outerwear",
					}
				: options.formattedQuery,
		timings: { formatterMs: 10, recommenderMs: 20 },
	};
}

function makeProducts() {
	return [
		{
			id: 1,
			title: "Ski Jacket",
			description: "Warm jacket",
			imageUrl: "https://example.com/jacket.png",
			price: 19999,
			highlights: ["Warm"],
			reasonWhy: ["Essential"],
			tier: "essential" as const,
		},
	];
}

function makeSuggestionChips() {
	return {
		chips: [
			{ label: "Men", kind: "gender" },
			{ label: "Waterproof", kind: "feature" },
		],
	};
}

/**
 * Helper: connect SSE + run initial search to set up lastRecommendation.
 * Returns the SSE context for further assertions.
 */
async function setupWithInitialSearch(
	sessionId: string,
	a2uiStreamHandler: (req: Request, res: Response) => void,
	a2uiEventHandler: (req: Request, res: Response) => Promise<void>,
	query = "jacket",
) {
	// Auto-trigger stub (initial connection search)
	mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult([]));

	const sseCtx = createSSEMockContext({ session: sessionId });
	a2uiStreamHandler(
		sseCtx.req as unknown as Request,
		sseCtx.res as unknown as Response,
	);
	await new Promise((resolve) => setTimeout(resolve, 50));

	// Actual search
	mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult());
	mockRunRefinementAgent.mockResolvedValueOnce(makeSuggestionChips());

	const eventCtx = createEventMockContext({
		sessionId,
		action: "search",
		payload: { query },
	});
	await a2uiEventHandler(
		eventCtx.req as unknown as Request,
		eventCtx.res as unknown as Response,
	);
	await new Promise((resolve) => setTimeout(resolve, 100));

	return sseCtx;
}

// =============================================================================
// Test Suite
// =============================================================================

describe("Refinement Apply Integration", () => {
	let a2uiStreamHandler: (req: Request, res: Response) => void;
	let a2uiEventHandler: (req: Request, res: Response) => Promise<void>;

	beforeAll(async () => {
		const streamModule = await import("../src/a2ui/stream.js");
		const eventModule = await import("../src/a2ui/event.js");
		a2uiStreamHandler = streamModule.a2uiStreamHandler;
		a2uiEventHandler = eventModule.a2uiEventHandler;
	});

	beforeEach(() => {
		mockRunSearchPipeline.mockReset();
		mockRunRefinementAgent.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("test_refine_action_uses_refinement_context", () => {
		it("passes refinementContext from previous search to pipeline", async () => {
			const sessionId = crypto.randomUUID();
			const sseCtx = await setupWithInitialSearch(
				sessionId,
				a2uiStreamHandler,
				a2uiEventHandler,
			);

			// Setup for refine call
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult());
			mockRunRefinementAgent.mockResolvedValueOnce(makeSuggestionChips());

			const refineCtx = createEventMockContext({
				sessionId,
				action: "refine",
				payload: { query: "jacket Men" },
			});
			await a2uiEventHandler(
				refineCtx.req as unknown as Request,
				refineCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Second pipeline call should have refinementContext
			const secondCall = mockRunSearchPipeline.mock.calls[2]; // [0]=auto, [1]=search, [2]=refine
			expect(secondCall[0]).toBe("jacket Men");
			expect(secondCall[1]).toMatchObject({
				refinementContext: {
					previousQuery: "jacket",
					previousProducts: expect.arrayContaining([
						expect.objectContaining({ id: 1, title: "Ski Jacket" }),
					]),
				},
			});

			sseCtx.triggerClose();
		});
	});

	describe("test_refine_broadcasts_query_update", () => {
		it("broadcasts /query and /ui/query with refinement query", async () => {
			const sessionId = crypto.randomUUID();
			const sseCtx = await setupWithInitialSearch(
				sessionId,
				a2uiStreamHandler,
				a2uiEventHandler,
			);

			const initialCount = sseCtx.messages.length;

			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult());
			mockRunRefinementAgent.mockResolvedValueOnce(makeSuggestionChips());

			const refineCtx = createEventMockContext({
				sessionId,
				action: "refine",
				payload: { query: "jacket Men" },
			});
			await a2uiEventHandler(
				refineCtx.req as unknown as Request,
				refineCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 100));

			const newMessages = sseCtx.messages.slice(initialCount);

			const queryUpdate = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/query" &&
					msg.value === "jacket Men",
			);
			const uiQueryUpdate = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/ui/query" &&
					msg.value === "jacket Men",
			);

			expect(queryUpdate).toBeDefined();
			expect(uiQueryUpdate).toBeDefined();

			sseCtx.triggerClose();
		});
	});

	describe("test_refine_triggers_new_refinement_chips", () => {
		it("produces new suggestion chips after refine completes", async () => {
			const sessionId = crypto.randomUUID();
			const sseCtx = await setupWithInitialSearch(
				sessionId,
				a2uiStreamHandler,
				a2uiEventHandler,
			);

			const initialCount = sseCtx.messages.length;

			const newChips = {
				chips: [
					{ label: "Under $100", kind: "price" },
					{ label: "Ski", kind: "activity" },
				],
			};
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult());
			mockRunRefinementAgent.mockResolvedValueOnce(newChips);

			const refineCtx = createEventMockContext({
				sessionId,
				action: "refine",
				payload: { query: "jacket Men" },
			});
			await a2uiEventHandler(
				refineCtx.req as unknown as Request,
				refineCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 100));

			const newMessages = sseCtx.messages.slice(initialCount);
			const suggestionsUpdate = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/suggestions" &&
					(msg.value as { chips: unknown[] }).chips.length > 0,
			);

			expect(suggestionsUpdate).toBeDefined();
			expect((suggestionsUpdate as DataModelUpdateMessage).value).toMatchObject(
				newChips,
			);

			sseCtx.triggerClose();
		});
	});

	describe("test_refine_without_previous_search_returns_error", () => {
		it("returns error status when no previous recommendation exists", async () => {
			const sessionId = crypto.randomUUID();

			// Auto-trigger stub
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult([]));

			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 50));

			const initialCount = sseCtx.messages.length;

			// POST refine without prior search
			const refineCtx = createEventMockContext({
				sessionId,
				action: "refine",
				payload: { query: "jacket Men" },
			});
			await a2uiEventHandler(
				refineCtx.req as unknown as Request,
				refineCtx.res as unknown as Response,
			);

			const newMessages = sseCtx.messages.slice(initialCount);
			const errorStatus = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/status" &&
					(msg.value as { phase: string }).phase === "error",
			) as DataModelUpdateMessage | undefined;

			expect(errorStatus).toBeDefined();
			expect((errorStatus?.value as { message: string }).message).toContain(
				"No previous recommendation",
			);

			sseCtx.triggerClose();
		});
	});

	describe("test_progressive_refine_chains_context", () => {
		it("uses updated context for chained refinements", async () => {
			const sessionId = crypto.randomUUID();
			const sseCtx = await setupWithInitialSearch(
				sessionId,
				a2uiStreamHandler,
				a2uiEventHandler,
			);

			// First refine: "jacket Men"
			const refinedProducts = [
				{
					id: 2,
					title: "Men's Ski Jacket",
					description: "Men's jacket",
					imageUrl: "https://example.com/mens-jacket.png",
					price: 24999,
					highlights: ["Warm"],
					reasonWhy: ["Essential"],
					tier: "essential" as const,
				},
			];
			mockRunSearchPipeline.mockResolvedValueOnce(
				makeSearchResult(refinedProducts),
			);
			mockRunRefinementAgent.mockResolvedValueOnce(makeSuggestionChips());

			const firstRefineCtx = createEventMockContext({
				sessionId,
				action: "refine",
				payload: { query: "jacket Men" },
			});
			await a2uiEventHandler(
				firstRefineCtx.req as unknown as Request,
				firstRefineCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Second refine: "jacket Men Waterproof"
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult());
			mockRunRefinementAgent.mockResolvedValueOnce(makeSuggestionChips());

			const secondRefineCtx = createEventMockContext({
				sessionId,
				action: "refine",
				payload: { query: "jacket Men Waterproof" },
			});
			await a2uiEventHandler(
				secondRefineCtx.req as unknown as Request,
				secondRefineCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Third pipeline call (index 3): should have context from first refine
			const thirdCall = mockRunSearchPipeline.mock.calls[3]; // [0]=auto, [1]=search, [2]=refine1, [3]=refine2
			expect(thirdCall[0]).toBe("jacket Men Waterproof");
			expect(thirdCall[1]).toMatchObject({
				refinementContext: {
					previousQuery: "jacket Men",
					previousProducts: expect.arrayContaining([
						expect.objectContaining({ id: 2, title: "Men's Ski Jacket" }),
					]),
				},
			});

			sseCtx.triggerClose();
		});
	});
});
