import { describe, expect, it, vi } from "vitest";
import { applyDiversityFilter } from "../src/a2ui/handlers/recommend.js";

describe("Diversity Filter", () => {
	const createProduct = (
		id: number,
		subCategory?: string,
		tier?: "essential" | "recommended" | "optional",
	) => ({
		id,
		title: `Product ${id}`,
		description: "Test product",
		imageUrl: "https://example.com/image.png",
		price: 1000,
		highlights: ["Feature 1"],
		reasonWhy: ["Reason 1"],
		tier,
		subCategory,
	});

	it("test_diversity_filter_removes_duplicate_subcategories", () => {
		const products = [
			createProduct(1, "ski-jacket"),
			createProduct(2, "ski-boots"),
			createProduct(3, "ski-jacket"), // Duplicate
		];

		const filtered = applyDiversityFilter(products);

		expect(filtered).toHaveLength(2);
		expect(filtered.map((p) => p.id)).toEqual([1, 2]);
		expect(filtered[0].subCategory).toBe("ski-jacket");
		expect(filtered[1].subCategory).toBe("ski-boots");
	});

	it("test_diversity_filter_respects_global_tiers", () => {
		const products = [
			createProduct(1, "ski-jacket", "essential"),
			createProduct(2, "ski-boots", "essential"),
			createProduct(3, "ski-jacket", "recommended"), // Duplicate across tiers
		];

		const filtered = applyDiversityFilter(products);

		expect(filtered).toHaveLength(2);
		expect(filtered.map((p) => p.id)).toEqual([1, 2]);
		// Only the first ski-jacket (from Essential tier) is kept
		expect(filtered.find((p) => p.subCategory === "ski-jacket")?.tier).toBe(
			"essential",
		);
	});

	it("test_diversity_filter_handles_no_subcategory_field", () => {
		const products = [
			createProduct(1, undefined),
			createProduct(2, undefined),
			createProduct(3, undefined),
		];

		const consoleSpy = vi.spyOn(console, "info");

		const filtered = applyDiversityFilter(products);

		expect(filtered).toHaveLength(3);
		expect(filtered.map((p) => p.id)).toEqual([1, 2, 3]);
		expect(filtered.every((p) => p.subCategory === undefined)).toBe(true);

		// Real implementation logs fallback message
		expect(consoleSpy).toHaveBeenCalledWith(
			"Sub-category inference failed, showing all products without diversity filtering",
		);

		consoleSpy.mockRestore();
	});

	it("test_diversity_filter_logs_filtered_products", () => {
		const products = [
			createProduct(1, "ski-jacket"),
			createProduct(2, "ski-jacket"), // Duplicate - should be logged
			createProduct(3, "ski-boots"),
		];

		const consoleSpy = vi.spyOn(console, "info");

		const filtered = applyDiversityFilter(products);

		expect(filtered).toHaveLength(2);
		expect(filtered.map((p) => p.id)).toEqual([1, 3]);

		expect(consoleSpy).toHaveBeenCalledWith(
			'Filtered duplicate sub-category "ski-jacket" - Product ID: 2',
		);

		consoleSpy.mockRestore();
	});

	it("test_diversity_filter_keeps_products_with_unique_subcategories", () => {
		const products = [
			createProduct(1, "ski-jacket"),
			createProduct(2, "ski-boots"),
			createProduct(3, "ski-goggles"),
			createProduct(4, "ski-poles"),
		];

		const filtered = applyDiversityFilter(products);

		expect(filtered).toHaveLength(4);
		expect(filtered.map((p) => p.id)).toEqual([1, 2, 3, 4]);
	});

	it("test_diversity_filter_handles_mixed_products", () => {
		const products = [
			createProduct(1, "ski-jacket"),
			createProduct(2, undefined), // No subCategory
			createProduct(3, "ski-jacket"), // Duplicate
			createProduct(4, "ski-boots"),
		];

		const filtered = applyDiversityFilter(products);

		expect(filtered).toHaveLength(3);
		expect(filtered.map((p) => p.id)).toEqual([1, 2, 4]);
		// Product without subCategory is kept
		expect(filtered.find((p) => p.id === 2)?.subCategory).toBeUndefined();
	});
});
