# Implementation Plan: UF2 — Background Refinement Suggestions

## 1. Feature Description

**Objective**: After products are delivered to the UI, a Refinement Agent runs in the background and produces suggestion chips that appear below the search bar. The agent receives the formatted query (from UF1) and a summary of the returned products as input, so suggestions reflect what was actually found.

**Key Capabilities**:
- **CAN** produce hybrid suggestion chips: constrained vocabulary (gender, price range, size) + 2-3 dynamic AI-generated suggestions (material, activity, brand, season, color, etc.)
- **CAN** run asynchronously after products are broadcast (non-blocking — products visible before chips appear)
- **CAN** receive formatted query + product summary (titles, prices, tiers, subcategories) as context
- **CAN** be aborted when a new search starts (pending chips discarded)
- **CAN** degrade gracefully — if it fails, no chips appear, products still visible
- **CANNOT** access the database or product catalog directly (text-only agent, receives product summary from pipeline)
- **CANNOT** show a loading indicator for chips — they simply appear when ready with fade-in

**Business Rules**:
- Max 3 LLM calls per full pipeline (1 formatter + 1 recommendation + 1 refinement); no retries
- Constrained categories only shown when relevant to returned products (e.g., gender only if products span multiple genders)
- Dynamic suggestions capped at 3 items max
- Chips cleared immediately when a new search starts (broadcast empty array)
- Suggestions delivered via existing `dataModelUpdate` SSE mechanism (new `/suggestions` path)
- Chips rendered by store `HomePage` component (not the A2UI surface tree)

---

## 2. Architecture

### New Files

#### A. 🟢 `server/src/agent/schemas/suggestions.ts`
**Purpose**: Zod schema for the Refinement Agent's structured output.

**Contents**:
- `SuggestionChipSchema` — Zod object conforming to shared `SuggestionChip` type:
  - `label: z.string()` — display text (e.g., "Men", "Under $50", "Waterproof")
  - `kind: z.enum(["gender", "priceRange", "size", "material", "activity", "brand", "color", "season", "feature", "other"])` — chip category
- `SuggestionsSchema` — Zod object:
  - `chips: z.array(SuggestionChipSchema).max(8)` — flat list combining constrained + dynamic
- `Suggestions` type export inferred from `SuggestionsSchema`
- **Note**: `SuggestionChip` type is defined in `shared/a2ui-types.ts` (source of truth for cross-boundary types). The Zod schema validates against it but does not define it.

#### B. 🟢 `server/src/agent/refinement-agent.ts`
**Purpose**: Refinement Agent node — text-only LLM call, no tools. Also owns the `ProductSummary` type and builder since it is the primary consumer.

**Exports**:
- `ProductSummary` type — `{ titles: string[]; prices: number[]; tiers: string[]; subCategories: string[] }`
- `buildProductSummary(products: RecommendationResult["products"]): ProductSummary`
  - Extracts `{ titles, prices, tiers, subCategories }` from the filtered products array
  - Converts prices from cents to dollars (`price / 100`) for cleaner LLM input
  - Deduplicates tiers and subCategories
- `runRefinementAgent(formattedQuery: FormattedQuery, productSummary: ProductSummary, options?: { abortSignal?: AbortSignal }): Promise<Suggestions>`
  - Calls `generateObject({ model: getRecommendationModel(), schema: SuggestionsSchema, abortSignal, ... })`
  - System prompt instructs:
    - Select constrained chips from predefined vocabulary based on product data (gender if multiple genders present, price buckets from actual distribution, sizes if meaningful)
    - Generate 2-3 dynamic suggestions based on query context + returned products (material, activity, brand, etc.)
    - Total chips ≤ 8
  - No tools, no database access

#### C. 🟢 `store/src/hooks/useSuggestions.ts`
**Purpose**: Presentation hook for suggestion chips — manages fade-in visibility state.

**Exports**:
- `useSuggestions(chips: SuggestionChip[]): { chips: SuggestionChip[]; isVisible: boolean }`
  - When `chips` prop changes from empty → non-empty: set `isVisible` to `true` after a short delay (requestAnimationFrame or 0ms timeout) to trigger CSS fade-in
  - When `chips` becomes empty: set `isVisible` to `false` immediately
  - Returns the chips and visibility flag for the fade-in CSS class

