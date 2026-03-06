import { describe, expect, it, vi } from "vitest";

import type { FormattedQuery } from "../src/agent/schemas/index.js";

// Mock generateObject before imports
const mockGenerateObject = vi.fn();
vi.mock("ai", () => ({
	generateObject: mockGenerateObject,
}));

// Import after mocking
const { buildProductSummary, runRefinementAgent } = await import(
	"../src/agent/refinement-agent.js"
);

// =============================================================================
// Test Helpers
// =============================================================================

function makeFormattedQuery(
	overrides: Partial<FormattedQuery> = {},
): FormattedQuery {
	return {
		normalizedQuery: "skiing gear",
		inferredCategories: ["ski"],
		constraints: {},
		formattedQueryForRecommender: "skiing equipment and apparel",
		...overrides,
	};
}

function makeProducts() {
	return [
		{
			id: 1,
			title: "Ski Jacket",
			description: "Warm jacket",
			imageUrl: "https://example.com/jacket.png",
			price: 19999,
			highlights: ["Warm"],
			reasonWhy: ["Essential"],
			tier: "essential" as const,
			subCategory: "ski-jacket",
		},
		{
			id: 2,
			title: "Ski Boots",
			description: "Pro boots",
			imageUrl: "https://example.com/boots.png",
			price: 29999,
			highlights: ["Professional"],
			reasonWhy: ["Must have"],
			tier: "essential" as const,
			subCategory: "ski-boots",
		},
		{
			id: 3,
			title: "Snow Goggles",
			description: "UV goggles",
			imageUrl: "https://example.com/goggles.png",
			price: 4999,
			highlights: ["UV protection"],
			reasonWhy: ["Nice to have"],
			tier: "optional" as const,
			subCategory: "ski-goggles",
		},
	];
}

// =============================================================================
// Tests
// =============================================================================

describe("Refinement Agent", () => {
	describe("test_refinement_returns_suggestion_chips", () => {
		it("returns suggestion chips from generateObject", async () => {
			const chips = [
				{ label: "Men", kind: "gender" },
				{ label: "Waterproof", kind: "feature" },
			];
			mockGenerateObject.mockResolvedValue({ object: { chips } });

			const result = await runRefinementAgent(
				makeFormattedQuery(),
				buildProductSummary(makeProducts()),
			);

			expect(result.chips).toHaveLength(2);
			expect(result.chips[0]).toEqual({ label: "Men", kind: "gender" });
			expect(result.chips[1]).toEqual({ label: "Waterproof", kind: "feature" });
		});
	});

	describe("test_refinement_propagates_abort_signal", () => {
		it("passes abort signal to generateObject", async () => {
			mockGenerateObject.mockResolvedValue({
				object: { chips: [] },
			});

			const controller = new AbortController();
			await runRefinementAgent(
				makeFormattedQuery(),
				buildProductSummary(makeProducts()),
				{ abortSignal: controller.signal },
			);

			expect(mockGenerateObject).toHaveBeenCalledWith(
				expect.objectContaining({
					abortSignal: controller.signal,
				}),
			);
		});
	});

	describe("test_refinement_throws_on_abort", () => {
		it("throws AbortError when signal is already aborted", async () => {
			const abortError = new Error("Aborted");
			abortError.name = "AbortError";
			mockGenerateObject.mockRejectedValue(abortError);

			const controller = new AbortController();
			controller.abort();

			await expect(
				runRefinementAgent(
					makeFormattedQuery(),
					buildProductSummary(makeProducts()),
					{ abortSignal: controller.signal },
				),
			).rejects.toThrow("Aborted");
		});
	});
});

describe("buildProductSummary", () => {
	describe("test_build_product_summary_extracts_fields", () => {
		it("extracts titles, prices, tiers, subCategories", () => {
			const summary = buildProductSummary(makeProducts());

			expect(summary.titles).toEqual([
				"Ski Jacket",
				"Ski Boots",
				"Snow Goggles",
			]);
			// Prices converted from cents to dollars
			expect(summary.prices).toEqual([199.99, 299.99, 49.99]);
			expect(summary.tiers).toContain("essential");
			expect(summary.tiers).toContain("optional");
			expect(summary.subCategories).toEqual([
				"ski-jacket",
				"ski-boots",
				"ski-goggles",
			]);
		});
	});

	describe("test_build_product_summary_deduplicates_tiers_and_subcategories", () => {
		it("deduplicates tiers and subCategories", () => {
			const products = [
				...makeProducts(),
				{
					id: 4,
					title: "Another Jacket",
					description: "Another jacket",
					imageUrl: "https://example.com/jacket2.png",
					price: 15000,
					highlights: [],
					reasonWhy: [],
					tier: "essential" as const,
					subCategory: "ski-jacket",
				},
			];

			const summary = buildProductSummary(products);

			// "essential" appears twice but should be deduplicated
			expect(summary.tiers.filter((t) => t === "essential")).toHaveLength(1);
			// "ski-jacket" appears twice but should be deduplicated
			expect(
				summary.subCategories.filter((s) => s === "ski-jacket"),
			).toHaveLength(1);
		});
	});

	describe("test_build_product_summary_handles_missing_subcategory", () => {
		it("filters out undefined subCategories", () => {
			const products = [
				{
					id: 1,
					title: "No SubCat Product",
					description: "Test",
					imageUrl: "https://example.com/test.png",
					price: 1000,
					highlights: [],
					reasonWhy: [],
					tier: undefined,
					subCategory: undefined,
				},
			];

			const summary = buildProductSummary(products);

			expect(summary.subCategories).toEqual([]);
			expect(summary.tiers).toEqual([]);
		});
	});
});
