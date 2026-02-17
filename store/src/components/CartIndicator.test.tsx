import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartIndicator } from "./CartIndicator";

const mockUseCart = vi.fn();

vi.mock("../context/CartContext", () => ({
	useCart: () => mockUseCart(),
}));

function renderIndicator() {
	return render(
		<MemoryRouter>
			<CartIndicator />
		</MemoryRouter>,
	);
}

describe("CartIndicator", () => {
	beforeEach(() => {
		mockUseCart.mockReset();
	});

	it("shows total quantity and formatted subtotal", () => {
		mockUseCart.mockReturnValue({
			cart: {
				items: [
					{ productId: 1, quantity: 2, lineTotal: 10000 },
					{ productId: 2, quantity: 1, lineTotal: 5000 },
				],
				subtotal: 15000,
			},
			sessionId: "test-session-id",
			totalQuantity: 3,
			error: null,
		});

		renderIndicator();

		expect(screen.getByText(/3 items/)).toBeInTheDocument();
		expect(screen.getByText(/\$150\.00/)).toBeInTheDocument();
	});

	it("hidden when cart is null", () => {
		mockUseCart.mockReturnValue({
			cart: null,
			sessionId: null,
			totalQuantity: 0,
			error: null,
		});

		const { container } = renderIndicator();

		expect(container.querySelector(".cart-indicator")).not.toBeInTheDocument();
	});

	it("links to cart page with session param", () => {
		mockUseCart.mockReturnValue({
			cart: {
				items: [{ productId: 1, quantity: 1, lineTotal: 5000 }],
				subtotal: 5000,
			},
			sessionId: "abc-123",
			totalQuantity: 1,
			error: null,
		});

		renderIndicator();

		const link = screen.getByRole("link");
		expect(link).toHaveAttribute("href", "/cart?session=abc-123");
	});
});
