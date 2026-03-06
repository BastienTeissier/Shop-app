import {
	buildProductSummary,
	runRefinementAgent,
	runSearchPipeline,
} from "../../agent/index.js";
import type { RecommendationResult } from "../../agent/recommendation-agent.js";
import type { FormattedQuery } from "../../agent/schemas/index.js";
import {
	abortPreviousPipeline,
	broadcastDataModelUpdate,
	getLastRecommendation,
	setLastFormattedQuery,
	setLastRecommendation,
} from "../session.js";

/**
 * Apply sub-category diversity filter to products.
 * Ensures max 1 product per sub-category globally across all tiers.
 */
export function applyDiversityFilter(
	products: RecommendationResult["products"],
): RecommendationResult["products"] {
	const seen = new Set<string>();
	const filtered: RecommendationResult["products"] = [];
	let productsWithoutSubCategory = 0;

	for (const product of products) {
		if (!product.subCategory) {
			filtered.push(product);
			productsWithoutSubCategory++;
			continue;
		}

		if (!seen.has(product.subCategory)) {
			seen.add(product.subCategory);
			filtered.push(product);
		} else {
			console.info(
				`Filtered duplicate sub-category "${product.subCategory}" - Product ID: ${product.id}`,
			);
		}
	}

	// Log if all products lack sub-categories (fallback scenario)
	if (productsWithoutSubCategory === products.length && products.length > 0) {
		console.info(
			"Sub-category inference failed, showing all products without diversity filtering",
		);
	}

	return filtered;
}

/**
 * Fire refinement agent in the background (non-blocking).
 * Produces suggestion chips via SSE. Degrades gracefully on failure.
 */
function runRefinementInBackground(
	sessionId: string,
	formattedQuery: FormattedQuery | undefined,
	products: RecommendationResult["products"],
	abortSignal: AbortSignal,
): void {
	if (!formattedQuery || products.length === 0) return;

	const startMs = Date.now();
	const productSummary = buildProductSummary(products);

	runRefinementAgent(formattedQuery, productSummary, { abortSignal })
		.then((suggestions) => {
			broadcastDataModelUpdate(sessionId, "/suggestions", suggestions);
			console.info({
				pipeline: "refinement",
				chipsCount: suggestions.chips.length,
				chipLabels: suggestions.chips.map((c) => c.label),
				refinementMs: Date.now() - startMs,
			});
		})
		.catch((error) => {
			if (error instanceof Error && error.name === "AbortError") return;
			console.warn("Refinement agent failed:", error);
		});
}

/**
 * Handle recommendation action - uses LLM agent to find and rank products.
 */
export async function handleRecommend(
	sessionId: string,
	query: string,
): Promise<void> {
	// Abort any in-flight pipeline and get a fresh signal
	const abortSignal = abortPreviousPipeline(sessionId);

	// Clear stale suggestions immediately
	broadcastDataModelUpdate(sessionId, "/suggestions", { chips: [] });

	// Clear stale refinement state so a concurrent refine doesn't use old data
	setLastRecommendation(sessionId, undefined);
	setLastFormattedQuery(sessionId, undefined);

	// Update status to searching
	broadcastDataModelUpdate(sessionId, "/status", {
		phase: "searching",
		message: `Finding recommendations for "${query}"...`,
	});

	// Update query in data model
	broadcastDataModelUpdate(sessionId, "/query", query);
	broadcastDataModelUpdate(sessionId, "/ui/query", query);

	try {
		// Run the search pipeline (formatter → recommender)
		const result = await runSearchPipeline(query, { abortSignal });

		// Apply diversity filter
		console.info(
			`Diversity filter: ${result.products.length} products before filtering`,
		);
		const filteredProducts = applyDiversityFilter(result.products);
		console.info(
			`Diversity filter: ${result.products.length} → ${filteredProducts.length} products`,
		);

		// Broadcast filtered products with highlights and reasonWhy
		broadcastDataModelUpdate(sessionId, "/products", filteredProducts);

		// Store last recommendation for refinement (raw user query, not formatted)
		if (filteredProducts.length > 0) {
			setLastRecommendation(sessionId, {
				query,
				products: filteredProducts,
			});
		}

		// Store formatted query in runtime state for UF2/UF3
		if (result.formattedQuery) {
			setLastFormattedQuery(sessionId, result.formattedQuery);
		}

		// Update status to completed
		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "completed",
			message:
				filteredProducts.length > 0
					? result.summary
					: "No recommendations found",
		});

		// Fire refinement async (non-blocking)
		runRefinementInBackground(
			sessionId,
			result.formattedQuery,
			filteredProducts,
			abortSignal,
		);
	} catch (error) {
		// Silently ignore abort errors — a new pipeline is already running
		if (error instanceof Error && error.name === "AbortError") {
			return;
		}
		console.error("Recommendation agent error:", error);
		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "error",
			message: "Failed to get recommendations. Please try again.",
		});
	}
}

/**
 * Handle refinement action - refines previous recommendations based on user feedback.
 */
export async function handleRefine(
	sessionId: string,
	refinementQuery: string,
): Promise<void> {
	// Check if there's a previous recommendation to refine
	const lastRecommendation = getLastRecommendation(sessionId);
	if (!lastRecommendation) {
		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "error",
			message: "No previous recommendation to refine. Please search first.",
		});
		return;
	}

	// Abort any in-flight pipeline and get a fresh signal
	const abortSignal = abortPreviousPipeline(sessionId);

	// Clear stale suggestions immediately
	broadcastDataModelUpdate(sessionId, "/suggestions", { chips: [] });

	// Update status to searching
	broadcastDataModelUpdate(sessionId, "/status", {
		phase: "searching",
		message: `Refining recommendations: "${refinementQuery}"...`,
	});

	// Update query in data model
	broadcastDataModelUpdate(sessionId, "/query", refinementQuery);
	broadcastDataModelUpdate(sessionId, "/ui/query", refinementQuery);

	try {
		// Run the search pipeline with refinement context
		const result = await runSearchPipeline(refinementQuery, {
			refinementContext: {
				previousQuery: lastRecommendation.query,
				previousProducts: lastRecommendation.products,
			},
			abortSignal,
		});

		// Apply diversity filter
		console.info(
			`Diversity filter: ${result.products.length} products before filtering`,
		);
		const filteredProducts = applyDiversityFilter(result.products);
		console.info(
			`Diversity filter: ${result.products.length} → ${filteredProducts.length} products`,
		);

		// Broadcast refined products
		broadcastDataModelUpdate(sessionId, "/products", filteredProducts);

		// Update last recommendation with refined results
		if (filteredProducts.length > 0) {
			setLastRecommendation(sessionId, {
				query: refinementQuery,
				products: filteredProducts,
			});
		}

		// Store formatted query in runtime state for UF2/UF3
		if (result.formattedQuery) {
			setLastFormattedQuery(sessionId, result.formattedQuery);
		}

		// Update status to completed
		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "completed",
			message:
				filteredProducts.length > 0
					? result.summary
					: "No matching products after refinement",
		});

		// Fire refinement async (non-blocking)
		runRefinementInBackground(
			sessionId,
			result.formattedQuery,
			filteredProducts,
			abortSignal,
		);
	} catch (error) {
		// Silently ignore abort errors — a new pipeline is already running
		if (error instanceof Error && error.name === "AbortError") {
			return;
		}
		console.error("Refinement agent error:", error);
		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "error",
			message: "Failed to refine recommendations. Please try again.",
		});
	}
}
