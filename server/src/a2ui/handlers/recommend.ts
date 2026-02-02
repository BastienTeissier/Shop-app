import { runRecommendationAgent } from "../../agent/index.js";
import {
	broadcastDataModelUpdate,
	getLastRecommendation,
	setLastRecommendation,
} from "../session.js";

/**
 * Handle recommendation action - uses LLM agent to find and rank products.
 */
export async function handleRecommend(
	sessionId: string,
	query: string,
): Promise<void> {
	// Update status to searching
	broadcastDataModelUpdate(sessionId, "/status", {
		phase: "searching",
		message: `Finding recommendations for "${query}"...`,
	});

	// Update query in data model
	broadcastDataModelUpdate(sessionId, "/query", query);
	broadcastDataModelUpdate(sessionId, "/ui/query", query);

	try {
		// Run the recommendation agent (batch - waits for completion)
		const result = await runRecommendationAgent(query);

		// Broadcast products with highlights and reasonWhy
		broadcastDataModelUpdate(sessionId, "/products", result.products);

		// Store last recommendation for refinement
		if (result.products.length > 0) {
			setLastRecommendation(sessionId, {
				query,
				products: result.products,
			});
		}

		// Update status to completed
		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "completed",
			message:
				result.products.length > 0
					? result.summary
					: "No recommendations found",
		});
	} catch (error) {
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

	// Update status to searching
	broadcastDataModelUpdate(sessionId, "/status", {
		phase: "searching",
		message: `Refining recommendations: "${refinementQuery}"...`,
	});

	try {
		// Run the recommendation agent with refinement context
		const result = await runRecommendationAgent(refinementQuery, {
			previousQuery: lastRecommendation.query,
			previousProducts: lastRecommendation.products,
		});

		// Broadcast refined products
		broadcastDataModelUpdate(sessionId, "/products", result.products);

		// Update last recommendation with refined results
		if (result.products.length > 0) {
			setLastRecommendation(sessionId, {
				query: refinementQuery,
				products: result.products,
			});
		}

		// Update status to completed
		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "completed",
			message:
				result.products.length > 0
					? result.summary
					: "No matching products after refinement",
		});
	} catch (error) {
		console.error("Refinement agent error:", error);
		broadcastDataModelUpdate(sessionId, "/status", {
			phase: "error",
			message: "Failed to refine recommendations. Please try again.",
		});
	}
}
