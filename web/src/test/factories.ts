/**
 * Test Data Factories
 *
 * Factory functions for creating test data with sensible defaults.
 * Use partial overrides to customize for specific test scenarios.
 */

import type {
	CartSnapshot,
	CartSnapshotItem,
	CartSummaryItem,
	Product,
} from "@shared/types.js";

/**
 * Create a Product with sensible defaults
 */
export function makeProduct(overrides: Partial<Product> = {}): Product {
	return {
		id: 1,
		title: "Road Bike",
		description: "Fast bike",
		imageUrl: "https://example.com/road-bike.png",
		price: 1999,
		...overrides,
	};
}

/**
 * Create a CartSnapshotItem with sensible defaults
 */
export function makeCartSnapshotItem(
	overrides: Partial<CartSnapshotItem> = {},
): CartSnapshotItem {
	return {
		productId: 1,
		quantity: 1,
		priceSnapshot: 1999,
		...overrides,
	};
}

/**
 * Create a CartSnapshot with sensible defaults
 */
export function makeCartSnapshot(
	overrides: Partial<CartSnapshot> = {},
): CartSnapshot {
	return {
		items: [],
		totalQuantity: 0,
		totalPrice: 0,
		...overrides,
	};
}

/**
 * Create a CartSummaryItem with sensible defaults
 */
export function makeCartSummaryItem(
	overrides: Partial<CartSummaryItem> = {},
): CartSummaryItem {
	return {
		productId: 1,
		title: "Road Bike",
		imageUrl: "https://example.com/road-bike.png",
		unitPriceSnapshot: 1999,
		quantity: 1,
		lineTotal: 1999,
		...overrides,
	};
}

/**
 * Empty cart snapshot constant for tests
 */
export const emptyCartSnapshot: CartSnapshot = {
	items: [],
	totalQuantity: 0,
	totalPrice: 0,
};
