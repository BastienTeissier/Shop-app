import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CartPage } from "./CartPage.js";

// ---------------------------------------------------------------------------
// Mock useCart
// ---------------------------------------------------------------------------

const mockSetQuantity = vi.fn();
const mockRemoveItem = vi.fn();
const mockUseCart = vi.fn();

vi.mock("../context/CartContext.js", () => ({
	useCart: () => mockUseCart(),
}));

function renderCartPage() {
	return render(
		<MemoryRouter initialEntries={["/cart?session=test-session"]}>
			<CartPage />
		</MemoryRouter>,
	);
}

const SAMPLE_CART = {
	items: [
		{
			productId: 1,
			title: "Running Shoes",
			imageUrl: "https://example.com/shoes.png",
			unitPriceSnapshot: 9999,
			quantity: 2,
			lineTotal: 19998,
		},
		{
			productId: 2,
			title: "Running Socks",
			imageUrl: "https://example.com/socks.png",
			unitPriceSnapshot: 1499,
			quantity: 1,
			lineTotal: 1499,
		},
	],
	subtotal: 21497,
};

function mockCartState(overrides: Record<string, unknown> = {}) {
	mockUseCart.mockReturnValue({
		cart: SAMPLE_CART,
		sessionId: "test-session",
		loading: false,
		notFound: false,
		error: null,
		totalQuantity: 3,
		setQuantity: mockSetQuantity,
		removeItem: mockRemoveItem,
		addItem: vi.fn(),
		clearError: vi.fn(),
		...overrides,
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CartPage", () => {
	beforeEach(() => {
		mockUseCart.mockReset();
		mockSetQuantity.mockReset();
		mockRemoveItem.mockReset();
	});

	it("renders quantity controls for each item", () => {
		mockCartState();
		renderCartPage();

		// Each item has +/- buttons
		const decreaseButtons = screen.getAllByText("-");
		const increaseButtons = screen.getAllByText("+");
		expect(decreaseButtons).toHaveLength(2);
		expect(increaseButtons).toHaveLength(2);

		// Quantity values visible
		expect(screen.getByText("2")).toBeInTheDocument(); // Shoes qty
		expect(screen.getByText("1")).toBeInTheDocument(); // Socks qty
	});

	it("calls setQuantity with incremented value on + click", async () => {
		const user = userEvent.setup();
		mockCartState();
		renderCartPage();

		const increaseButtons = screen.getAllByText("+");
		// Click + on first item (Shoes, qty 2 -> 3)
		await user.click(increaseButtons[0]);

		expect(mockSetQuantity).toHaveBeenCalledWith(1, 3);
	});

	it("calls setQuantity with decremented value on - click", async () => {
		const user = userEvent.setup();
		mockCartState();
		renderCartPage();

		const decreaseButtons = screen.getAllByText("-");
		// Click - on first item (Shoes, qty 2 -> 1)
		await user.click(decreaseButtons[0]);

		expect(mockSetQuantity).toHaveBeenCalledWith(1, 1);
	});

	it("calls removeItem on Remove button click", async () => {
		const user = userEvent.setup();
		mockCartState();
		renderCartPage();

		const removeButtons = screen.getAllByText("Remove");
		await user.click(removeButtons[0]);

		expect(mockRemoveItem).toHaveBeenCalledWith(1);
	});

	it('renders "Proceed to checkout" link to /checkout', () => {
		mockCartState();
		renderCartPage();

		const link = screen.getByText("Proceed to checkout");
		expect(link).toHaveAttribute("href", "/checkout?session=test-session");
	});

	it("shows error banner when context has error", () => {
		mockCartState({ error: "Something went wrong" });
		renderCartPage();

		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
	});

	it("renders loading, notFound, empty, error states", () => {
		// Loading
		mockCartState({ loading: true, cart: null });
		const { unmount: u1 } = renderCartPage();
		expect(screen.getByText("Loading...")).toBeInTheDocument();
		u1();

		// Not found
		mockCartState({ notFound: true, cart: null });
		const { unmount: u2 } = renderCartPage();
		expect(screen.getByText("Cart not found")).toBeInTheDocument();
		u2();

		// Error without cart
		mockCartState({ error: "Network error", cart: null });
		const { unmount: u3 } = renderCartPage();
		expect(
			screen.getByText("Something went wrong. Please try again later."),
		).toBeInTheDocument();
		u3();

		// Empty cart
		mockCartState({ cart: { items: [], subtotal: 0 } });
		renderCartPage();
		expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
	});
});
