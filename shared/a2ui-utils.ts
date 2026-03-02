import type { RecommendationDataModel } from "./a2ui-types.js";

/**
 * Apply a data model update at the specified path.
 * Returns a new data model (immutable).
 */
export function applyDataModelUpdate(
	dataModel: RecommendationDataModel,
	path: string,
	value: unknown,
): RecommendationDataModel {
	// Root update - replace entire model
	if (path === "/" || path === "") {
		return value as RecommendationDataModel;
	}

	// Clone the data model for immutability
	const newModel = structuredClone(dataModel);
	const parts = path.split("/").filter(Boolean);

	let current: Record<string, unknown> = newModel;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (typeof current[part] !== "object" || current[part] === null) {
			current[part] = {};
		}
		current = current[part] as Record<string, unknown>;
	}

	const lastPart = parts[parts.length - 1];
	current[lastPart] = value;

	return newModel;
}
