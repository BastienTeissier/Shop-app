# Implementation Plan: UF1 — Formatted Recommendation Pipeline

## 1. Feature Description

**Objective**: Replace the direct `runRecommendationAgent()` call with a two-step orchestrated pipeline: Query Formatter → Recommendation Agent. The formatter normalizes natural language queries into structured, optimized inputs for the recommendation engine.

**Key Capabilities**:
- **CAN** interpret ambiguous queries ("something for the beach" → swimwear, sunglasses, sandals)
- **CAN** infer implicit constraints (gender, budget, activity, season) from natural language
- **CAN** fall back gracefully to raw query if formatter fails
- **CAN** abort in-flight LLM calls when a new search starts
- **CANNOT** access the database or product catalog (text-only agent)
- **CANNOT** expose internal pipeline stages to the user (single "Searching..." status)

**Business Rules**:
- Max 2 LLM calls per pipeline (1 formatter + 1 recommendation); no retries
- Formatter uses structured output (Zod schema) via AI SDK `generateObject()`
- Orchestrator passes only `formattedQueryForRecommender` string to existing recommendation agent
- Full `FormattedQuery` schema preserved in server-only orchestrator/session runtime state for UF2/UF3

---

## 2. Architecture

### New Files

#### A. 🟢 `server/src/agent/schemas/formatted-query.ts`
**Purpose**: Zod schema for the Query Formatter's structured output.

**Contents**:
- `FormattedQuerySchema` — Zod object:
  - `normalizedQuery: z.string()` — cleaned-up user intent
  - `inferredCategories: z.array(z.string()).default([])` — mapped to catalog categories
  - `constraints: z.object({ gender, budgetMax, budgetMin, activity, size, season })` — all optional
  - `formattedQueryForRecommender: z.string()` — optimized prompt string for the recommendation agent
- `FormattedQuery` type export inferred from schema

#### B. 🟢 `server/src/agent/query-formatter.ts`
**Purpose**: Query Formatter node — text-only LLM call, no tools.

**Exports**:
- `runQueryFormatter(query: string, options?: { abortSignal?: AbortSignal }): Promise<FormattedQuery>`
  - Calls `generateObject({ model: getRecommendationModel(), schema: FormattedQuerySchema, abortSignal, ... })`
  - System prompt: normalize NL, expand abbreviations, infer categories from available list (`ski, hiking, running, beach, cycling, apparel, accessories, electronics`), infer constraints, produce `formattedQueryForRecommender`
  - No tools, no refinement context (formatter is stateless)

#### C. 🟢 `server/src/agent/orchestrator.ts`
**Purpose**: Pipeline coordinator — formatter → recommender, fallback, abort, logging.

**Exports**:
- `PipelineResult` type:
  - `products: RecommendationResult["products"]`
  - `summary: string`
  - `formattedQuery?: FormattedQuery` — for UF2/UF3 consumption
  - `timings: { formatterMs?: number; recommenderMs?: number }`
- `runSearchPipeline(query: string, options: { refinementContext?: RefinementContext; abortSignal?: AbortSignal }): Promise<PipelineResult>`

**Logic**:
1. Run `runQueryFormatter(query, { abortSignal })` wrapped in try/catch
   - On success → use `formattedQuery.formattedQueryForRecommender`
   - On failure → log warning, fall back to raw `query`
2. Run `runRecommendationAgent(queryToUse, refinementContext, { abortSignal })`
3. Return `PipelineResult` with timings
4. Structured log at end: `{ rawQuery, formattedQuery, productsCount, timings }`

#### D. 🟢 `server/src/agent/schemas/index.ts`
**Purpose**: Barrel re-export for schemas folder.

---

### Files to Modify

#### E. ⚪ `server/src/agent/recommendation-agent.ts`
**Purpose**: Thread `AbortSignal` through to AI SDK.

**Changes**:
- Add optional `options?: { abortSignal?: AbortSignal }` as third parameter to `runRecommendationAgent()`
- Pass `abortSignal` to `generateText({ ..., abortSignal: options?.abortSignal })`

**Why**: Required by orchestrator to cancel in-flight recommendation calls on new search.

#### F. ⚪ `shared/a2ui-types.ts`
**Purpose**: Remove `lastRecommendation` from the shared data model type (moved to server-only runtime state).

