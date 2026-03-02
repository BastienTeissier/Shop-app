import type { Mock } from "vitest";
import { vi } from "vitest";

import type {
	A2UIMessage,
	DataModelUpdateMessage,
	SurfaceUpdateMessage,
} from "@shared/a2ui-types.js";

// =============================================================================
// Mock Types
// =============================================================================

export type MockResponse = {
	setHeader: Mock<[name: string, value: string], MockResponse>;
	flushHeaders: Mock<[], void>;
	write: Mock<[data: string], boolean>;
	on: Mock<[event: string, handler: () => void], MockResponse>;
	end: Mock<[], MockResponse>;
	status: Mock<[code: number], MockResponse>;
	json: Mock<[data: unknown], MockResponse>;
};

export type MockRequest = {
	query: Record<string, string>;
	params: Record<string, string>;
	body: unknown;
	on: Mock<[event: string, handler: () => void], MockRequest>;
};

export type MockContext = {
	req: MockRequest;
	res: MockResponse;
	messages: A2UIMessage[];
	closeHandlers: (() => void)[];
	triggerClose: () => void;
};

// =============================================================================
// Mock Factories
// =============================================================================

export function createSSEMockContext(
	query: Record<string, string> = {},
): MockContext {
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
		params: {},
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

export function createEventMockContext(body: unknown): {
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
		params: {},
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

export function isDataModelUpdate(
	msg: A2UIMessage,
): msg is DataModelUpdateMessage {
	return msg.type === "dataModelUpdate";
}

export function isSurfaceUpdate(msg: A2UIMessage): msg is SurfaceUpdateMessage {
	return msg.type === "surfaceUpdate";
}
