import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutPage } from "./CheckoutPage.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockClearCart = vi.fn();
const mockUseCart = vi.fn();
const mockNavigate = vi.fn();
const mockSubmitOrder = vi.fn();

vi.mock("../context/CartContext.js", () => ({
	useCart: () => mockUseCart(),
}));

vi.mock("../api.js", () => ({
	submitOrder: (...args: unknown[]) => mockSubmitOrder(...args),
}));

vi.mock("react-router-dom", async () => {
	const actual = await vi.importActual("react-router-dom");
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderCheckoutPage() {
	return render(
		<MemoryRouter initialEntries={["/checkout?session=test-session"]}>
			<CheckoutPage />
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
		setQuantity: vi.fn(),
		removeItem: vi.fn(),
		addItem: vi.fn(),
		clearError: vi.fn(),
		clearCart: mockClearCart,
		...overrides,
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CheckoutPage", () => {
	beforeEach(() => {
		mockUseCart.mockReset();
		mockClearCart.mockReset();
		mockNavigate.mockReset();
		mockSubmitOrder.mockReset();
	});

	it("renders order review with cart items", () => {
		mockCartState();
		renderCheckoutPage();

		expect(screen.getByText("Running Shoes")).toBeInTheDocument();
		expect(screen.getByText("Running Socks")).toBeInTheDocument();
		expect(screen.getByText("$214.97")).toBeInTheDocument();
	});

	it("renders form with name and email inputs", () => {
		mockCartState();
		renderCheckoutPage();

		expect(screen.getByLabelText("Name")).toBeInTheDocument();
		expect(screen.getByLabelText("Email")).toBeInTheDocument();
		expect(screen.getByText("Place Order")).toBeInTheDocument();
	});

	it("disables submit button when fields empty", () => {
		mockCartState();
		renderCheckoutPage();

		const button = screen.getByText("Place Order");
		expect(button).toBeDisabled();
	});

	it("enables submit button when both fields valid", async () => {
		const user = userEvent.setup();
		mockCartState();
		renderCheckoutPage();

		await user.type(screen.getByLabelText("Name"), "John Doe");
		await user.type(screen.getByLabelText("Email"), "john@example.com");

		const button = screen.getByText("Place Order");
		expect(button).toBeEnabled();
	});

	it("calls submitOrder and navigates on success", async () => {
		const user = userEvent.setup();
		mockCartState();
		mockSubmitOrder.mockResolvedValue({ reference: "test-uuid" });
		renderCheckoutPage();

		await user.type(screen.getByLabelText("Name"), "John Doe");
		await user.type(screen.getByLabelText("Email"), "john@example.com");
		await user.click(screen.getByText("Place Order"));

		expect(mockSubmitOrder).toHaveBeenCalledWith(
			"test-session",
			"John Doe",
			"john@example.com",
		);
		expect(mockClearCart).toHaveBeenCalled();
		expect(mockNavigate).toHaveBeenCalledWith("/orders/test-uuid");
	});

	it("shows error message on submit failure", async () => {
		const user = userEvent.setup();
		mockCartState();
		mockSubmitOrder.mockRejectedValue(new Error("Server error"));
		renderCheckoutPage();

		await user.type(screen.getByLabelText("Name"), "John Doe");
		await user.type(screen.getByLabelText("Email"), "john@example.com");
		await user.click(screen.getByText("Place Order"));

		expect(
			screen.getByText("Something went wrong. Please try again."),
		).toBeInTheDocument();
		// Form data preserved
		expect(screen.getByLabelText("Name")).toHaveValue("John Doe");
		expect(screen.getByLabelText("Email")).toHaveValue("john@example.com");
	});

	it("renders empty cart message when cart has no items", () => {
		mockCartState({ cart: { items: [], subtotal: 0 } });
		renderCheckoutPage();

		expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
		expect(screen.queryByText("Place Order")).not.toBeInTheDocument();
	});

	it("renders empty cart message when notFound", () => {
		mockCartState({ notFound: true, cart: null });
		renderCheckoutPage();

		expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
		expect(screen.queryByText("Place Order")).not.toBeInTheDocument();
	});
});
