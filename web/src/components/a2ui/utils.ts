import type { RecommendationDataModel } from "@shared/a2ui-types.js";

/**
 * Resolve a binding path to a value in the data model.
 * Supports paths like "/products", "/status/message", "." for current item.
 */
export function resolveBinding(
	dataModel: RecommendationDataModel,
	binding: string,
	itemData?: unknown,
): unknown {
	// "." means current item in list iteration
	if (binding === ".") {
		return itemData;
	}

	// Handle paths like "/products" or "/status/message"
	const parts = binding.split("/").filter(Boolean);
	let current: unknown = dataModel;

	for (const part of parts) {
		if (typeof current !== "object" || current === null) {
			return undefined;
		}
		current = (current as Record<string, unknown>)[part];
	}

	return current;
}

/**
 * Format price from cents to display string.
 */
export function formatPrice(priceCents: number): string {
	return `$${(priceCents / 100).toFixed(2)}`;
}
