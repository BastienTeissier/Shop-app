import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import type {
	A2UIComponent,
	A2UIMessage,
	BeginRenderingMessage,
	DataModelUpdateMessage,
	EndRenderingMessage,
	RecommendationDataModel,
	RecommendationProduct,
	SurfaceUpdateMessage,
} from "@shared/a2ui-types.js";

import { A2UIRenderer } from "./A2UIRenderer.js";

// =============================================================================
// Mock EventSource
// =============================================================================

type MockEventSource = {
	onopen: (() => void) | null;
	onmessage: ((event: { data: string }) => void) | null;
	onerror: (() => void) | null;
	close: Mock;
	readyState: number;
	CONNECTING: 0;
	OPEN: 1;
	CLOSED: 2;
	// Helper methods for tests
	simulateOpen: () => void;
	simulateMessage: (message: A2UIMessage) => void;
	simulateError: () => void;
};

function createMockEventSource(): MockEventSource {
	const instance: MockEventSource = {
		onopen: null,
		onmessage: null,
		onerror: null,
		close: vi.fn(),
		readyState: 0,
		CONNECTING: 0,
		OPEN: 1,
		CLOSED: 2,
		simulateOpen() {
			this.readyState = 1;
			this.onopen?.();
		},
		simulateMessage(message: A2UIMessage) {
			this.onmessage?.({ data: JSON.stringify(message) });
		},
		simulateError() {
			this.readyState = 2;
			this.onerror?.();
		},
	};
	return instance;
}

// =============================================================================
// Test Data Factories
// =============================================================================

function makeRecommendationProduct(
	overrides: Partial<RecommendationProduct> = {},
): RecommendationProduct {
	return {
		id: 1,
		title: "Test Product",
		description: "A great product",
		imageUrl: "https://example.com/product.png",
		price: 1999,
		highlights: [],
		reasonWhy: [],
		...overrides,
	};
}

function makeDataModel(
	overrides: Partial<RecommendationDataModel> = {},
): RecommendationDataModel {
	return {
		query: "",
		constraints: {},
		products: [],
		status: { phase: "idle", message: "Ready" },
		ui: { query: "" },
		cart: { items: [], totalQuantity: 0, totalPrice: 0 },
		suggestions: { chips: [] },
		...overrides,
	};
}

function makeBeginRenderingMessage(): BeginRenderingMessage {
	return { type: "beginRendering" };
}

function makeEndRenderingMessage(): EndRenderingMessage {
	return { type: "endRendering" };
}

function makeSurfaceUpdateMessage(
	components: A2UIComponent[],
): SurfaceUpdateMessage {
	return {
		type: "surfaceUpdate",
		surfaceId: "product-recommendations",
		components,
	};
}

function makeDataModelUpdateMessage(
	path: string,
	value: unknown,
): DataModelUpdateMessage {
	return {
		type: "dataModelUpdate",
		surfaceId: "product-recommendations",
		path,
		value,
	};
}

// =============================================================================
// Test Setup
// =============================================================================

let mockEventSource: MockEventSource;
let mockFetch: Mock;

beforeEach(() => {
	mockEventSource = createMockEventSource();
	vi.stubGlobal(
		"EventSource",
		vi.fn(() => mockEventSource),
	);

	mockFetch = vi.fn().mockResolvedValue({
		ok: true,
		text: () => Promise.resolve(""),
	});
	vi.stubGlobal("fetch", mockFetch);
});

// =============================================================================
// Tests
// =============================================================================