**Changes**:
- Remove `lastRecommendation?: LastRecommendation` from the `RecommendationDataModel` type
- Remove the `LastRecommendation` type definition (moved to `session.ts`)

**Why**: `lastRecommendation` is pipeline-internal state that should never be in the shared A2UI protocol. Removing it from the type ensures compile-time errors if any code still reads `session.dataModel.lastRecommendation`.

#### G. ⚪ `server/src/a2ui/session.ts`
**Purpose**: Store per-session runtime state for pipeline cancellation and refinement context.

**Changes**:
- Define `LastRecommendation` type here (moved from `shared/a2ui-types.ts`)
- Keep `AbortController` and refinement-only pipeline state in `session.ts`, not in `shared/a2ui-types.ts`
- Extend `SessionEntry` with a server-only `runtime` object, for example:
  - `abortController?: AbortController`
  - `lastRecommendation?: LastRecommendation`
  - `lastFormattedQuery?: FormattedQuery`
- Add `abortPreviousPipeline(sessionId: string): AbortSignal` helper:
  - Aborts existing controller if present
  - Creates new `AbortController`, stores it in `SessionEntry.runtime`
  - Returns the new `signal`
- Move `setLastRecommendation()` / `getLastRecommendation()` to read/write from `SessionEntry.runtime` instead of `session.dataModel`

**Why**:
- New search must cancel any in-flight pipeline (formatter + recommender)
- `AbortController` and `FormattedQuery` must not be added to shared A2UI protocol types or broadcast to the client

#### H. ⚪ `server/src/a2ui/handlers/recommend.ts`
**Purpose**: Wire orchestrator into handleRecommend/handleRefine.

**Changes**:
- `handleRecommend()`:
  - Call `abortPreviousPipeline(sessionId)` to get signal
  - Replace `runRecommendationAgent(query)` → `runSearchPipeline(query, { abortSignal })`
  - Apply diversity filter to `result.products` (unchanged)
  - Store filtered products in server-only `lastRecommendation` with the **raw user query** (not the formatted query) — refinement context should reflect what the user typed
  - Store `result.formattedQuery` separately in server-only runtime state for UF2/UF3
- `handleRefine()`:
  - Call `abortPreviousPipeline(sessionId)` to get signal
  - Replace `runRecommendationAgent(refinementQuery, refinementContext)` → `runSearchPipeline(refinementQuery, { refinementContext, abortSignal })`
- Error handling: catch `AbortError` separately — if aborted, do nothing (new pipeline already running)

**Why**: Entry point where the orchestrator replaces direct agent calls.

#### I. ⚪ `server/src/agent/index.ts`
**Purpose**: Re-export new modules.

**Changes**:
- Add exports for `runSearchPipeline`, `PipelineResult`, `FormattedQuery`, `runQueryFormatter`

---

## 3. Test List

### Test File: `server/tests/orchestrator.integration.test.ts`

Mocks `./query-formatter.js` and `./recommendation-agent.js` individually. Tests orchestrator logic only.

1. **`test_pipeline_passes_formatted_query_to_recommender`**
   - Mock formatter → returns `{ formattedQueryForRecommender: "optimized query" }`
   - Verify `runRecommendationAgent` called with `"optimized query"`, not raw query

2. **`test_pipeline_falls_back_to_raw_query_on_formatter_error`**
   - Mock formatter → throws Error
   - Verify `runRecommendationAgent` called with the original raw query
   - Verify result still contains products (no user-facing error)

3. **`test_pipeline_returns_formatted_query_in_result`**
   - Mock formatter → returns full FormattedQuery
   - Verify `PipelineResult.formattedQuery` matches formatter output

4. **`test_pipeline_returns_timings`**
   - Verify `PipelineResult.timings` has `formatterMs` and `recommenderMs` as numbers ≥ 0

5. **`test_pipeline_propagates_refinement_context`**
   - Call `runSearchPipeline(query, { refinementContext })` with a RefinementContext
   - Verify `runRecommendationAgent` receives the refinementContext

6. **`test_pipeline_propagates_abort_signal_to_formatter`**
   - Create AbortController, pass signal to pipeline
   - Verify `runQueryFormatter` receives the signal