---

### Files to Modify

#### D. ⚪ `server/src/a2ui/handlers/recommend.ts`
**Purpose**: Fire Refinement Agent async after products broadcast; clear suggestions on new search.

**Changes in `handleRecommend()`**:
1. After `abortPreviousPipeline()`, broadcast `broadcastDataModelUpdate(sessionId, "/suggestions", { chips: [] })` — clears stale chips immediately
2. After broadcasting products and storing runtime state, fire refinement async (non-blocking):
   ```
   // Fire-and-forget: do not await
   runRefinementInBackground(sessionId, formattedQuery, filteredProducts, abortSignal)
   ```
3. New private helper `runRefinementInBackground(sessionId, formattedQuery, products, abortSignal)`:
   - If `formattedQuery` is `undefined` (formatter failed), return immediately — no chips is better than bad chips
   - Build product summary via `buildProductSummary(products)`
   - Call `runRefinementAgent(formattedQuery, productSummary, { abortSignal })`
   - On success: `broadcastDataModelUpdate(sessionId, "/suggestions", suggestions)`
   - On failure (non-abort): log warning, do nothing (graceful degradation)
   - On AbortError: silently return (new search already started)
   - Log: `{ pipeline: "refinement", chipsCount, chipLabels, refinementMs }`

**Changes in `handleRefine()`**:
- Same pattern: clear suggestions at start, fire refinement async after products broadcast

**Why**: Handler owns SSE broadcasting. Async fire-and-forget keeps products non-blocking.

#### E. ⚪ `shared/a2ui-types.ts`
**Purpose**: Define `SuggestionChip` type (source of truth) and add `suggestions` field to `RecommendationDataModel`.

**Changes**:
- Define `SuggestionChipKind` union type: `"gender" | "priceRange" | "size" | "material" | "activity" | "brand" | "color" | "season" | "feature" | "other"`
- Define `SuggestionChip` type: `{ label: string; kind: SuggestionChipKind }`
- Add to `RecommendationDataModel`:
  ```
  suggestions: { chips: SuggestionChip[] };
  ```
- Update `createInitialDataModel()` to include `suggestions: { chips: [] }`

**Why**: `SuggestionChip` is a cross-boundary type consumed by both server (Zod schema validation) and store (rendering). Following CLAUDE.md convention, shared types live in `shared/a2ui-types.ts` as the single source of truth. The Zod schema in `server/src/agent/schemas/suggestions.ts` conforms to this type but does not define it.

#### F. ⚪ `store/src/hooks/useRecommendations.ts`
**Purpose**: Expose `suggestions` from the data model for the separate `useSuggestions` hook.

**Changes**:
- Add `suggestions` to `UseRecommendationsReturn` type:
  ```
  suggestions: SuggestionChip[];
  ```
- Return `dataModel.suggestions?.chips ?? []` alongside products and status
- On `search()` call: `createInitialDataModel()` already resets suggestions (since we added it to initial model)

**Why**: SSE data arrives through `useRecommendations`; expose raw suggestions for `useSuggestions` to consume.

#### G. ⚪ `store/src/pages/HomePage.tsx`
**Purpose**: Render suggestion chips below search bar with fade-in.

**Changes**:
- Destructure `suggestions` from `useRecommendations()`
- Call `const { chips, isVisible } = useSuggestions(suggestions)`
- Render chips between search bar and prompt buttons (or between prompt buttons and status):
  ```tsx
  {chips.length > 0 && (
    <div className={`suggestion-chips ${isVisible ? "visible" : ""}`}>
      {chips.map(chip => (
        <button key={chip.label} className="suggestion-chip" onClick={() => handleSearch(`${query} ${chip.label}`)}>
          {chip.label}
        </button>
      ))}
    </div>
  )}
  ```
- **Important**: Chip click appends label to current search bar text, then calls `handleSearch` which fires a **fresh `search` action** (not `refine`). This means `lastRecommendation` and `lastFormattedQuery` are cleared, and a full new search runs **without refinement context**. Chips act as search modifiers, not refinements. UF3 will replace this with the `RefinementContext` pattern for proper context-aware re-runs.

