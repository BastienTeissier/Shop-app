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

type SearchMessages = {
	searching: string;
	noResults: string;
	error: string;
	errorLog: string;
};

/**
 * Shared pipeline: abort → clear suggestions → status → search → filter → broadcast → store → refinement.
 */
async function runSearchAndBroadcast(
	sessionId: string,
	query: string,
	messages: SearchMessages,
	pipelineOptions: Parameters<typeof runSearchPipeline>[1] = {},
): Promise<void> {
	const abortSignal = abortPreviousPipeline(sessionId);

	broadcastDataModelUpdate(sessionId, "/suggestions", { chips: [] });

	broadcastDataModelUpdate(sessionId, "/status", {
		phase: "searching",
		message: messages.searching,
	});

	broadcastDataModelUpdate(sessionId, "/query", query);
	broadcastDataModelUpdate(sessionId, "/ui/query", query);

	try {
		const result = await runSearchPipeline(query, {
			...pipelineOptions,
			abortSignal,
		});

		console.info(
			`Diversity filter: ${result.products.length} products before filtering`,
		);
		const filteredProducts = applyDiversityFilter(result.products);
		console.info(
			`Diversity filter: ${result.products.length} → ${filteredProducts.length} products`,
		);

		broadcastDataModelUpdate(sessionId, "/products", filteredProducts);

		if (filteredProducts.length > 0) {
			setLastRecommendation(sessionId, {
				query,
				products: filteredProducts,
			});
		}

		if (result.formattedQuery) {
			setLastFormattedQuery(sessionId, result.formattedQuery);
		}

		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "completed",
			message:
				filteredProducts.length > 0
					? result.summary
					: messages.noResults,
		});

		runRefinementInBackground(
			sessionId,
			result.formattedQuery,
			filteredProducts,
			abortSignal,
		);
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			return;
		}
		console.error(messages.errorLog, error);
		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "error",
			message: messages.error,
		});
	}
}

/**
 * Handle recommendation action - uses LLM agent to find and rank products.
 */
export async function handleRecommend(
	sessionId: string,
	query: string,
): Promise<void> {
	// Clear stale refinement state so a concurrent refine doesn't use old data
	setLastRecommendation(sessionId, undefined);
	setLastFormattedQuery(sessionId, undefined);

	return runSearchAndBroadcast(sessionId, query, {
		searching: `Finding recommendations for "${query}"...`,
		noResults: "No recommendations found",
		error: "Failed to get recommendations. Please try again.",
		errorLog: "Recommendation agent error:",
	});
}

/**
 * Handle refinement action - refines previous recommendations based on user feedback.
 */
export async function handleRefine(
	sessionId: string,
	refinementQuery: string,
): Promise<void> {
	const lastRecommendation = getLastRecommendation(sessionId);
	if (!lastRecommendation) {
		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "error",
			message: "No previous recommendation to refine. Please search first.",
		});
		return;
	}

	return runSearchAndBroadcast(sessionId, refinementQuery, {
		searching: `Refining recommendations: "${refinementQuery}"...`,
		noResults: "No matching products after refinement",
		error: "Failed to refine recommendations. Please try again.",
		errorLog: "Refinement agent error:",
	}, {
		refinementContext: {
			previousQuery: lastRecommendation.query,
			previousProducts: lastRecommendation.products,
		},
	});
}