7. **`test_pipeline_propagates_abort_signal_to_recommender`**
   - Create AbortController, pass signal to pipeline
   - Verify `runRecommendationAgent` receives the signal

8. **`test_pipeline_logs_execution_summary`**
   - Spy on `console.info`
   - Verify structured log contains: rawQuery, formattedQuery (or "fallback"), productsCount, timings

### Test File: `server/tests/pipeline-abort.integration.test.ts`

Tests abort + session integration using A2UI mock helpers (same pattern as existing handler tests).

9. **`test_new_search_aborts_previous_pipeline`**
   - Connect SSE client
   - Mock `runSearchPipeline` with an abort-aware deferred promise for query A:
     - It stays pending until `abortSignal` fires
     - On abort, it rejects with `AbortError`
   - POST search action "query A"
   - POST search action "query B" immediately
   - Verify first pipeline's abort signal was triggered
   - Verify query B completes successfully without broadcasting an error for query A

### Existing test updates

10. **Update mock targets in A2UI integration tests**:
   - `server/tests/recommendation-agent.integration.test.ts`
   - `server/tests/a2ui-event.integration.test.ts`
   - `server/tests/recommendation-tiered.integration.test.ts`
   - Change mocks from `runRecommendationAgent` → `runSearchPipeline`
   - Mock returns same `{ products, summary }` shape (`PipelineResult` is a superset of `RecommendationResult`)
   - Existing assertions on SSE broadcasts remain valid

---

## 4. To Do List

### Implementation Tasks

- [ ] **Create FormattedQuery schema**
  - File: `server/src/agent/schemas/formatted-query.ts`
  - Zod schema + type export for FormattedQuery
  - File: `server/src/agent/schemas/index.ts`
  - Barrel re-export

- [ ] **Implement Query Formatter node**
  - File: `server/src/agent/query-formatter.ts`
  - `runQueryFormatter()` using `generateObject()` with FormattedQuerySchema
  - System prompt with category list + formatting instructions

- [ ] **Add AbortSignal to recommendation agent**
  - File: `server/src/agent/recommendation-agent.ts`
  - Add `options?: { abortSignal?: AbortSignal }` third param
  - Pass to `generateText({ abortSignal })`

- [ ] **Implement orchestrator**
  - File: `server/src/agent/orchestrator.ts`
  - `runSearchPipeline()` — formatter → recommender, fallback, timing, logging

- [ ] **Update barrel exports**
  - File: `server/src/agent/index.ts`
  - Re-export `runSearchPipeline`, `PipelineResult`, `FormattedQuery`, `runQueryFormatter`

- [ ] **Clean up shared types**
  - File: `shared/a2ui-types.ts`
  - Remove `lastRecommendation` field from `RecommendationDataModel`
  - Remove `LastRecommendation` type (moved to session.ts)

- [ ] **Add AbortController to session + move lastRecommendation**
  - File: `server/src/a2ui/session.ts`
  - Define `LastRecommendation` type locally
  - Add server-only runtime state on `SessionEntry`
  - `abortPreviousPipeline(sessionId)` helper
  - Move `setLastRecommendation` / `getLastRecommendation` to runtime state

- [ ] **Wire orchestrator into handlers**
  - File: `server/src/a2ui/handlers/recommend.ts`
  - `handleRecommend` → `abortPreviousPipeline` + `runSearchPipeline`
  - `handleRefine` → `abortPreviousPipeline` + `runSearchPipeline` with refinementContext
  - Store raw user query (not formatted) in `lastRecommendation` for refinement context
  - Store `formattedQuery` separately in server-side runtime state
  - Catch `AbortError` silently (new pipeline already running)

- [ ] **Write orchestrator tests**
  - File: `server/tests/orchestrator.integration.test.ts`
  - Tests 1–8 from Section 3

- [ ] **Write abort integration test**
  - File: `server/tests/pipeline-abort.integration.test.ts`
  - Test 9 from Section 3

- [ ] **Update existing handler tests**
  - Files:
    - `server/tests/recommendation-agent.integration.test.ts`
    - `server/tests/a2ui-event.integration.test.ts`
    - `server/tests/recommendation-tiered.integration.test.ts`
  - Change mocks from `runRecommendationAgent` → `runSearchPipeline`

