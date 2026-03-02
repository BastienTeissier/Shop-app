import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CartProvider, useCart } from "./CartContext.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetchCartSummary = vi.fn();
const mockUpdateCartItemQuantity = vi.fn();
const mockRemoveCartItem = vi.fn();
const mockAddCartItem = vi.fn();
const mockCreateCart = vi.fn();

vi.mock("../api.js", () => ({
	fetchCartSummary: (...args: unknown[]) => mockFetchCartSummary(...args),
	updateCartItemQuantity: (...args: unknown[]) =>
		mockUpdateCartItemQuantity(...args),
	removeCartItem: (...args: unknown[]) => mockRemoveCartItem(...args),
	addCartItem: (...args: unknown[]) => mockAddCartItem(...args),
	createCart: (...args: unknown[]) => mockCreateCart(...args),
}));

// ---------------------------------------------------------------------------
// Test consumer component
// ---------------------------------------------------------------------------

function TestConsumer() {
	const {
		cart,
		loading,
		notFound,
		error,
		totalQuantity,
		setQuantity,
		removeItem,
	} = useCart();

	if (loading) return <div>Loading...</div>;
	if (notFound) return <div>Not found</div>;
	if (error && !cart) return <div>Error: {error}</div>;

	return (
		<div>
			{error && <div data-testid="error">{error}</div>}
			<div data-testid="total">{totalQuantity}</div>
			{cart?.items.map((item) => (
				<div key={item.productId} data-testid={`item-${item.productId}`}>
					<span data-testid={`qty-${item.productId}`}>{item.quantity}</span>
					<button
						type="button"
						onClick={() => setQuantity(item.productId, item.quantity + 1)}
					>
						+{item.productId}
					</button>
					<button type="button" onClick={() => removeItem(item.productId)}>
						remove-{item.productId}
					</button>
				</div>
			))}
		</div>
	);
}

function renderWithProvider(search = "") {
	return render(
		<MemoryRouter initialEntries={[`/cart${search}`]}>
			<CartProvider>
				<TestConsumer />
			</CartProvider>
		</MemoryRouter>,
	);
}

