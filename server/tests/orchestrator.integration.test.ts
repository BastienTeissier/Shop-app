import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

// Mock individual agent modules
const mockRunQueryFormatter = vi.fn();
const mockRunRecommendationAgent = vi.fn();

vi.mock("../src/agent/query-formatter.js", () => ({
	runQueryFormatter: mockRunQueryFormatter,
}));

vi.mock("../src/agent/recommendation-agent.js", () => ({
	runRecommendationAgent: mockRunRecommendationAgent,
}));

// Import orchestrator after mocks are set up
const { runSearchPipeline } = await import("../src/agent/orchestrator.js");

describe("Search Pipeline Orchestrator", () => {
	beforeEach(() => {
		mockRunQueryFormatter.mockReset();
		mockRunRecommendationAgent.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("test_pipeline_passes_formatted_query_to_recommender", () => {
		it("passes formatted query to recommendation agent", async () => {
			mockRunQueryFormatter.mockResolvedValue({
				normalizedQuery: "running shoes",
				inferredCategories: ["running"],
				constraints: { activity: "running" },
				formattedQueryForRecommender: "optimized running shoes query",
			});

			mockRunRecommendationAgent.mockResolvedValue({
				products: [{ id: 1, title: "Shoe", description: "", imageUrl: "", price: 1000, highlights: [], reasonWhy: [] }],
				summary: "Found shoes",
			});

			await runSearchPipeline("running shoes");

			expect(mockRunRecommendationAgent).toHaveBeenCalledWith(
				"optimized running shoes query",
				undefined,
				expect.objectContaining({ abortSignal: undefined }),
			);
		});
	});

	describe("test_pipeline_falls_back_to_raw_query_on_formatter_error", () => {
		it("falls back to raw query when formatter fails", async () => {
			mockRunQueryFormatter.mockRejectedValue(new Error("LLM timeout"));

			mockRunRecommendationAgent.mockResolvedValue({
				products: [{ id: 1, title: "Shoe", description: "", imageUrl: "", price: 1000, highlights: [], reasonWhy: [] }],
				summary: "Found shoes",
			});

			const result = await runSearchPipeline("running shoes");

			// Should call recommender with raw query
			expect(mockRunRecommendationAgent).toHaveBeenCalledWith(
				"running shoes",
				undefined,
				expect.objectContaining({ abortSignal: undefined }),
			);

			// Should still return products
			expect(result.products.length).toBe(1);
		});
	});

	describe("test_pipeline_returns_formatted_query_in_result", () => {
		it("includes formatted query in pipeline result", async () => {
			const formattedQuery = {
				normalizedQuery: "beach gear",
				inferredCategories: ["beach", "apparel"],
				constraints: { season: "summer" },
				formattedQueryForRecommender: "beach essentials",
			};

			mockRunQueryFormatter.mockResolvedValue(formattedQuery);
			mockRunRecommendationAgent.mockResolvedValue({
				products: [],
				summary: "No results",
			});

			const result = await runSearchPipeline("beach stuff");

			expect(result.formattedQuery).toEqual(formattedQuery);
		});
	});

	describe("test_pipeline_returns_timings", () => {
		it("returns timing information for both stages", async () => {
			mockRunQueryFormatter.mockResolvedValue({
				normalizedQuery: "test",
				inferredCategories: [],
				constraints: {},
				formattedQueryForRecommender: "test",
			});

			mockRunRecommendationAgent.mockResolvedValue({
				products: [],
				summary: "No results",
			});

			const result = await runSearchPipeline("test");

			expect(typeof result.timings.formatterMs).toBe("number");
			expect(result.timings.formatterMs).toBeGreaterThanOrEqual(0);
			expect(typeof result.timings.recommenderMs).toBe("number");
			expect(result.timings.recommenderMs).toBeGreaterThanOrEqual(0);
		});
	});

	describe("test_pipeline_propagates_refinement_context", () => {
		it("passes refinement context to recommendation agent", async () => {
			mockRunQueryFormatter.mockResolvedValue({
				normalizedQuery: "cheaper",
				inferredCategories: [],
				constraints: {},
				formattedQueryForRecommender: "cheaper options",
			});

			mockRunRecommendationAgent.mockResolvedValue({
				products: [],
				summary: "No results",
			});

			const refinementContext = {
				previousQuery: "ski gear",
				previousProducts: [
					{ id: 1, title: "Jacket", description: "", imageUrl: "", price: 20000, highlights: [], reasonWhy: [] },
				],
			};

			await runSearchPipeline("cheaper options", { refinementContext });

			expect(mockRunRecommendationAgent).toHaveBeenCalledWith(
				"cheaper options",
				refinementContext,
				expect.any(Object),
			);
		});
	});

	describe("test_pipeline_propagates_abort_signal_to_formatter", () => {
		it("passes abort signal to query formatter", async () => {
			const controller = new AbortController();

			mockRunQueryFormatter.mockResolvedValue({
				normalizedQuery: "test",
				inferredCategories: [],
				constraints: {},
				formattedQueryForRecommender: "test",
			});

			mockRunRecommendationAgent.mockResolvedValue({
				products: [],
				summary: "No results",
			});

			await runSearchPipeline("test", { abortSignal: controller.signal });

			expect(mockRunQueryFormatter).toHaveBeenCalledWith(
				"test",
				{ abortSignal: controller.signal },
			);
		});
	});

	describe("test_pipeline_propagates_abort_signal_to_recommender", () => {
		it("passes abort signal to recommendation agent", async () => {
			const controller = new AbortController();

			mockRunQueryFormatter.mockResolvedValue({
				normalizedQuery: "test",
				inferredCategories: [],
				constraints: {},
				formattedQueryForRecommender: "formatted test",
			});

			mockRunRecommendationAgent.mockResolvedValue({
				products: [],
				summary: "No results",
			});

			await runSearchPipeline("test", { abortSignal: controller.signal });

			expect(mockRunRecommendationAgent).toHaveBeenCalledWith(
				"formatted test",
				undefined,
				{ abortSignal: controller.signal },
			);
		});
	});

	describe("test_pipeline_logs_execution_summary", () => {
		it("logs structured execution summary", async () => {
			const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

			mockRunQueryFormatter.mockResolvedValue({
				normalizedQuery: "test",
				inferredCategories: [],
				constraints: {},
				formattedQueryForRecommender: "formatted test",
			});

			mockRunRecommendationAgent.mockResolvedValue({
				products: [{ id: 1, title: "P", description: "", imageUrl: "", price: 100, highlights: [], reasonWhy: [] }],
				summary: "Found 1",
			});

			await runSearchPipeline("test query");

			// Find the pipeline log
			const logCall = infoSpy.mock.calls.find((call) => {
				const str = call[0] as string;
				return typeof str === "string" && str.includes('"pipeline":"search"');
			});

			expect(logCall).toBeDefined();
			const logged = JSON.parse(logCall![0] as string);
			expect(logged.rawQuery).toBe("test query");
			expect(logged.formattedQuery).toBe("formatted test");
			expect(logged.productsCount).toBe(1);
			expect(logged.timings).toBeDefined();
			expect(typeof logged.timings.formatterMs).toBe("number");
			expect(typeof logged.timings.recommenderMs).toBe("number");

			infoSpy.mockRestore();
		});
	});
});