**Why**: PRD specifies chips rendered by HomePage, not A2UI surface tree.

#### H. ⚪ `store/src/index.css` (or equivalent store styles)
**Purpose**: Add chip styles + fade-in transition.

**Changes**:
- `.suggestion-chips` — flex row, gap, wrap
- `.suggestion-chip` — pill button styling (border-radius, padding, subtle background)
- `.suggestion-chips.visible` — opacity 1, transition
- `.suggestion-chips` default — opacity 0, transition: opacity 200ms ease-in

#### I. ⚪ `server/src/agent/schemas/index.ts`
**Purpose**: Re-export suggestions schema.

**Changes**:
- Add exports for `SuggestionChipSchema`, `SuggestionsSchema`, `Suggestions`

#### J. ⚪ `server/src/agent/index.ts`
**Purpose**: Re-export refinement agent + product summary.

**Changes**:
- Add exports for `runRefinementAgent`, `Suggestions`, `ProductSummary`, `buildProductSummary`

---

## 3. Test List

### Test File: `server/tests/refinement-agent.integration.test.ts`

Mocks `generateObject` from `ai` module. Tests refinement agent + `buildProductSummary` utility.

1. **`test_refinement_returns_suggestion_chips`**
   - Mock `generateObject` → returns `{ chips: [{ label: "Men", kind: "gender" }, { label: "Waterproof", kind: "feature" }] }`
   - Call `runRefinementAgent(formattedQuery, productSummary)`
   - Verify returns `Suggestions` with 2 chips

2. **`test_refinement_propagates_abort_signal`**
   - Pass `AbortSignal` to `runRefinementAgent`
   - Verify `generateObject` receives the signal

3. **`test_refinement_throws_on_abort`**
   - Create aborted signal, call `runRefinementAgent`
   - Verify throws `AbortError`

4. **`test_build_product_summary_extracts_fields`**
   - Input: 3 products with titles, prices, tiers, subCategories
   - Verify summary has correct arrays
   - Verify prices are converted from cents to dollars

5. **`test_build_product_summary_deduplicates_tiers_and_subcategories`**
   - Input: products with duplicate tiers/subCategories
   - Verify deduplicated

6. **`test_build_product_summary_handles_missing_subcategory`**
   - Input: product without subCategory
   - Verify no crash, filters undefined

### Test File: `server/tests/refinement-background.integration.test.ts`

Tests the background refinement flow in the handler using A2UI mock helpers (same pattern as `recommendation-tiered.integration.test.ts`).

7. **`test_suggestions_broadcast_after_products`**
   - Mock `runSearchPipeline` → returns products with formattedQuery
   - Mock `runRefinementAgent` → returns suggestion chips
   - POST search action, wait for async refinement
   - Verify SSE messages contain both `/products` and `/suggestions` updates
   - Verify `/suggestions` arrives after `/products`

8. **`test_suggestions_cleared_on_new_search`**
   - POST search action (first search completes with chips)
   - POST search action (second search)
   - Verify first message of second search is `/suggestions` with `{ chips: [] }`

9. **`test_refinement_failure_degrades_gracefully`**
   - Mock `runRefinementAgent` → throws Error
   - POST search action
   - Verify products still broadcast, no `/suggestions` update, no error status

10. **`test_refinement_aborted_on_new_search`**
    - Mock `runRefinementAgent` with deferred promise that stays pending until abort
    - POST search "query A" → POST search "query B" immediately
    - Verify no suggestions from query A, query B completes normally

11. **`test_no_refinement_when_no_products`**
    - Mock `runSearchPipeline` → returns empty products
    - POST search action
    - Verify `runRefinementAgent` never called

12. **`test_no_refinement_when_formatter_failed`**
    - Mock `runSearchPipeline` → returns products but `formattedQuery: undefined` (formatter failed, fallback used)
    - POST search action
    - Verify products broadcast, `runRefinementAgent` never called, no `/suggestions` update

### Existing test updates

13. **Update mock targets in handler tests**:
    - `server/tests/recommendation-tiered.integration.test.ts`
    - Mock `runRefinementAgent` → resolves with empty chips by default (prevent real LLM calls)

---

## 4. To Do List

