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

// Mock the search pipeline
const mockRunSearchPipeline = vi.fn();
vi.mock("../src/agent/index.js", () => ({
	runSearchPipeline: mockRunSearchPipeline,
}));

describe("Pipeline Abort Integration", () => {
	let a2uiStreamHandler: (req: Request, res: Response) => void;
	let a2uiEventHandler: (req: Request, res: Response) => Promise<void>;
	let prisma: PrismaClient;

	beforeAll(async () => {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL must be set in .env.test");
		}

		prisma = new PrismaClient();

		await prisma.cartItem.deleteMany();
		await prisma.cart.deleteMany();
		await prisma.product.deleteMany();

		await prisma.product.create({
			data: {
				title: "Test Product",
				description: "A test product",
				imageUrl: "https://example.com/test.png",
				price: 1000,
			},
		});

		// Import handlers after mocking
		const streamModule = await import("../src/a2ui/stream.js");
		const eventModule = await import("../src/a2ui/event.js");

		a2uiStreamHandler = streamModule.a2uiStreamHandler;
		a2uiEventHandler = eventModule.a2uiEventHandler;
	});

	beforeEach(() => {
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

	describe("test_new_search_aborts_previous_pipeline", () => {
		it("aborts first pipeline when second search starts", async () => {
			const sessionId = crypto.randomUUID();
			let queryAAborted = false;

			// Mock #1: auto-trigger from SSE connect (stays pending, will be aborted by query A)
			mockRunSearchPipeline.mockImplementationOnce(
				(_query: string, options?: { abortSignal?: AbortSignal }) => {
					return new Promise((_resolve, reject) => {
						if (options?.abortSignal) {
							options.abortSignal.addEventListener("abort", () => {
								const error = new Error("Aborted");
								error.name = "AbortError";
								reject(error);
							});
						}
					});
				},
			);

			// Mock #2: query A — stays pending until aborted by query B
			mockRunSearchPipeline.mockImplementationOnce(
				(_query: string, options?: { abortSignal?: AbortSignal }) => {
					return new Promise((_resolve, reject) => {
						if (options?.abortSignal) {
							options.abortSignal.addEventListener("abort", () => {
								queryAAborted = true;
								const error = new Error("Aborted");
								error.name = "AbortError";
								reject(error);
							});
						}
					});
				},
			);

			// Mock #3: query B — resolves immediately
			mockRunSearchPipeline.mockImplementationOnce(() =>
				Promise.resolve({
					products: [
						{
							id: 1,
							title: "Test Product",
							description: "A test product",
							imageUrl: "https://example.com/test.png",
							price: 1000,
							highlights: ["Test"],
							reasonWhy: ["Test"],
						},
					],
					summary: "Results for query B",
					timings: { formatterMs: 10, recommenderMs: 20 },
				}),
			);

			// Connect SSE client (fires auto-trigger, consumes mock #1)
			const sseCtx = createSSEMockContext({ session: sessionId });
			a2uiStreamHandler(
				sseCtx.req as unknown as Request,
				sseCtx.res as unknown as Response,
			);

			// Wait for auto-trigger to fire
			await new Promise((resolve) => setTimeout(resolve, 50));

			const initialMessageCount = sseCtx.messages.length;

			// POST search action "query A" (aborts auto-trigger, consumes mock #2)
			const eventCtxA = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "query A" },
			});

			// Don't await — it will stay pending until query B aborts it
			const promiseA = a2uiEventHandler(
				eventCtxA.req as unknown as Request,
				eventCtxA.res as unknown as Response,
			);

			// POST search action "query B" immediately (aborts query A, consumes mock #3)
			const eventCtxB = createEventMockContext({
				sessionId,
				action: "search",
				payload: { query: "query B" },
			});

			await a2uiEventHandler(
				eventCtxB.req as unknown as Request,
				eventCtxB.res as unknown as Response,
			);

			// Wait for promise A to resolve (it should complete via abort)
			await promiseA;

			// Verify first pipeline was aborted
			expect(queryAAborted).toBe(true);

			// Verify query B completed successfully
			expect(eventCtxB.responseBody()).toEqual({ success: true });

			// Verify no error status was broadcast for query A's abort
			const newMessages = sseCtx.messages.slice(initialMessageCount);
			const errorStatuses = newMessages.filter(
				(msg) =>
					isDataModelUpdate(msg) &&
					msg.path === "/status" &&
					(msg.value as { phase: string }).phase === "error",
			);
			expect(errorStatuses).toHaveLength(0);

			// Verify query B's products were broadcast
			const productsUpdates = newMessages.filter(
				(msg) => isDataModelUpdate(msg) && msg.path === "/products",
			) as DataModelUpdateMessage[];

			const lastProducts = productsUpdates[productsUpdates.length - 1];
			expect(lastProducts).toBeDefined();
			expect((lastProducts.value as Array<{ title: string }>)[0].title).toBe(
				"Test Product",
			);

			sseCtx.triggerClose();
		});
	});
});
