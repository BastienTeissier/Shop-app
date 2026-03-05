import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProductDetailPage } from "./ProductDetailPage.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetchProduct = vi.fn();
const mockAddItem = vi.fn();

vi.mock("../api.js", () => ({
	productFetch: (...args: unknown[]) => mockFetchProduct(...args),
}));

vi.mock("../context/CartContext.js", () => ({
	useCart: () => ({
		addItem: mockAddItem,
		cart: null,
		sessionId: null,
		loading: false,
		notFound: false,
		error: null,
		totalQuantity: 0,
		setQuantity: vi.fn(),
		removeItem: vi.fn(),
		clearError: vi.fn(),
		clearCart: vi.fn(),
	}),
}));

const SAMPLE_PRODUCT = {
	id: 1,
	title: "Trail Shoe",
	description: "A great shoe for trail running.",
	imageUrl: "https://example.com/shoe.png",
	price: 12999,
};

function renderDetailPage(id = "1", state?: Record<string, unknown> | null) {
	return render(
		<MemoryRouter
			initialEntries={[
				{ pathname: `/products/${id}`, state: state ?? undefined },
			]}
		>
			<Routes>
				<Route path="/products/:id" element={<ProductDetailPage />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProductDetailPage", () => {
	beforeEach(() => {
		mockFetchProduct.mockReset();
		mockAddItem.mockReset();
	});

	it("renders product details for valid ID", async () => {
		mockFetchProduct.mockResolvedValue({
			...SAMPLE_PRODUCT,
			notFound: false,
		});
		renderDetailPage("1");

		await waitFor(() => {
			expect(screen.getByText("Trail Shoe")).toBeInTheDocument();
		});

		expect(screen.getByAltText("Trail Shoe")).toBeInTheDocument();
		expect(
			screen.getByText("A great shoe for trail running."),
		).toBeInTheDocument();
		expect(screen.getByText("$129.99")).toBeInTheDocument();
	});

	it("renders loading state", () => {
		mockFetchProduct.mockReturnValue(new Promise(() => {})); // Never resolves
		renderDetailPage("1");

		expect(screen.getByText("Loading...")).toBeInTheDocument();
	});

	it('renders "Product not found" when notFound', async () => {
		mockFetchProduct.mockResolvedValue({ notFound: true });
		renderDetailPage("1");

		await waitFor(() => {
			expect(screen.getByText("Product not found")).toBeInTheDocument();
		});
	});

	it("add to cart button calls useCart().addItem", async () => {
		const user = userEvent.setup();
		mockFetchProduct.mockResolvedValue({
			...SAMPLE_PRODUCT,
			notFound: false,
		});
		renderDetailPage("1");

		await waitFor(() => {
			expect(screen.getByText("Add to cart")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Add to cart"));
		expect(mockAddItem).toHaveBeenCalledWith(1);
	});

	it("renders back link to homepage", async () => {
		mockFetchProduct.mockResolvedValue({
			...SAMPLE_PRODUCT,
			notFound: false,
		});
		renderDetailPage("1");

		await waitFor(() => {
			expect(screen.getByText("Back to search")).toBeInTheDocument();
		});

		expect(screen.getByText("Back to search")).toHaveAttribute("href", "/");
	});
});