### Implementation Tasks

- [ ] **Add `SuggestionChip` type + suggestions to data model**
  - File: `shared/a2ui-types.ts`
  - Define `SuggestionChipKind` union type + `SuggestionChip` type (source of truth)
  - Add `suggestions: { chips: SuggestionChip[] }` to `RecommendationDataModel`
  - Update `createInitialDataModel()`

- [ ] **Create Suggestions schema**
  - File: `server/src/agent/schemas/suggestions.ts`
  - `SuggestionChipSchema` (conforming to shared `SuggestionChip` type) + `SuggestionsSchema` + `Suggestions` type export
  - File: `server/src/agent/schemas/index.ts` — re-export

- [ ] **Implement Refinement Agent + buildProductSummary**
  - File: `server/src/agent/refinement-agent.ts`
  - `ProductSummary` type + `buildProductSummary()` (converts prices cents → dollars, deduplicates tiers/subCategories)
  - `runRefinementAgent()` using `generateObject()` with `SuggestionsSchema`
  - System prompt with constrained vocab rules + dynamic suggestion guidance

- [ ] **Update barrel exports**
  - File: `server/src/agent/index.ts`
  - Re-export `runRefinementAgent`, `Suggestions`, `ProductSummary`, `buildProductSummary`

- [ ] **Wire refinement into handlers**
  - File: `server/src/a2ui/handlers/recommend.ts`
  - `handleRecommend`: clear chips → products → fire refinement async
  - `handleRefine`: same pattern
  - `runRefinementInBackground()` private helper with error handling + logging
  - Skip refinement if no products returned OR if `formattedQuery` is undefined (formatter failed)

- [ ] **Expose suggestions in useRecommendations**
  - File: `store/src/hooks/useRecommendations.ts`
  - Add `suggestions: SuggestionChip[]` to return

- [ ] **Create useSuggestions hook**
  - File: `store/src/hooks/useSuggestions.ts`
  - Fade-in visibility management

- [ ] **Render chips in HomePage**
  - File: `store/src/pages/HomePage.tsx`
  - Chip rendering with fade-in CSS + click handler

- [ ] **Add chip styles**
  - File: `store/src/index.css`
  - `.suggestion-chips` + `.suggestion-chip` + fade-in transition

- [ ] **Write refinement agent + buildProductSummary tests**
  - File: `server/tests/refinement-agent.integration.test.ts`
  - Tests 1-6 from Section 3 (agent tests + buildProductSummary tests in same file)

- [ ] **Write background refinement integration tests**
  - File: `server/tests/refinement-background.integration.test.ts`
  - Tests 7-12 from Section 3 (includes formatter-failed skip test)

- [ ] **Update existing handler tests**
  - File: `server/tests/recommendation-tiered.integration.test.ts`
  - Mock `runRefinementAgent` to prevent real LLM calls

- [ ] **Verify implementation**
  - `pnpm test:integration` — all tests pass
  - `pnpm typecheck` — no type errors
  - `pnpm check` — lint + typecheck clean

---

## 5. Context: Current System Architecture

### Search Pipeline (UF1 — Complete)
Current: `handleRecommend()` → `abortPreviousPipeline()` → `runSearchPipeline(query, { abortSignal })` → broadcasts products via SSE.
- `runSearchPipeline`: `runQueryFormatter()` → `runRecommendationAgent()` with fallback
- Returns `PipelineResult { products, summary, formattedQuery, timings }`
- Diversity filter applied in handler before broadcast
- `formattedQuery` already stored in server-only `SessionRuntime.lastFormattedQuery` for UF2 consumption

### Session Runtime State
- `SessionRuntime`: `{ abortController?, lastRecommendation?, lastFormattedQuery? }`
- `abortPreviousPipeline(sessionId)` → aborts old controller, returns new signal
- `setLastFormattedQuery()` / `getLastFormattedQuery()` — ready for UF2

### SSE Broadcasting
- `broadcastDataModelUpdate(sessionId, path, value)` — updates server data model + sends to clients
- Client-side `applyDataModelUpdate()` in `shared/a2ui-utils.ts` applies path-based updates immutably
- Existing paths: `/status`, `/products`, `/query`, `/ui/query`, `/cart/*`
- New path for UF2: `/suggestions`

