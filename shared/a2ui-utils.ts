import type { RecommendationDataModel } from "./a2ui-types.js";

const BLOCKED_PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Split a slash-delimited path into segments. Returns null if the path contains blocked prototype keys. */
export function parseSafePath(path: string): string[] | null {
	const parts = path.split("/").filter(Boolean);
	if (parts.some((p) => BLOCKED_PROTO_KEYS.has(p))) return null;
	return parts;
}

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

	const parts = parseSafePath(path);
	if (!parts) return dataModel;

	// Clone the data model for immutability
	const newModel = structuredClone(dataModel);

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
