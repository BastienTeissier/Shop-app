import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrderConfirmationPage } from "./OrderConfirmationPage.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetchOrder = vi.fn();

vi.mock("../api.js", () => ({
	orderFetch: (...args: unknown[]) => mockFetchOrder(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderConfirmationPage(reference = "test-uuid") {
	return render(
		<MemoryRouter initialEntries={[`/orders/${reference}`]}>
			<Routes>
				<Route path="/orders/:reference" element={<OrderConfirmationPage />} />
			</Routes>
		</MemoryRouter>,
	);
}

const SAMPLE_ORDER = {
	notFound: false as const,
	reference: "test-uuid",
	customerName: "John Doe",
	customerEmail: "john@example.com",
	items: [
		{
			productId: 1,
			title: "Running Shoes",
			imageUrl: "https://example.com/shoes.png",
			unitPrice: 9999,
			quantity: 2,
			lineTotal: 19998,
		},
		{
			productId: 2,
			title: "Running Socks",
			imageUrl: "https://example.com/socks.png",
			unitPrice: 1499,
			quantity: 1,
			lineTotal: 1499,
		},
	],
	totalPrice: 21497,
	createdAt: "2026-02-22T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OrderConfirmationPage", () => {
	beforeEach(() => {
		mockFetchOrder.mockReset();
	});

	it("renders order confirmation with all details", async () => {
		mockFetchOrder.mockResolvedValue(SAMPLE_ORDER);
		renderConfirmationPage();

		expect(
			await screen.findByText("Order placed successfully"),
		).toBeInTheDocument();
		expect(screen.getByText("test-uuid")).toBeInTheDocument();
		expect(screen.getByText("John Doe")).toBeInTheDocument();
		expect(screen.getByText("john@example.com")).toBeInTheDocument();
		expect(screen.getByText("Running Shoes")).toBeInTheDocument();
		expect(screen.getByText("Running Socks")).toBeInTheDocument();
		expect(screen.getByText("$214.97")).toBeInTheDocument();
	});

	it("renders loading state", () => {
		mockFetchOrder.mockReturnValue(new Promise(() => {}));
		renderConfirmationPage();

		expect(screen.getByText("Loading...")).toBeInTheDocument();
	});

	it("renders not-found state", async () => {
		mockFetchOrder.mockResolvedValue({ notFound: true });
		renderConfirmationPage();

		expect(await screen.findByText("Order not found")).toBeInTheDocument();
	});

	it('renders "Continue shopping" link', async () => {
		mockFetchOrder.mockResolvedValue(SAMPLE_ORDER);
		renderConfirmationPage();

		const link = await screen.findByText("Continue shopping");
		expect(link).toHaveAttribute("href", "/");
	});
});
