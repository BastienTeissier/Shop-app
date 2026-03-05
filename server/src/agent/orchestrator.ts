import { runQueryFormatter } from "./query-formatter.js";
import {
	type RecommendationResult,
	type RefinementContext,
	runRecommendationAgent,
} from "./recommendation-agent.js";
import type { FormattedQuery } from "./schemas/index.js";

export type PipelineResult = {
	products: RecommendationResult["products"];
	summary: string;
	formattedQuery?: FormattedQuery;
	timings: { formatterMs?: number; recommenderMs?: number };
};

/**
 * Run the search pipeline: Query Formatter → Recommendation Agent.
 * Falls back to raw query if the formatter fails.
 */
export async function runSearchPipeline(
	query: string,
	options: {
		refinementContext?: RefinementContext;
		abortSignal?: AbortSignal;
	} = {},
): Promise<PipelineResult> {
	const { refinementContext, abortSignal } = options;

	// Step 1: Format query (with fallback)
	let formattedQuery: FormattedQuery | undefined;
	let queryToUse = query;
	let formatterMs: number | undefined;

	const formatterStart = performance.now();
	try {
		formattedQuery = await runQueryFormatter(query, { abortSignal });
		queryToUse = formattedQuery.formattedQueryForRecommender;
		formatterMs = Math.round(performance.now() - formatterStart);
	} catch (error) {
		formatterMs = Math.round(performance.now() - formatterStart);
		// Rethrow abort errors — they should not be treated as formatter failures
		if (error instanceof Error && error.name === "AbortError") {
			throw error;
		}
		console.warn("Query formatter failed, falling back to raw query:", error);
	}

	// Step 2: Run recommendation agent
	const recommenderStart = performance.now();
	const result = await runRecommendationAgent(
		queryToUse,
		refinementContext,
		{ abortSignal },
	);
	const recommenderMs = Math.round(performance.now() - recommenderStart);

	const timings = { formatterMs, recommenderMs };

	// Structured log
	console.info(
		JSON.stringify({
			pipeline: "search",
			rawQuery: query,
			formattedQuery: formattedQuery
				? formattedQuery.formattedQueryForRecommender
				: "fallback",
			productsCount: result.products.length,
			timings,
		}),
	);

	return {
		products: result.products,
		summary: result.summary,
		formattedQuery,
		timings,
	};
}
