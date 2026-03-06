import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
	RecommendationDataModel,
	RecommendationProduct,
	TieredListComponent,
} from "@shared/a2ui-types.js";

import type { A2UIRendererContext } from "./types.js";

// Mock the registry to avoid circular dependencies
vi.mock("./registry.js", () => ({
	renderComponent: vi.fn((component, _context, itemData) => {
		const product = itemData as RecommendationProduct;
		return (
			<div key={component.id} data-testid={`product-${product.id}`}>
				{product.title}
			</div>
		);
	}),
}));

// Import after mocking
import { TieredListRenderer } from "./TieredListRenderer.js";

// =============================================================================
// Test Helpers
// =============================================================================

function makeDataModel(
	products: RecommendationProduct[] = [],
): RecommendationDataModel {
	return {
		query: "",
		constraints: {},
		products,
		status: { phase: "idle", message: "Ready" },
		ui: { query: "" },
		cart: { items: [], totalQuantity: 0, totalPrice: 0 },
		suggestions: { chips: [] },
	};
}

function makeProduct(
	overrides: Partial<RecommendationProduct> = {},
): RecommendationProduct {
	return {
		id: 1,
		title: "Test Product",
		description: "A test product",
		imageUrl: "https://example.com/product.png",
		price: 1999,
		highlights: [],
		reasonWhy: [],
		...overrides,
	};
}

function makeComponent(
	overrides: Partial<TieredListComponent> = {},
): TieredListComponent {
	return {
		type: "tieredList",
		id: "test-tiered-list",
		binding: "/products",
		template: [{ type: "productCard", id: "product-card", binding: "." }],
		...overrides,
	};
}

function makeContext(
	products: RecommendationProduct[] = [],
): A2UIRendererContext {
	return {
		dataModel: makeDataModel(products),
		sessionId: "test-session",
		onAction: vi.fn(),
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("TieredListRenderer", () => {
	describe("empty state", () => {
		it("shows empty message when products array is empty", () => {
			const component = makeComponent({
				emptyMessage: "No products found",
			});
			const context = makeContext([]);

			render(<TieredListRenderer component={component} context={context} />);

			expect(screen.getByText("No products found")).toBeInTheDocument();
		});

		it("shows default empty message when none provided", () => {
			const component = makeComponent();
			const context = makeContext([]);

			render(<TieredListRenderer component={component} context={context} />);

			expect(screen.getByText("No items")).toBeInTheDocument();
		});
	});

	describe("tier grouping", () => {
		it("groups products by tier", () => {
			const products = [
				makeProduct({ id: 1, title: "Essential Item", tier: "essential" }),
				makeProduct({ id: 2, title: "Recommended Item", tier: "recommended" }),
				makeProduct({ id: 3, title: "Optional Item", tier: "optional" }),
			];
			const component = makeComponent();
			const context = makeContext(products);

			render(<TieredListRenderer component={component} context={context} />);

			// All tier sections should be present
			expect(screen.getByText("Essential")).toBeInTheDocument();
			expect(screen.getByText("Recommended")).toBeInTheDocument();
			expect(screen.getByText("Optional")).toBeInTheDocument();

			// All products should be rendered
			expect(screen.getByTestId("product-1")).toBeInTheDocument();
			expect(screen.getByTestId("product-2")).toBeInTheDocument();
			expect(screen.getByTestId("product-3")).toBeInTheDocument();
		});

		it("shows tier count in header", () => {
			const products = [
				makeProduct({ id: 1, title: "Essential 1", tier: "essential" }),
				makeProduct({ id: 2, title: "Essential 2", tier: "essential" }),
				makeProduct({ id: 3, title: "Recommended 1", tier: "recommended" }),
			];
			const component = makeComponent();
			const context = makeContext(products);

			render(<TieredListRenderer component={component} context={context} />);

			// Should show counts
			expect(screen.getByText("(2)")).toBeInTheDocument(); // essential count
			expect(screen.getByText("(1)")).toBeInTheDocument(); // recommended count
		});

		it("only shows tiers that have products", () => {
			const products = [
				makeProduct({ id: 1, title: "Essential Only", tier: "essential" }),
			];
			const component = makeComponent();
			const context = makeContext(products);

			render(<TieredListRenderer component={component} context={context} />);

			expect(screen.getByText("Essential")).toBeInTheDocument();
			expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
			expect(screen.queryByText("Optional")).not.toBeInTheDocument();
		});

		it("defaults to recommended tier when tier is undefined", () => {
			const products = [
				makeProduct({ id: 1, title: "No Tier Product" }), // no tier specified
			];
			const component = makeComponent();
			const context = makeContext(products);

			render(<TieredListRenderer component={component} context={context} />);

			expect(screen.getByText("Recommended")).toBeInTheDocument();
			expect(screen.queryByText("Essential")).not.toBeInTheDocument();
		});
	});

	describe("tier ordering", () => {
		it("displays tiers in correct order: essential, recommended, optional", () => {
			const products = [
				makeProduct({ id: 3, title: "Optional", tier: "optional" }),
				makeProduct({ id: 1, title: "Essential", tier: "essential" }),
				makeProduct({ id: 2, title: "Recommended", tier: "recommended" }),
			];
			const component = makeComponent();
			const context = makeContext(products);

			const { container } = render(
				<TieredListRenderer component={component} context={context} />,
			);

			const tierSections = container.querySelectorAll(".tier-section");
			expect(tierSections).toHaveLength(3);

			// Check order by class names
			expect(tierSections[0]).toHaveClass("tier-essential");
			expect(tierSections[1]).toHaveClass("tier-recommended");
			expect(tierSections[2]).toHaveClass("tier-optional");
		});
	});

	describe("tier icons", () => {
		it("displays correct icons for each tier", () => {
			const products = [
				makeProduct({ id: 1, tier: "essential" }),
				makeProduct({ id: 2, tier: "recommended" }),
				makeProduct({ id: 3, tier: "optional" }),
			];
			const component = makeComponent();
			const context = makeContext(products);

			render(<TieredListRenderer component={component} context={context} />);

			// Icons for each tier
			const tierIcons = document.querySelectorAll(".tier-icon");
			expect(tierIcons[0].textContent).toBe("⭐"); // essential
			expect(tierIcons[1].textContent).toBe("👍"); // recommended
			expect(tierIcons[2].textContent).toBe("💡"); // optional
		});
	});
});
