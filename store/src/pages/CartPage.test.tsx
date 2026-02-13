import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartPage } from "./CartPage";

const mockFetchCartSummary = vi.fn();

vi.mock("../api", () => ({
	fetchCartSummary: (...args: unknown[]) => mockFetchCartSummary(...args),
}));

function renderCartPage(search = "") {
	return render(
		<MemoryRouter initialEntries={[`/cart${search}`]}>
			<CartPage />
		</MemoryRouter>,
	);
}

describe("CartPage", () => {
	beforeEach(() => {
		mockFetchCartSummary.mockReset();
	});

	it("renders cart items when session is valid", async () => {
		mockFetchCartSummary.mockResolvedValue({
			notFound: false,
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
		});

		renderCartPage("?session=123e4567-e89b-12d3-a456-426614174000");

		expect(await screen.findByText("Running Shoes")).toBeInTheDocument();
		expect(screen.getByText("Running Socks")).toBeInTheDocument();
		// Price + quantity rendered together: "$99.99 × 2"
		expect(screen.getByText(/\$99\.99/)).toBeInTheDocument();
		expect(screen.getByText(/× 2/)).toBeInTheDocument();
		// Line totals
		expect(screen.getByText("$199.98")).toBeInTheDocument();
		// $14.99 appears twice (unit price and line total for qty 1)
		expect(screen.getAllByText("$14.99")).toHaveLength(2);
		// Subtotal
		expect(screen.getByText("$214.97")).toBeInTheDocument();
		expect(screen.getByText("Subtotal")).toBeInTheDocument();
	});

	it('renders "Cart not found" when response has notFound: true', async () => {
		mockFetchCartSummary.mockResolvedValue({
			notFound: true,
			items: [],
			subtotal: 0,
		});

		renderCartPage("?session=00000000-0000-0000-0000-000000000000");

		expect(await screen.findByText("Cart not found")).toBeInTheDocument();
	});

	it('renders "Your cart is empty" when cart has zero items', async () => {
		mockFetchCartSummary.mockResolvedValue({
			notFound: false,
			items: [],
			subtotal: 0,
		});

		renderCartPage("?session=123e4567-e89b-12d3-a456-426614174000");

		expect(await screen.findByText("Your cart is empty")).toBeInTheDocument();
	});

	it('renders "Cart not found" when no session param in URL', () => {
		renderCartPage();

		expect(screen.getByText("Cart not found")).toBeInTheDocument();
		expect(mockFetchCartSummary).not.toHaveBeenCalled();
	});
});
