import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomePage } from "./HomePage.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSearch = vi.fn();
const mockRefine = vi.fn();
const mockReconnect = vi.fn();
const mockAddItem = vi.fn();

const mockUseRecommendations = vi.fn();
const mockUseCart = vi.fn();

vi.mock("../hooks/useRecommendations.js", () => ({
	useRecommendations: () => mockUseRecommendations(),
}));

vi.mock("../context/CartContext.js", () => ({
	useCart: () => mockUseCart(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
	const actual = await vi.importActual("react-router-dom");
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

function mockRecommendationsState(overrides: Record<string, unknown> = {}) {
	mockUseRecommendations.mockReturnValue({
		products: [],
		status: { phase: "idle", message: "Ready to search" },
		suggestions: [],
		connected: true,
		error: null,
		search: mockSearch,
		refine: mockRefine,
		reconnect: mockReconnect,
		...overrides,
	});
}

function mockCartState() {
	mockUseCart.mockReturnValue({
		cart: null,
		sessionId: null,
		loading: false,
		notFound: false,
		error: null,
		totalQuantity: 0,
		setQuantity: vi.fn(),
		removeItem: vi.fn(),
		addItem: mockAddItem,
		clearError: vi.fn(),
		clearCart: vi.fn(),
	});
}

function renderHomePage() {
	return render(
		<MemoryRouter initialEntries={["/"]}>
			<HomePage />
		</MemoryRouter>,
	);
}

const SAMPLE_PRODUCTS = [
	{
		id: 1,
		title: "Trail Shoe",
		description: "Great shoe",
		imageUrl: "https://example.com/shoe.png",
		price: 12999,
		highlights: ["Waterproof"],
		reasonWhy: ["Great for trails"],
		tier: "essential",
	},
	{
		id: 2,
		title: "Running Socks",
		description: "Comfy socks",
		imageUrl: "https://example.com/socks.png",
		price: 1499,
		highlights: [],
		reasonWhy: [],
		tier: "recommended",
	},
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HomePage", () => {
	beforeEach(() => {
		mockSearch.mockReset();
		mockRefine.mockReset();
		mockReconnect.mockReset();
		mockAddItem.mockReset();
		mockNavigate.mockReset();
		mockUseRecommendations.mockReset();
		mockUseCart.mockReset();
		mockCartState();
	});

	it("renders search bar and prompt buttons on initial load", () => {
		mockRecommendationsState();
		renderHomePage();

		expect(
			screen.getByPlaceholderText("Search for products..."),
		).toBeInTheDocument();
		expect(screen.getByText("Search")).toBeInTheDocument();
		expect(screen.getByText("Running gear")).toBeInTheDocument();
		expect(screen.getByText("Ski equipment")).toBeInTheDocument();
		expect(screen.getByText("Hiking essentials")).toBeInTheDocument();
		expect(screen.getByText("Beach gear")).toBeInTheDocument();
		expect(screen.getByText("Cycling setup")).toBeInTheDocument();
	});

	it("clicking prompt button triggers search", async () => {
		const user = userEvent.setup();
		mockRecommendationsState();
		renderHomePage();

		await user.click(screen.getByText("Running gear"));
		expect(mockSearch).toHaveBeenCalledWith("Running gear");
	});

	it("typing query and submitting triggers search", async () => {
		const user = userEvent.setup();
		mockRecommendationsState();
		renderHomePage();

		const input = screen.getByPlaceholderText("Search for products...");
		await user.type(input, "trail shoes");
		await user.click(screen.getByText("Search"));

		expect(mockSearch).toHaveBeenCalledWith("trail shoes");
	});

	it("shows loading indicator during search", async () => {
		const user = userEvent.setup();
		mockRecommendationsState({
			status: { phase: "searching", message: "Searching..." },
		});
		renderHomePage();

		await user.click(screen.getByText("Running gear"));

		expect(screen.getByText("Searching...")).toBeInTheDocument();
	});

	it("renders products in tiered grid when completed", async () => {
		const user = userEvent.setup();
		mockRecommendationsState({
			products: SAMPLE_PRODUCTS,
			status: { phase: "completed", message: "Done" },
		});
		renderHomePage();

		await user.click(screen.getByText("Running gear"));

		expect(screen.getByText("Trail Shoe")).toBeInTheDocument();
		expect(screen.getByText("Essential")).toBeInTheDocument();
	});

	it("shows 'No products found' for empty completed results", async () => {
		const user = userEvent.setup();
		mockRecommendationsState({
			products: [],
			status: { phase: "completed", message: "Done" },
		});
		renderHomePage();

		// Trigger search to set hasSearched
		await user.click(screen.getByText("Running gear"));

		// After search, the component re-renders with current mock state
		expect(
			screen.getByText("No products found. Try different search terms."),
		).toBeInTheDocument();
	});

	it("shows connection error with Reconnect button", async () => {
		const user = userEvent.setup();
		mockRecommendationsState({
			connected: false,
			error: "Connection lost",
		});
		renderHomePage();

		// Trigger search to set hasSearched
		await user.click(screen.getByText("Running gear"));

		expect(screen.getByText("Connection lost")).toBeInTheDocument();
		expect(screen.getByText("Reconnect")).toBeInTheDocument();
	});

	it("clicking Reconnect calls reconnect()", async () => {
		const user = userEvent.setup();
		mockRecommendationsState({
			connected: false,
			error: "Connection lost",
		});
		renderHomePage();

		await user.click(screen.getByText("Running gear"));
		await user.click(screen.getByText("Reconnect"));

		expect(mockReconnect).toHaveBeenCalled();
	});

	it("product card click navigates to /products/:id with route state", async () => {
		const user = userEvent.setup();
		mockRecommendationsState({
			products: SAMPLE_PRODUCTS,
			status: { phase: "completed", message: "Done" },
		});
		renderHomePage();

		// Trigger search first
		await user.click(screen.getByText("Running gear"));

		// Click on product card
		await user.click(screen.getByAltText("Trail Shoe"));

		expect(mockNavigate).toHaveBeenCalledWith("/products/1", {
			state: { product: SAMPLE_PRODUCTS[0] },
		});
	});

	it("add to cart on product card calls useCart().addItem", async () => {
		const user = userEvent.setup();
		mockRecommendationsState({
			products: SAMPLE_PRODUCTS,
			status: { phase: "completed", message: "Done" },
		});
		renderHomePage();

		// Trigger search first
		await user.click(screen.getByText("Running gear"));

		// Click "Add to cart" on first product
		const addButtons = screen.getAllByText("Add to cart");
		await user.click(addButtons[0]);

		expect(mockAddItem).toHaveBeenCalledWith(1);
	});

	describe("chip refinement", () => {
		const SUGGESTION_CHIPS = [
			{ label: "Men", kind: "gender" },
			{ label: "Waterproof", kind: "feature" },
		];

		it("chip click calls refine, not search", async () => {
			const user = userEvent.setup();
			mockRecommendationsState({
				products: SAMPLE_PRODUCTS,
				suggestions: SUGGESTION_CHIPS,
				status: { phase: "completed", message: "Done" },
			});
			renderHomePage();

			// Trigger initial search to set hasSearched and query
			const input = screen.getByPlaceholderText("Search for products...");
			await user.type(input, "jacket");
			await user.click(screen.getByText("Search"));
			mockSearch.mockReset();

			// Click chip
			await user.click(screen.getByText("Men"));

			expect(mockRefine).toHaveBeenCalledWith("jacket Men");
			expect(mockSearch).not.toHaveBeenCalled();
		});

		it("chip click updates search bar text", async () => {
			const user = userEvent.setup();
			mockRecommendationsState({
				products: SAMPLE_PRODUCTS,
				suggestions: SUGGESTION_CHIPS,
				status: { phase: "completed", message: "Done" },
			});
			renderHomePage();

			const input = screen.getByPlaceholderText("Search for products...");
			await user.type(input, "jacket");
			await user.click(screen.getByText("Search"));

			await user.click(screen.getByText("Men"));

			expect(input).toHaveValue("jacket Men");
		});

		it("manual submit still calls search, not refine", async () => {
			const user = userEvent.setup();
			mockRecommendationsState({
				products: SAMPLE_PRODUCTS,
				suggestions: SUGGESTION_CHIPS,
				status: { phase: "completed", message: "Done" },
			});
			renderHomePage();

			const input = screen.getByPlaceholderText("Search for products...");
			await user.clear(input);
			await user.type(input, "running shoes");
			await user.click(screen.getByText("Search"));

			expect(mockSearch).toHaveBeenCalledWith("running shoes");
			expect(mockRefine).not.toHaveBeenCalled();
		});

		it("progressive refinement accumulates query", async () => {
			const user = userEvent.setup();
			mockRecommendationsState({
				products: SAMPLE_PRODUCTS,
				suggestions: SUGGESTION_CHIPS,
				status: { phase: "completed", message: "Done" },
			});
			renderHomePage();

			// Initial search
			const input = screen.getByPlaceholderText("Search for products...");
			await user.type(input, "jacket");
			await user.click(screen.getByText("Search"));

			// First chip click
			await user.click(screen.getByText("Men"));
			expect(mockRefine).toHaveBeenCalledWith("jacket Men");

			// Second chip click — use role to disambiguate from product highlight
			const chipButtons = screen.getAllByRole("button");
			const waterproofChip = chipButtons.find(
				(btn) =>
					btn.classList.contains("suggestion-chip") &&
					btn.textContent === "Waterproof",
			);
			expect(waterproofChip).toBeDefined();
			await user.click(waterproofChip!);
			expect(mockRefine).toHaveBeenCalledWith("jacket Men Waterproof");
		});
	});
});
