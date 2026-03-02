import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRecommendations } from "./useRecommendations.js";

// ---------------------------------------------------------------------------
// Mock API
// ---------------------------------------------------------------------------

const mockPostA2UIEvent = vi.fn();
const mockGetA2UIStreamUrl = vi.fn(
	(sessionId: string, query?: string) =>
		`http://localhost:3000/api/a2ui/stream?session=${sessionId}${query ? `&query=${query}` : ""}`,
);

vi.mock("../api.js", () => ({
	postA2UIEvent: (...args: unknown[]) => mockPostA2UIEvent(...args),
	getA2UIStreamUrl: (sessionId: string, query?: string) =>
		mockGetA2UIStreamUrl(sessionId, query),
}));

// ---------------------------------------------------------------------------
// Mock EventSource
// ---------------------------------------------------------------------------

type MockEventSource = {
	url: string;
	onopen: (() => void) | null;
	onmessage: ((event: { data: string }) => void) | null;
	onerror: (() => void) | null;
	close: ReturnType<typeof vi.fn>;
};

let mockEventSources: MockEventSource[] = [];

class FakeEventSource {
	url: string;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	close = vi.fn();

	constructor(url: string) {
		this.url = url;
		mockEventSources.push(this as unknown as MockEventSource);
	}
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
	mockEventSources = [];
	mockPostA2UIEvent.mockReset();
	mockGetA2UIStreamUrl.mockClear();
	vi.stubGlobal("EventSource", FakeEventSource);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useRecommendations", () => {
	it("connects EventSource on first search call", () => {
		const { result } = renderHook(() => useRecommendations());

		act(() => {
			result.current.search("running");
		});

		expect(mockEventSources).toHaveLength(1);
		expect(mockEventSources[0].url).toContain("query=running");
	});

	it("extracts products from dataModelUpdate messages", () => {
		const { result } = renderHook(() => useRecommendations());

		act(() => {
			result.current.search("running");
		});

		const es = mockEventSources[0];

		act(() => {
			es.onopen?.();
		});

		act(() => {
			es.onmessage?.({
				data: JSON.stringify({
					type: "dataModelUpdate",
					surfaceId: "main",
					path: "/products",
					value: [
						{
							id: 1,
							title: "Shoe A",
							description: "",
							imageUrl: "",
							price: 100,
							highlights: [],
							reasonWhy: [],
						},
						{
							id: 2,
							title: "Shoe B",
							description: "",
							imageUrl: "",
							price: 200,
							highlights: [],
							reasonWhy: [],
						},
					],
				}),
			});
		});

		expect(result.current.products).toHaveLength(2);
		expect(result.current.products[0].title).toBe("Shoe A");
	});

	it("extracts status from dataModelUpdate messages", () => {
		const { result } = renderHook(() => useRecommendations());

		act(() => {
			result.current.search("running");
		});

		act(() => {
			mockEventSources[0].onopen?.();
		});

		act(() => {
			mockEventSources[0].onmessage?.({
				data: JSON.stringify({
					type: "dataModelUpdate",
					surfaceId: "main",
					path: "/status",
					value: { phase: "searching", message: "Searching..." },
				}),
			});
		});

		expect(result.current.status.phase).toBe("searching");
	});

	it("sets connected: false and error on EventSource error", () => {
		const { result } = renderHook(() => useRecommendations());

		act(() => {
			result.current.search("running");
		});

		act(() => {
			mockEventSources[0].onopen?.();
		});

		expect(result.current.connected).toBe(true);

		act(() => {
			mockEventSources[0].onerror?.();
		});

		expect(result.current.connected).toBe(false);
		expect(result.current.error).toBe("Connection lost");
	});

	it("posts search event for subsequent searches", () => {
		mockPostA2UIEvent.mockResolvedValue(undefined);
		const { result } = renderHook(() => useRecommendations());

		// First search creates EventSource
		act(() => {
			result.current.search("running");
		});

		expect(mockEventSources).toHaveLength(1);

		// Second search posts event
		act(() => {
			result.current.search("ski");
		});

		expect(mockPostA2UIEvent).toHaveBeenCalledWith(
			expect.any(String),
			"search",
			{ query: "ski" },
		);
		// No new EventSource created
		expect(mockEventSources).toHaveLength(1);
	});

	it("reconnect closes old connection and creates new one with last query", () => {
		const { result } = renderHook(() => useRecommendations());

		act(() => {
			result.current.search("running");
		});

		const oldEs = mockEventSources[0];

		act(() => {
			result.current.reconnect();
		});

		expect(oldEs.close).toHaveBeenCalled();
		expect(mockEventSources).toHaveLength(2);
		expect(mockEventSources[1].url).toContain("query=running");
	});

	it("closes EventSource on unmount", () => {
		const { result, unmount } = renderHook(() => useRecommendations());

		act(() => {
			result.current.search("running");
		});

		const es = mockEventSources[0];

		unmount();

		expect(es.close).toHaveBeenCalled();
	});
});
