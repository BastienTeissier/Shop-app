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
						normalizedQuery: "skiing gear",
						inferredCategories: ["ski"],
						constraints: {},
						formattedQueryForRecommender: "skiing equipment",
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

// =============================================================================
// Test Suite
// =============================================================================

describe("Background Refinement Integration", () => {
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

	describe("test_suggestions_broadcast_after_products", () => {
		it("broadcasts suggestions after products", async () => {
			const sessionId = crypto.randomUUID();

			// Auto-trigger stub
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult([]));
			mockRunRefinementAgent.mockResolvedValue(makeSuggestionChips());

			// Connect SSE
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Setup for actual search
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult());

			const initialCount = sseCtx.messages.length;

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

			// Wait for async refinement
			await new Promise((resolve) => setTimeout(resolve, 100));

			const newMessages = sseCtx.messages.slice(initialCount);
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			);
			const suggestionsUpdate = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/suggestions" &&
					(msg.value as { chips: unknown[] }).chips.length > 0,
			);

			expect(productsUpdate).toBeDefined();
			expect(suggestionsUpdate).toBeDefined();

			// Suggestions should come after products
			const productsIndex = newMessages.indexOf(productsUpdate!);
			const suggestionsIndex = newMessages.indexOf(suggestionsUpdate!);
			expect(suggestionsIndex).toBeGreaterThan(productsIndex);

			sseCtx.triggerClose();
		});
	});

	describe("test_suggestions_cleared_on_new_search", () => {
		it("clears suggestions at the start of a new search", async () => {
			const sessionId = crypto.randomUUID();

			// Auto-trigger stub
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult([]));

			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 50));

			// First search completes with chips
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult());
			mockRunRefinementAgent.mockResolvedValueOnce(makeSuggestionChips());

			const firstSearchCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "skiing gear" },
			});
			await a2uiEventHandler(
				firstSearchCtx.req as unknown as Request,
				firstSearchCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Second search
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult());
			mockRunRefinementAgent.mockResolvedValueOnce(makeSuggestionChips());

			const initialCount = sseCtx.messages.length;

			const secondSearchCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "running shoes" },
			});
			await a2uiEventHandler(
				secondSearchCtx.req as unknown as Request,
				secondSearchCtx.res as unknown as Response,
			);

			// Check that first message with /suggestions path has empty chips
			const newMessages = sseCtx.messages.slice(initialCount);
			const clearSuggestions = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/suggestions" &&
					(msg.value as { chips: unknown[] }).chips.length === 0,
			) as DataModelUpdateMessage | undefined;

			expect(clearSuggestions).toBeDefined();

			sseCtx.triggerClose();
		});
	});

	describe("test_refinement_failure_degrades_gracefully", () => {
		it("products still broadcast when refinement fails", async () => {
			const sessionId = crypto.randomUUID();

			// Auto-trigger stub
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult([]));

			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Search succeeds but refinement fails
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult());
			mockRunRefinementAgent.mockRejectedValueOnce(new Error("LLM timeout"));

			const initialCount = sseCtx.messages.length;

			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "skiing gear" },
			});
			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 100));

			const newMessages = sseCtx.messages.slice(initialCount);

			// Products should still be broadcast
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			);
			expect(productsUpdate).toBeDefined();

			// No non-empty suggestions should be broadcast
			const suggestionsWithChips = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/suggestions" &&
					(msg.value as { chips: unknown[] }).chips.length > 0,
			);
			expect(suggestionsWithChips).toBeUndefined();

			// Status should be completed, not error
			const statusUpdate = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/status" &&
					(msg.value as { phase: string }).phase === "completed",
			);
			expect(statusUpdate).toBeDefined();

			sseCtx.triggerClose();
		});
	});

	describe("test_refinement_aborted_on_new_search", () => {
		it("aborts refinement when a new search starts", async () => {
			const sessionId = crypto.randomUUID();

			// Auto-trigger stub
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult([]));

			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 50));

			// First search: refinement stays pending until abort
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult());
			let rejectFirstRefinement: (error: Error) => void;
			mockRunRefinementAgent.mockImplementationOnce(
				(_fq: unknown, _ps: unknown, opts: { abortSignal?: AbortSignal }) => {
					return new Promise((_resolve, reject) => {
						rejectFirstRefinement = reject;
						if (opts?.abortSignal) {
							opts.abortSignal.addEventListener("abort", () => {
								const err = new Error("Aborted");
								err.name = "AbortError";
								reject(err);
							});
						}
					});
				},
			);

			const firstCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "query A" },
			});
			await a2uiEventHandler(
				firstCtx.req as unknown as Request,
				firstCtx.res as unknown as Response,
			);

			// Second search immediately
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult());
			mockRunRefinementAgent.mockResolvedValueOnce(makeSuggestionChips());

			const secondCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "query B" },
			});
			await a2uiEventHandler(
				secondCtx.req as unknown as Request,
				secondCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 100));

			// First refinement should not have produced chips (was aborted)
			// Second refinement should produce chips
			expect(mockRunRefinementAgent).toHaveBeenCalledTimes(2);

			sseCtx.triggerClose();
		});
	});

	describe("test_no_refinement_when_no_products", () => {
		it("does not call refinement agent when no products returned", async () => {
			const sessionId = crypto.randomUUID();

			// Auto-trigger stub
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult([]));

			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 50));
			mockRunRefinementAgent.mockClear();

			// Search returns no products
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult([]));

			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "nonexistent" },
			});
			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(mockRunRefinementAgent).not.toHaveBeenCalled();

			sseCtx.triggerClose();
		});
	});

	describe("test_no_refinement_when_formatter_failed", () => {
		it("skips refinement when formattedQuery is undefined", async () => {
			const sessionId = crypto.randomUUID();

			// Auto-trigger stub
			mockRunSearchPipeline.mockResolvedValueOnce(makeSearchResult([]));

			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 50));
			mockRunRefinementAgent.mockClear();

			// Search returns products but no formattedQuery (formatter failed)
			mockRunSearchPipeline.mockResolvedValueOnce(
				makeSearchResult(makeProducts(), { formattedQuery: undefined }),
			);

			const initialCount = sseCtx.messages.length;

			const eventCtx = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "skiing gear" },
			});
			await a2uiEventHandler(
				eventCtx.req as unknown as Request,
				eventCtx.res as unknown as Response,
			);
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Products should still be broadcast
			const newMessages = sseCtx.messages.slice(initialCount);
			const productsUpdate = newMessages.find(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			);
			expect(productsUpdate).toBeDefined();

			// Refinement agent should NOT have been called
			expect(mockRunRefinementAgent).not.toHaveBeenCalled();

			// No non-empty suggestions broadcast
			const suggestionsWithChips = newMessages.find(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/suggestions" &&
					(msg.value as { chips: unknown[] }).chips.length > 0,
			);
			expect(suggestionsWithChips).toBeUndefined();

			sseCtx.triggerClose();
		});
	});
});