### Store SSE Consumption
- `useRecommendations()` hook manages EventSource, stores full `RecommendationDataModel` in state
- `onmessage` handler calls `applyDataModelUpdate()` for all `dataModelUpdate` messages
- Returns `{ products, status, connected, error, search, reconnect }` — needs `suggestions` added

### Key Files
| File | Purpose |
|------|---------|
| `server/src/agent/orchestrator.ts` | Pipeline coordinator — formatter → recommender, timings, logging |
| `server/src/agent/query-formatter.ts` | Query Formatter — `generateObject()` with `FormattedQuerySchema` |
| `server/src/agent/recommendation-agent.ts` | Recommendation Agent — `generateText()` + tools |
| `server/src/agent/openrouter-provider.ts` | Model factory — OpenRouter or local Ollama |
| `server/src/a2ui/handlers/recommend.ts` | `handleRecommend()` / `handleRefine()` — calls pipeline, broadcasts SSE |
| `server/src/a2ui/session.ts` | Session CRUD + abort + runtime state + broadcasting |
| `shared/a2ui-types.ts` | Data model types, `createInitialDataModel()` |
| `store/src/hooks/useRecommendations.ts` | SSE subscription + data model state management |
| `store/src/pages/HomePage.tsx` | Search bar + product grid — target for chip rendering |
| `server/tests/helpers/a2ui-mocks.ts` | `createSSEMockContext()`, `createEventMockContext()` |

---

## 6. Reference Implementations

- **Structured output pattern**: `server/src/agent/query-formatter.ts` — `generateObject({ model, schema, system, prompt, abortSignal })`. Refinement agent follows identical pattern with `SuggestionsSchema`.
- **Handler async pattern**: `server/src/a2ui/handlers/recommend.ts:handleRecommend()` — status → pipeline → broadcast → status. Refinement adds a non-blocking fire-and-forget step after broadcast.
- **Test mocking pattern**: `server/tests/recommendation-tiered.integration.test.ts` — `vi.mock("../src/agent/index.js")` + `createSSEMockContext()` + `createEventMockContext()`. Background refinement tests follow same structure with additional mock for refinement agent.
- **Abort handling pattern**: `server/src/a2ui/handlers/recommend.ts:112-114` — catch `AbortError` by name, silently return. Refinement background helper uses same pattern.
- **Data model update pattern**: `shared/a2ui-utils.ts:applyDataModelUpdate()` — path-based immutable updates. `/suggestions` follows same mechanism as `/products`.
- **Schema + barrel export pattern**: `server/src/agent/schemas/formatted-query.ts` + `server/src/agent/schemas/index.ts` — schema in dedicated file, re-exported from barrel.

---

## Notes

- **No database changes** — no Prisma schema modifications for UF2.
- **UF3 preparation** — Chip click currently fires a fresh `search` action (not `refine`), clearing `lastRecommendation` and `lastFormattedQuery`. Chips act as search modifiers, not refinements. UF3 will replace this with the `RefinementContext` pattern for proper context-aware re-runs.
- **`ProductSummary` placement** — Both `ProductSummary` type and `buildProductSummary()` function live in `refinement-agent.ts` (primary consumer), exported via barrel. This keeps the refinement domain self-contained.
- **`SuggestionChip` type ownership** — Canonical type defined in `shared/a2ui-types.ts` (follows CLAUDE.md cross-boundary type convention). Server Zod schema conforms to the shared type but does not define it.
- **Price conversion** — `buildProductSummary()` converts prices from cents to dollars for cleaner LLM input. The refinement agent system prompt references dollar amounts.
- **Formatter failure** — If `formattedQuery` is `undefined` (formatter failed, raw query fallback used), refinement is skipped entirely. No chips is better than poorly-targeted chips.
- **AbortError handling** — Refinement's `runRefinementInBackground` must silently ignore `AbortError` (not broadcast error status) since a new pipeline is already in flight.
- **Redundant suggestion clear** — Client-side `createInitialDataModel()` in `useRecommendations.search()` already clears suggestions locally. Server-side broadcast of `{ chips: [] }` is kept as defense in depth for consistency.