describe("A2UIRenderer", () => {
	describe("test_renders_surface_from_messages", () => {
		it("renders components from surface update message", async () => {
			render(<A2UIRenderer sessionId="test-session" />);

			// Initially shows connecting state
			expect(
				screen.getByText("Connecting to recommendations..."),
			).toBeInTheDocument();

			// Simulate SSE connection and messages
			act(() => {
				mockEventSource.simulateOpen();
			});

			const surface: A2UIComponent[] = [
				{
					type: "text",
					id: "title",
					content: "Welcome to Recommendations",
				},
				{
					type: "text",
					id: "status",
					binding: "/status/message",
				},
			];

			act(() => {
				mockEventSource.simulateMessage(makeBeginRenderingMessage());
				mockEventSource.simulateMessage(makeSurfaceUpdateMessage(surface));
				mockEventSource.simulateMessage(
					makeDataModelUpdateMessage("/", makeDataModel()),
				);
				mockEventSource.simulateMessage(makeEndRenderingMessage());
			});

			// Components should render
			await waitFor(() => {
				expect(
					screen.getByText("Welcome to Recommendations"),
				).toBeInTheDocument();
			});
			expect(screen.getByText("Ready")).toBeInTheDocument();
		});

		it("shows error state when connection fails", async () => {
			render(<A2UIRenderer sessionId="test-session" />);

			act(() => {
				mockEventSource.simulateError();
			});

			await waitFor(() => {
				expect(
					screen.getByText("Failed to connect. Please try again."),
				).toBeInTheDocument();
			});
		});
	});

	describe("test_data_binding_resolution", () => {
		it("resolves data bindings and displays correct values", async () => {
			render(<A2UIRenderer sessionId="test-session" />);

			act(() => {
				mockEventSource.simulateOpen();
			});

			const surface: A2UIComponent[] = [
				{ type: "text", id: "query-display", binding: "/query" },
				{ type: "text", id: "status-display", binding: "/status/message" },
				{ type: "text", id: "cart-count", binding: "/cart/totalQuantity" },
			];

			const dataModel = makeDataModel({
				query: "running shoes",
				status: { phase: "completed", message: "Found 5 products" },
				cart: { items: [], totalQuantity: 3, totalPrice: 5999 },
			});

			act(() => {
				mockEventSource.simulateMessage(makeBeginRenderingMessage());
				mockEventSource.simulateMessage(makeSurfaceUpdateMessage(surface));
				mockEventSource.simulateMessage(
					makeDataModelUpdateMessage("/", dataModel),
				);
				mockEventSource.simulateMessage(makeEndRenderingMessage());
			});

			await waitFor(() => {
				expect(screen.getByText("running shoes")).toBeInTheDocument();
			});
			expect(screen.getByText("Found 5 products")).toBeInTheDocument();
			expect(screen.getByText("3")).toBeInTheDocument();
		});

		it("updates display when data model changes", async () => {
			render(<A2UIRenderer sessionId="test-session" />);

			act(() => {
				mockEventSource.simulateOpen();
			});

			const surface: A2UIComponent[] = [
				{ type: "text", id: "status-display", binding: "/status/message" },
			];

			act(() => {
				mockEventSource.simulateMessage(makeBeginRenderingMessage());
				mockEventSource.simulateMessage(makeSurfaceUpdateMessage(surface));
				mockEventSource.simulateMessage(
					makeDataModelUpdateMessage(
						"/",
						makeDataModel({
							status: { phase: "searching", message: "Searching..." },
						}),
					),
				);
				mockEventSource.simulateMessage(makeEndRenderingMessage());
			});

			await waitFor(() => {
				expect(screen.getByText("Searching...")).toBeInTheDocument();
			});

			// Simulate incremental update
			act(() => {
				mockEventSource.simulateMessage(
					makeDataModelUpdateMessage("/status", {
						phase: "completed",
						message: "Done!",
					}),
				);
			});

			await waitFor(() => {
				expect(screen.getByText("Done!")).toBeInTheDocument();
			});
			expect(screen.queryByText("Searching...")).not.toBeInTheDocument();
		});
	});

	describe("test_list_template_rendering", () => {
		it("renders ProductCard for each product in list", async () => {
			render(<A2UIRenderer sessionId="test-session" />);

			act(() => {
				mockEventSource.simulateOpen();
			});

			const surface: A2UIComponent[] = [
				{
					type: "list",
					id: "product-list",
					binding: "/products",
					emptyMessage: "No products found",
					template: [
						{
							type: "productCard",
							id: "product-card",
							binding: ".",
						},
					],
				},
			];

			const products = [
				makeRecommendationProduct({
					id: 1,
					title: "Running Shoe",
					price: 9999,
				}),
				makeRecommendationProduct({ id: 2, title: "Trail Shoe", price: 12999 }),
				makeRecommendationProduct({
					id: 3,
					title: "Training Shoe",
					price: 7999,
				}),
			];

			act(() => {
				mockEventSource.simulateMessage(makeBeginRenderingMessage());
				mockEventSource.simulateMessage(makeSurfaceUpdateMessage(surface));
				mockEventSource.simulateMessage(
					makeDataModelUpdateMessage("/", makeDataModel({ products })),
				);
				mockEventSource.simulateMessage(makeEndRenderingMessage());
			});

			// All products should be rendered
			await waitFor(() => {
				expect(screen.getByText("Running Shoe")).toBeInTheDocument();
			});
			expect(screen.getByText("Trail Shoe")).toBeInTheDocument();
			expect(screen.getByText("Training Shoe")).toBeInTheDocument();

			// Prices should be formatted
			expect(screen.getByText("$99.99")).toBeInTheDocument();
			expect(screen.getByText("$129.99")).toBeInTheDocument();
			expect(screen.getByText("$79.99")).toBeInTheDocument();
		});

		it("shows empty message when products array is empty", async () => {
			render(<A2UIRenderer sessionId="test-session" />);

			act(() => {
				mockEventSource.simulateOpen();
			});

			const surface: A2UIComponent[] = [
				{
					type: "list",
					id: "product-list",
					binding: "/products",
					emptyMessage: "No products found. Try a different search.",
					template: [{ type: "productCard", id: "product-card", binding: "." }],
				},
			];

			act(() => {
				mockEventSource.simulateMessage(makeBeginRenderingMessage());
				mockEventSource.simulateMessage(makeSurfaceUpdateMessage(surface));
				mockEventSource.simulateMessage(
					makeDataModelUpdateMessage("/", makeDataModel({ products: [] })),
				);
				mockEventSource.simulateMessage(makeEndRenderingMessage());
			});

			await waitFor(() => {
				expect(
					screen.getByText("No products found. Try a different search."),
				).toBeInTheDocument();
			});
		});
	});

	describe("test_button_action_posts_event", () => {
		it("posts action to event endpoint when button is clicked", async () => {
			const user = userEvent.setup();
			render(
				<A2UIRenderer
					sessionId="test-session-123"
					eventEndpoint="/api/a2ui/event"
				/>,
			);

			act(() => {
				mockEventSource.simulateOpen();
			});

			const surface: A2UIComponent[] = [
				{
					type: "button",
					id: "search-btn",
					label: "Search",
					action: "search",
					payload: { query: "test query" },
				},
			];

			act(() => {
				mockEventSource.simulateMessage(makeBeginRenderingMessage());
				mockEventSource.simulateMessage(makeSurfaceUpdateMessage(surface));
				mockEventSource.simulateMessage(
					makeDataModelUpdateMessage("/", makeDataModel()),
				);
				mockEventSource.simulateMessage(makeEndRenderingMessage());
			});

			await waitFor(() => {
				expect(
					screen.getByRole("button", { name: "Search" }),
				).toBeInTheDocument();
			});

			await user.click(screen.getByRole("button", { name: "Search" }));

			expect(mockFetch).toHaveBeenCalledWith("/api/a2ui/event", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sessionId: "test-session-123",
					action: "search",
					payload: { query: "test query" },
				}),
			});
		});

		it("posts addToCart action when ProductCard button is clicked", async () => {
			const user = userEvent.setup();
			render(
				<A2UIRenderer
					sessionId="test-session-456"
					eventEndpoint="/api/a2ui/event"
				/>,
			);

			act(() => {
				mockEventSource.simulateOpen();
			});

			const surface: A2UIComponent[] = [
				{
					type: "list",
					id: "product-list",
					binding: "/products",
					template: [{ type: "productCard", id: "product-card", binding: "." }],
				},
			];

			const products = [
				makeRecommendationProduct({ id: 42, title: "Test Shoe" }),
			];

			act(() => {
				mockEventSource.simulateMessage(makeBeginRenderingMessage());
				mockEventSource.simulateMessage(makeSurfaceUpdateMessage(surface));
				mockEventSource.simulateMessage(
					makeDataModelUpdateMessage("/", makeDataModel({ products })),
				);
				mockEventSource.simulateMessage(makeEndRenderingMessage());
			});

			await waitFor(() => {
				expect(screen.getByText("Test Shoe")).toBeInTheDocument();
			});

			// Click "Add to cart" button
			await user.click(screen.getByRole("button", { name: "Add to cart" }));

			expect(mockFetch).toHaveBeenCalledWith("/api/a2ui/event", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sessionId: "test-session-456",
					action: "addToCart",
					payload: { productId: 42 },
				}),
			});
		});
	});

	describe("SSE lifecycle", () => {
		it("closes EventSource on unmount", () => {
			const { unmount } = render(<A2UIRenderer sessionId="test-session" />);

			act(() => {
				mockEventSource.simulateOpen();
			});

			unmount();

			expect(mockEventSource.close).toHaveBeenCalled();
		});

		it("includes session and query params in SSE URL", () => {
			render(
				<A2UIRenderer
					sessionId="my-session-id"
					initialQuery="running gear"
					streamEndpoint="/api/a2ui/stream"
				/>,
			);

			expect(vi.mocked(EventSource)).toHaveBeenCalledWith(
				expect.stringContaining("session=my-session-id"),
			);
			expect(vi.mocked(EventSource)).toHaveBeenCalledWith(
				expect.stringContaining("query=running+gear"),
			);
		});
	});
});
