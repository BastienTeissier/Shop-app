import type {
	A2UIMessage,
	DataModelUpdateMessage,
	RecommendationDataModel,
	SurfaceUpdateMessage,
} from "@shared/a2ui-types.js";
import type { Request, Response } from "express";
import {
	afterEach,
	beforeAll,
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
}

interface MockRequest {
	query: Record<string, string>;
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

function createMockContext(query: Record<string, string> = {}): MockContext {
	const messages: A2UIMessage[] = [];
	const closeHandlers: (() => void)[] = [];

	const res: MockResponse = {
		setHeader: vi.fn().mockReturnThis(),
		flushHeaders: vi.fn(),
		write: vi.fn((data: string) => {
			// Parse SSE data format: "data: {...}\n\n"
			if (data.startsWith("data: ")) {
				const jsonStr = data.slice(6).trim();
				if (jsonStr) {
					try {
						messages.push(JSON.parse(jsonStr) as A2UIMessage);
					} catch {
						// Ignore parse errors (e.g., keepalive comments)
					}
				}
			}
			return true;
		}),
		on: vi.fn().mockReturnThis(),
		end: vi.fn().mockReturnThis(),
	};

	const req: MockRequest = {
		query,
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

// =============================================================================
// Type Guards
// =============================================================================

function isSurfaceUpdate(msg: A2UIMessage): msg is SurfaceUpdateMessage {
	return msg.type === "surfaceUpdate";
}

function isDataModelUpdate(msg: A2UIMessage): msg is DataModelUpdateMessage {
	return msg.type === "dataModelUpdate";
}

// =============================================================================
// Tests
// =============================================================================

describe("A2UI Stream Integration", () => {
	let a2uiStreamHandler: (req: Request, res: Response) => void;
	let getSession: (
		sessionId: string,
	) => import("@shared/a2ui-types.js").A2UISession | undefined;
	let getClients: (sessionId: string) => Set<Response>;

	beforeAll(async () => {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL must be set in .env.test");
		}

		const streamModule = await import("../src/a2ui/stream.js");
		const sessionModule = await import("../src/a2ui/session.js");

		a2uiStreamHandler = streamModule.a2uiStreamHandler;
		getSession = sessionModule.getSession;
		getClients = sessionModule.getClients;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("test_sse_connection_sends_initial_render", () => {
		it("connects to /api/a2ui/stream and receives initial render sequence", () => {
			const sessionId = crypto.randomUUID();
			const ctx = createMockContext({ session: sessionId });

			a2uiStreamHandler(
				ctx.req as unknown as Request,
				ctx.res as unknown as Response,
			);

			// Verify SSE headers
			expect(ctx.res.setHeader).toHaveBeenCalledWith(
				"Content-Type",
				"text/event-stream",
			);
			expect(ctx.res.setHeader).toHaveBeenCalledWith(
				"Cache-Control",
				"no-cache",
			);
			expect(ctx.res.setHeader).toHaveBeenCalledWith(
				"Connection",
				"keep-alive",
			);
			expect(ctx.res.flushHeaders).toHaveBeenCalled();

			// Verify initial render sequence (4 messages minimum)
			expect(ctx.messages).toHaveLength(4);

			// 1. beginRendering
			expect(ctx.messages[0]).toEqual({ type: "beginRendering" });

			// 2. surfaceUpdate with components
			const surfaceUpdate = ctx.messages[1];
			expect(isSurfaceUpdate(surfaceUpdate)).toBe(true);
			if (isSurfaceUpdate(surfaceUpdate)) {
				expect(surfaceUpdate.surfaceId).toBeDefined();
				expect(Array.isArray(surfaceUpdate.components)).toBe(true);
			}

			// 3. dataModelUpdate with initial data at root path
			const dataModelUpdate = ctx.messages[2];
			expect(isDataModelUpdate(dataModelUpdate)).toBe(true);
			if (isDataModelUpdate(dataModelUpdate)) {
				expect(dataModelUpdate.surfaceId).toBeDefined();
				expect(dataModelUpdate.path).toBe("/");

				const dataModel = dataModelUpdate.value as RecommendationDataModel;
				expect(dataModel.query).toBeDefined();
				expect(dataModel.products).toBeDefined();
				expect(dataModel.status).toBeDefined();
				expect(dataModel.cart).toBeDefined();
			}

			// 4. endRendering
			expect(ctx.messages[3]).toEqual({ type: "endRendering" });

			ctx.triggerClose();
		});

		it("passes initial query through to data model", () => {
			const sessionId = crypto.randomUUID();
			const initialQuery = "running shoes";
			const ctx = createMockContext({
				session: sessionId,
				query: initialQuery,
			});

			a2uiStreamHandler(
				ctx.req as unknown as Request,
				ctx.res as unknown as Response,
			);

			const dataModelUpdate = ctx.messages.find(isDataModelUpdate);
			expect(dataModelUpdate).toBeDefined();

			if (dataModelUpdate) {
				const dataModel = dataModelUpdate.value as RecommendationDataModel;
				expect(dataModel.query).toBe(initialQuery);
				expect(dataModel.ui.query).toBe(initialQuery);
			}

			ctx.triggerClose();
		});
	});

	describe("test_session_isolation", () => {
		it("connects two clients with different sessions and verifies updates don't cross sessions", () => {
			const sessionId1 = crypto.randomUUID();
			const sessionId2 = crypto.randomUUID();

			const ctx1 = createMockContext({ session: sessionId1 });
			const ctx2 = createMockContext({ session: sessionId2 });

			a2uiStreamHandler(
				ctx1.req as unknown as Request,
				ctx1.res as unknown as Response,
			);
			a2uiStreamHandler(
				ctx2.req as unknown as Request,
				ctx2.res as unknown as Response,
			);

			// Both receive their own initial render
			expect(ctx1.messages).toHaveLength(4);
			expect(ctx2.messages).toHaveLength(4);

			// Sessions are separate
			const session1 = getSession(sessionId1);
			const session2 = getSession(sessionId2);

			expect(session1).toBeDefined();
			expect(session2).toBeDefined();
			expect(session1?.sessionId).toBe(sessionId1);
			expect(session2?.sessionId).toBe(sessionId2);

			// Client lists are separate
			const clients1 = getClients(sessionId1);
			const clients2 = getClients(sessionId2);

			expect(clients1.size).toBe(1);
			expect(clients2.size).toBe(1);
			expect(clients1).not.toBe(clients2);

			ctx1.triggerClose();
			ctx2.triggerClose();
		});

		it("multiple clients on same session share state", () => {
			const sessionId = crypto.randomUUID();

			const ctx1 = createMockContext({ session: sessionId });
			const ctx2 = createMockContext({ session: sessionId });

			a2uiStreamHandler(
				ctx1.req as unknown as Request,
				ctx1.res as unknown as Response,
			);
			a2uiStreamHandler(
				ctx2.req as unknown as Request,
				ctx2.res as unknown as Response,
			);

			// Both registered as clients for the same session
			const clients = getClients(sessionId);
			expect(clients.size).toBe(2);

			// Both receive initial render
			expect(ctx1.messages).toHaveLength(4);
			expect(ctx2.messages).toHaveLength(4);

			ctx1.triggerClose();
			ctx2.triggerClose();
		});
	});

	describe("test_client_disconnect_cleanup", () => {
		it("cleans up session when last client disconnects", () => {
			const sessionId = crypto.randomUUID();
			const ctx = createMockContext({ session: sessionId });

			a2uiStreamHandler(
				ctx.req as unknown as Request,
				ctx.res as unknown as Response,
			);

			// Session exists
			expect(getSession(sessionId)).toBeDefined();
			expect(getClients(sessionId).size).toBe(1);

			// Disconnect
			ctx.triggerClose();

			// Session cleaned up
			expect(getSession(sessionId)).toBeUndefined();
			expect(getClients(sessionId).size).toBe(0);
		});

		it("keeps session alive when other clients remain", () => {
			const sessionId = crypto.randomUUID();

			const ctx1 = createMockContext({ session: sessionId });
			const ctx2 = createMockContext({ session: sessionId });

			a2uiStreamHandler(
				ctx1.req as unknown as Request,
				ctx1.res as unknown as Response,
			);
			a2uiStreamHandler(
				ctx2.req as unknown as Request,
				ctx2.res as unknown as Response,
			);

			expect(getClients(sessionId).size).toBe(2);

			// Disconnect first client
			ctx1.triggerClose();

			// Session still exists with one client
			expect(getSession(sessionId)).toBeDefined();
			expect(getClients(sessionId).size).toBe(1);

			// Disconnect second client
			ctx2.triggerClose();

			// Now session is cleaned up
			expect(getSession(sessionId)).toBeUndefined();
			expect(getClients(sessionId).size).toBe(0);
		});
	});
});