- [ ] **Verify implementation**
  - Run `pnpm test:integration` — all tests pass
  - Run `pnpm typecheck` — no type errors
  - Run `pnpm check` — lint + typecheck + store typecheck clean
  - Optionally run `pnpm audit:ci` if dependency audit is required for this change

---

## 5. Context: Current System Architecture

### Recommendation Flow
Current: `handleRecommend()` → `runRecommendationAgent(query)` → broadcasts products via SSE.
- Agent uses `generateText()` with `searchProductsTool` + `rankProductsTool` (up to 5 steps)
- Returns `{ products[], summary }` with JSON parsed from free-text response
- Diversity filter applied before broadcast (max 1 product per subCategory)

### Refinement Flow
Current: `handleRefine()` → `runRecommendationAgent(query, { previousQuery, previousProducts })`.
- RefinementContext passes previous query + product IDs to agent prompt
- Agent adjusts recommendations based on refinement request

### Session & SSE
- In-memory sessions (`Map<sessionId, { session, clients }>`)
- `broadcastDataModelUpdate(sessionId, path, value)` sends to all connected clients
- Data model paths: `/status`, `/products`, `/query`, `/ui/query`, `/cart/*`
- Session auto-cleanup when last client disconnects + 1h TTL
- `lastRecommendation` currently lives in the A2UI data model; this UF should move refinement-only state to a server-only runtime store so pipeline internals are not sent over SSE

### Key Files
| File | Purpose |
|------|---------|
| `server/src/agent/recommendation-agent.ts` | LLM agent — `generateText()` + tools, returns `RecommendationResult` |
| `server/src/agent/openrouter-provider.ts` | Model factory — OpenRouter GPT-4o-mini or local Ollama |
| `server/src/agent/tools/search-products.ts` | `searchProductsTool` — wraps `productList()` / `productListByCategories()` |
| `server/src/agent/tools/rank-products.ts` | `rankProductsTool` — budget filter + preference scoring |
| `server/src/a2ui/handlers/recommend.ts` | `handleRecommend()` / `handleRefine()` — calls agent, broadcasts SSE |
| `server/src/a2ui/session.ts` | Session CRUD + `broadcastDataModelUpdate()` + server-only runtime state |
| `server/src/a2ui/stream.ts` | SSE endpoint — creates session, sends initial render, auto-triggers search |
| `server/src/a2ui/event.ts` | POST endpoint — routes actions (search, refine, addToCart, selectProduct) |
| `shared/a2ui-types.ts` | Data model types, message types, `createInitialDataModel()` |
| `server/tests/helpers/a2ui-mocks.ts` | `createSSEMockContext()`, `createEventMockContext()` test helpers |

---

## 6. Reference Implementations

- **LLM call pattern**: `server/src/agent/recommendation-agent.ts` — `generateText()` with AI SDK, model from provider, tool registration. Orchestrator follows same import style.
- **Structured output (target pattern)**: AI SDK `generateObject({ schema })` — not yet used in codebase. This UF standardizes on `generateObject()` for the formatter; update the macro doc later if needed so the docs do not mix `generateObject()` and `generateText(...output...)`. Reference: [AI SDK docs](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data).
- **Handler → agent call**: `server/src/a2ui/handlers/recommend.ts:handleRecommend()` — status broadcast → agent call → product broadcast → status update. Orchestrator replaces only the agent call; broadcast logic stays.
- **Test mocking pattern**: `server/tests/recommendation-agent.integration.test.ts` — `vi.doMock("../src/agent/index.js")` with mock agent, SSE + event mock contexts. New orchestrator tests follow same pattern but mock individual agent modules.
- **Barrel re-exports**: `server/src/agent/index.ts` — re-exports from sub-modules. New exports added here.

---

## Notes

- **No database changes** — no Prisma schema modifications needed for UF1.
- **No frontend changes** — same "Searching..." status, same product grid. The orchestrator is fully backend.
- **UF2/UF3 preparation** — `FormattedQuery` is stored on `PipelineResult` and can be saved in server-only session runtime state for the Refinement Agent in UF2.
- **AbortError handling** — AI SDK throws `AbortError` when signal is triggered. The handler must silently ignore it (not broadcast error status) since a new pipeline is already in flight.