const SAMPLE_RESPONSE = {
	notFound: false,
	items: [
		{
			productId: 1,
			title: "Shoes",
			imageUrl: "https://example.com/shoes.png",
			unitPriceSnapshot: 9999,
			quantity: 2,
			lineTotal: 19998,
		},
		{
			productId: 2,
			title: "Socks",
			imageUrl: "https://example.com/socks.png",
			unitPriceSnapshot: 1499,
			quantity: 1,
			lineTotal: 1499,
		},
	],
	subtotal: 21497,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CartContext", () => {
	beforeEach(() => {
		mockFetchCartSummary.mockReset();
		mockUpdateCartItemQuantity.mockReset();
		mockRemoveCartItem.mockReset();
		mockAddCartItem.mockReset();
		mockCreateCart.mockReset();
		localStorage.clear();
	});

	it("fetches cart on mount when sessionId in URL", async () => {
		mockFetchCartSummary.mockResolvedValue(SAMPLE_RESPONSE);

		renderWithProvider("?session=123e4567-e89b-12d3-a456-426614174000");

		expect(screen.getByText("Loading...")).toBeInTheDocument();

		await waitFor(() => {
			expect(screen.getByTestId("total")).toHaveTextContent("3");
		});

		expect(mockFetchCartSummary).toHaveBeenCalledWith(
			"123e4567-e89b-12d3-a456-426614174000",
		);
	});

	it("sets notFound when fetchCartSummary returns notFound: true", async () => {
		mockFetchCartSummary.mockResolvedValue({
			notFound: true,
			items: [],
			subtotal: 0,
		});

		renderWithProvider("?session=123e4567-e89b-12d3-a456-426614174000");

		await waitFor(() => {
			expect(screen.getByText("Not found")).toBeInTheDocument();
		});
	});

	it("sets error when fetchCartSummary throws", async () => {
		mockFetchCartSummary.mockRejectedValue(new Error("Network error"));

		renderWithProvider("?session=123e4567-e89b-12d3-a456-426614174000");

		await waitFor(() => {
			expect(
				screen.getByText(/Error: Failed to load cart/),
			).toBeInTheDocument();
		});
	});

	it("setQuantity applies optimistic update then syncs", async () => {
		const user = userEvent.setup();
		mockFetchCartSummary.mockResolvedValue(SAMPLE_RESPONSE);

		const serverResponse = {
			...SAMPLE_RESPONSE,
			items: SAMPLE_RESPONSE.items.map((item) =>
				item.productId === 1
					? { ...item, quantity: 3, lineTotal: 29997 }
					: item,
			),
			subtotal: 31496,
		};
		mockUpdateCartItemQuantity.mockResolvedValue(serverResponse);

		renderWithProvider("?session=123e4567-e89b-12d3-a456-426614174000");

		await waitFor(() => {
			expect(screen.getByTestId("qty-1")).toHaveTextContent("2");
		});

		await user.click(screen.getByText("+1"));

		// Optimistic: quantity immediately 3
		expect(screen.getByTestId("qty-1")).toHaveTextContent("3");

		// After API resolves
		await waitFor(() => {
			expect(mockUpdateCartItemQuantity).toHaveBeenCalledWith(
				"123e4567-e89b-12d3-a456-426614174000",
				1,
				3,
			);
		});
	});

	it("setQuantity rolls back on API error", async () => {
		const user = userEvent.setup();
		mockFetchCartSummary.mockResolvedValue(SAMPLE_RESPONSE);

		// Use deferred rejection so optimistic state is visible before rollback
		let rejectApi!: (err: Error) => void;
		mockUpdateCartItemQuantity.mockReturnValue(
			new Promise((_resolve, reject) => {
				rejectApi = reject;
			}),
		);

		renderWithProvider("?session=123e4567-e89b-12d3-a456-426614174000");

		await waitFor(() => {
			expect(screen.getByTestId("qty-1")).toHaveTextContent("2");
		});

		await user.click(screen.getByText("+1"));

		// Optimistic: 3
		expect(screen.getByTestId("qty-1")).toHaveTextContent("3");

		// Reject the API call
		await act(() => rejectApi(new Error("Server error")));

		// Rollback after error
		await waitFor(() => {
			expect(screen.getByTestId("qty-1")).toHaveTextContent("2");
		});
		expect(screen.getByTestId("error")).toHaveTextContent(
			"Failed to update quantity",
		);
	});

	it("removeItem applies optimistic removal", async () => {
		const user = userEvent.setup();
		mockFetchCartSummary.mockResolvedValue(SAMPLE_RESPONSE);

		const serverResponse = {
			notFound: false,
			items: [SAMPLE_RESPONSE.items[1]],
			subtotal: 1499,
		};
		mockRemoveCartItem.mockResolvedValue(serverResponse);

		renderWithProvider("?session=123e4567-e89b-12d3-a456-426614174000");

		await waitFor(() => {
			expect(screen.getByTestId("item-1")).toBeInTheDocument();
		});

		await user.click(screen.getByText("remove-1"));

		// Optimistic: item 1 removed
		expect(screen.queryByTestId("item-1")).not.toBeInTheDocument();
		expect(screen.getByTestId("item-2")).toBeInTheDocument();

		await waitFor(() => {
			expect(mockRemoveCartItem).toHaveBeenCalledWith(
				"123e4567-e89b-12d3-a456-426614174000",
				1,
			);
		});
	});

	it("removeItem rolls back on API error", async () => {
		const user = userEvent.setup();
		mockFetchCartSummary.mockResolvedValue(SAMPLE_RESPONSE);

		// Use deferred rejection so optimistic state is visible before rollback
		let rejectApi!: (err: Error) => void;
		mockRemoveCartItem.mockReturnValue(
			new Promise((_resolve, reject) => {
				rejectApi = reject;
			}),
		);

		renderWithProvider("?session=123e4567-e89b-12d3-a456-426614174000");

		await waitFor(() => {
			expect(screen.getByTestId("item-1")).toBeInTheDocument();
		});

		await user.click(screen.getByText("remove-1"));

		// Optimistic: removed
		expect(screen.queryByTestId("item-1")).not.toBeInTheDocument();

		// Reject the API call
		await act(() => rejectApi(new Error("Server error")));

		// Rollback
		await waitFor(() => {
			expect(screen.getByTestId("item-1")).toBeInTheDocument();
		});
		expect(screen.getByTestId("error")).toHaveTextContent(
			"Failed to remove item",
		);
	});
});
