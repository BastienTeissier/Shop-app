# Implementation Plan: Product Recommendation v2 - UF1

## 1. Feature Description

**Objective**: Launch product recommendations directly from tool input query with AI-inferred sub-category diversity enforcement. Widget opens with recommendations pre-loaded, removing in-widget search field.

**Key Capabilities**:
- **CAN** invoke recommendation tool with query parameter from main chat
- **CAN** display recommendations immediately on widget load with tiers (Essential/Recommended/Optional)
- **CAN** infer sub-categories from product data (title, description, category) via AI
- **CAN** enforce max 1 product per sub-category globally across all tiers
- **CAN** show fewer products when insufficient unique sub-categories exist
- **CAN** handle empty query by auto-searching "popular products"
- **CAN** fall back to non-filtered recommendations if AI inference fails
- **CANNOT** show duplicate sub-categories in same recommendation set
- **CANNOT** display search field inside widget (removed)
- **CANNOT** store sub-categories in database (runtime inference only)

**Business Rules**:
- Sub-category diversity enforced globally: if Essential tier has "ski-jacket", no other tier can show another "ski-jacket"
- Empty/missing query triggers auto-search for "popular products"
- AI must return `subCategory` field per product in JSON response
- Diversity filtering happens after AI agent completes, before rendering
- If AI inference fails, show recommendations without diversity filtering (fallback)
- Logging at INFO level for sub-category inference and filtering actions

---

## 2. Architecture

### Files to Modify:

#### A. ⚪ `server/src/agent/recommendation-agent.ts`
**Purpose**: Extend AI agent to infer and return sub-categories per product

**Changes**:
- Update `SYSTEM_PROMPT` to instruct AI to infer sub-category from product title/description/category
- Update `RecommendationResult` type to include `subCategory?: string` field per product
- Modify JSON response format in user prompt to include `"subCategory": "<string>"`
- Update response parsing to extract and validate `subCategory` field
- Add fallback logic: if `subCategory` missing, set to `undefined` (allows fallback behavior)

**Why**: AI must explicitly categorize products into sub-categories for diversity filtering. Extending existing agent is simpler than post-hoc inference.

---

#### B. 🟢 `server/src/a2ui/handlers/recommend.ts` - Add diversity filter
**Purpose**: Apply sub-category diversity filtering after AI agent completes

**Changes**:
- Add new function `applyDiversityFilter(products: RecommendationResult['products']): RecommendationResult['products']`
  - Input: Array of products with `subCategory` field
  - Logic: Iterate products, track seen sub-categories in a `Set`, keep only first occurrence per sub-category
  - Return: Filtered array with max 1 product per sub-category
  - Log at INFO level: filtered product IDs and their sub-categories
- Modify `handleRecommend()`: call `applyDiversityFilter()` after `runRecommendationAgent()` and before broadcasting
- Modify `handleRefine()`: call `applyDiversityFilter()` after refinement agent completes
- Add fallback: if no products have `subCategory` defined, skip filtering and log INFO message

**Why**: Centralized filtering ensures consistency across initial and refined recommendations. Post-search filtering keeps AI prompt simple.

---

#### C. ⚪ `server/src/a2ui/surface.ts`
**Purpose**: Remove InputRenderer component from surface definition

**Changes**:
- Delete the header row containing `InputRenderer` (lines 21-35)
- Keep status banner, tieredList, refineInput, and cart indicator

**Why**: Per PRD, search field removed from widget. Query comes from tool invocation only.

---

#### D. ⚪ `server/src/a2ui/stream.ts`
**Purpose**: Auto-trigger search for "popular products" when query is empty

**Changes**:
- In `a2uiStreamHandler()`, after getting/creating session:
  - If `initialQuery` is empty or missing, set `initialQuery = "popular products"`
  - Update session data model with this query
- Dynamically import and call `handleRecommend(sessionId, initialQuery)` to trigger search

**Why**: PRD specifies empty query should trigger auto-search instead of showing empty state. Provides better UX than blank widget.

---

#### E. ⚪ `shared/a2ui-types.ts` - Extend product type
**Purpose**: Add `subCategory` field to product schema

**Changes**:
- Locate product type definition in `RecommendationDataModel` (around line 120-130)
- Add `subCategory?: string` field to product object

**Why**: Frontend needs to receive sub-category data for potential future display/debugging, though not shown to user per PRD.

---

#### F. ⚪ `server/src/a2ui/handlers/recommend.ts` - Add logging
**Purpose**: Log sub-category inference and filtering actions at INFO level

**Changes**:
- In `handleRecommend()` before diversity filter: log count of products with/without sub-categories
- In `applyDiversityFilter()`: log each filtered product with format: `INFO: Filtered duplicate sub-category "${subCategory}" - Product ID: ${id}`
- Log final filtered count: `INFO: Diversity filter: ${originalCount} → ${filteredCount} products`
- If fallback triggered (no sub-categories): log `INFO: Sub-category inference failed, showing all products`

**Why**: INFO-level logging per user requirement. Helps debug diversity logic without verbose DEBUG output.

---

## 3. Test List

### Test File: `server/tests/recommendation-diversity.integration.test.ts` 🟢

1. **`test_diversity_filter_removes_duplicate_subcategories`**
   - Setup: Array with 3 products, 2 have same subCategory "ski-jacket"
   - Call: `applyDiversityFilter(products)`
   - Verify: Result has 2 products, only first "ski-jacket" kept, second removed

2. **`test_diversity_filter_respects_global_tiers`**
   - Setup: Essential tier has "ski-jacket", Recommended tier has different "ski-jacket"
   - Call: `applyDiversityFilter(allProducts)`
   - Verify: Only Essential "ski-jacket" kept, Recommended filtered out

3. **`test_diversity_filter_handles_no_subcategory_field`**
   - Setup: Products with `subCategory: undefined`
   - Call: `applyDiversityFilter(products)`
   - Verify: All products returned (no filtering), INFO log says "inference failed"

4. **`test_diversity_filter_logs_filtered_products`**
   - Setup: Products with duplicate sub-categories
   - Call: `applyDiversityFilter(products)` with log spy
   - Verify: INFO log contains "Filtered duplicate sub-category" for each removed product

### Test File: `server/tests/recommendation-agent.integration.test.ts` ⚪

5. **`test_agent_returns_subcategory_per_product`**
   - Query: "skiing gear"
   - Call: `runRecommendationAgent(query)`
   - Verify: Each product has `subCategory` field (string or undefined)

6. **`test_empty_query_triggers_popular_products`**
   - Query: "" (empty)
   - Call MCP tool: `product-recommendations` with empty query
   - Verify: Widget receives products for "popular products" query

7. **`test_recommendations_with_diversity_applied`**
   - Query: "hiking gear"
   - Mock: AI returns 5 products, 2 with "hiking-boots" sub-category
   - Verify: Final result has 4 products, only 1 "hiking-boots"

8. **`test_shows_fewer_products_when_all_same_subcategory`**
   - Query: "running shoes"
   - Mock: AI returns 3 products, all "running-shoes" sub-category
   - Verify: Final result has 1 product

9. **`test_fallback_when_ai_inference_fails`**
   - Query: "outdoor gear"
   - Mock: AI returns products without `subCategory` field
   - Verify: All products shown, INFO log indicates fallback

---

## 4. To Do List

### Implementation Tasks:

- [ ] **Update AI agent to infer sub-categories**
  - File: `server/src/agent/recommendation-agent.ts`
  - Update `SYSTEM_PROMPT`: Add instruction "For each product, infer a specific sub-category (e.g., 'ski-jacket', 'hiking-boots') from the title, description, and category. Be specific: distinguish between 'ski-jacket' and 'rain-jacket', not just 'jacket'."
  - Update `RecommendationResult` interface: Add `subCategory?: string` to product type
  - Update user prompt JSON format: Add `"subCategory": "<string>"` field
  - Update response parsing: Extract `subCategory` field, default to `undefined` if missing

- [ ] **Extend shared types**
  - File: `shared/a2ui-types.ts`
  - Find product type in `RecommendationDataModel` (search for `products:` array definition)
  - Add `subCategory?: string` field to product object type

- [ ] **Add diversity filter function**
  - File: `server/src/a2ui/handlers/recommend.ts`
  - Create function: `function applyDiversityFilter(products: Array<{id: number; subCategory?: string; ...}>): typeof products`
  - Logic:
    ```typescript
    const seen = new Set<string>();
    const filtered: typeof products = [];
    for (const product of products) {
      if (!product.subCategory) {
        filtered.push(product); // Keep products without sub-category
        continue;
      }
      if (!seen.has(product.subCategory)) {
        seen.add(product.subCategory);
        filtered.push(product);
      } else {
        console.info(`Filtered duplicate sub-category "${product.subCategory}" - Product ID: ${product.id}`);
      }
    }
    return filtered;
    ```
  - Add logging: Count filtered products and log summary

- [ ] **Integrate diversity filter into handleRecommend**
  - File: `server/src/a2ui/handlers/recommend.ts`
  - In `handleRecommend()`, after `await runRecommendationAgent(query)`:
    - Log: `console.info(\`Diversity filter: ${result.products.length} products before filtering\`)`
    - Call: `const filteredProducts = applyDiversityFilter(result.products)`
    - Log: `console.info(\`Diversity filter: ${result.products.length} → ${filteredProducts.length} products\`)`
    - Use `filteredProducts` instead of `result.products` for broadcasting

- [ ] **Integrate diversity filter into handleRefine**
  - File: `server/src/a2ui/handlers/recommend.ts`
  - In `handleRefine()`, after `await runRecommendationAgent(refinementQuery, {...})`:
    - Apply same diversity filter logic as in `handleRecommend()`
    - Use filtered products for broadcasting and session storage

- [ ] **Add fallback logging for missing sub-categories**
  - File: `server/src/a2ui/handlers/recommend.ts`
  - In `applyDiversityFilter()`, before returning:
    - Count products with `subCategory === undefined`
    - If all products lack sub-categories: `console.info('Sub-category inference failed, showing all products without diversity filtering')`

- [ ] **Remove InputRenderer from surface**
  - File: `server/src/a2ui/surface.ts`
  - Delete header row component (lines 20-35) containing `type: "input"` with `id: "search-input"`
  - Verify remaining components: status-message, product-list, refine-input, cart-indicator

- [ ] **Add empty query auto-search**
  - File: `server/src/a2ui/stream.ts`
  - In `a2uiStreamHandler()`, after `const initialQuery = (req.query.query as string) || "";`:
    - Add: `const queryToUse = initialQuery.trim() || "popular products";`
    - Update session data model: `session.dataModel.query = queryToUse;`
    - After `sendInitialRender()`, dynamically import: `const { handleRecommend } = await import('./handlers/recommend.js');`
    - Call: `handleRecommend(sessionId, queryToUse);`

- [ ] **Write diversity filter unit tests**
  - File: `server/tests/recommendation-diversity.integration.test.ts` (new file)
  - Test: `test_diversity_filter_removes_duplicate_subcategories` - Verify duplicate filtering
  - Test: `test_diversity_filter_respects_global_tiers` - Verify global scope
  - Test: `test_diversity_filter_handles_no_subcategory_field` - Verify fallback
  - Test: `test_diversity_filter_logs_filtered_products` - Verify INFO logging

- [ ] **Write recommendation agent integration tests**
  - File: `server/tests/recommendation-agent.integration.test.ts`
  - Test: `test_agent_returns_subcategory_per_product` - Verify AI returns sub-categories
  - Test: `test_empty_query_triggers_popular_products` - Verify auto-search
  - Test: `test_recommendations_with_diversity_applied` - Verify end-to-end filtering
  - Test: `test_shows_fewer_products_when_all_same_subcategory` - Verify constraint handling
  - Test: `test_fallback_when_ai_inference_fails` - Verify fallback behavior

- [ ] **Verify implementation**
  - Run: `pnpm test:integration` - All tests pass
  - Run: `pnpm dev` - Start server
  - Test: Invoke tool with query "skiing gear" → Verify no duplicate sub-categories
  - Test: Invoke tool with empty query → Verify "popular products" search triggered
  - Check logs: Verify INFO-level logging for diversity filtering
  - Test: Search "running shoes" → Verify fewer products if all same sub-category

---

## 5. Context: Current System Architecture

### A2UI Recommendation System
Current behavior:
- Widget opens with InputRenderer (search field) visible inside widget
- User must manually type query in widget to trigger search
- SSE streaming architecture: widget connects to `/api/a2ui/stream`, receives real-time updates
- Data model updates broadcast via `dataModelUpdate` messages

Current limitations:
- Search field inside widget violates new UX requirement (query should come from tool input)
- No sub-category diversity enforcement - AI can return multiple products from same sub-category
- Empty query shows idle state, doesn't auto-trigger search

### Recommendation Agent
Current behavior:
- `runRecommendationAgent()` uses AI SDK with OpenRouter model
- System prompt instructs AI to search products, rank them, assign tiers (Essential/Recommended/Optional)
- AI returns JSON with `products` array containing `id`, `title`, `description`, `price`, `tier`, `highlights`, `reasonWhy`
- Uses `searchProductsTool` and `rankProductsTool` to find/filter products

Current limitations:
- No sub-category field in response format
- No instruction to infer sub-categories from product data
- No diversity filtering applied to results

### Product Data
Current state:
- Database: `Product` table with `id`, `title`, `description`, `imageUrl`, `price`, `category`
- `category` field exists but is generic (e.g., "ski", "hiking", "apparel")
- No sub-category field in database (intentional - PRD specifies runtime inference only)

### Key Files
| File | Purpose |
|------|---------|
| `server/src/agent/recommendation-agent.ts` | AI agent orchestration, prompt engineering, response parsing |
| `server/src/a2ui/handlers/recommend.ts` | Handles "search" and "refine" actions, broadcasts results to clients |
| `server/src/a2ui/stream.ts` | SSE endpoint, handles client connections, sends initial render |
| `server/src/a2ui/surface.ts` | Defines UI component tree (InputRenderer, status, tieredList, refineInput) |
| `server/src/agent/tools/search-products.ts` | Database query tool for AI agent |
| `shared/a2ui-types.ts` | Type definitions for A2UI components and data model |
| `web/src/components/a2ui/A2UIRenderer.tsx` | Frontend SSE client, renders components from surface |
| `web/src/components/a2ui/InputRenderer.tsx` | Search input component (to be removed) |

---

## 6. Reference Implementations

### Filtering Pattern
**File**: `server/src/agent/tools/rank-products.ts` (lines 44-49)
- Pattern: Filter array by predicate, return filtered subset
- Example: Budget filtering `filtered = filtered.filter((p) => p.price <= budget);`
- Applies to: Diversity filter using `Set` to track seen sub-categories

### Data Transformation with Map
**File**: `server/src/agent/tools/rank-products.ts` (lines 52-74)
- Pattern: Transform array items, add computed fields
- Example: Add `score` and `matchedPreferences` to each product
- Applies to: AI agent response parsing - extract `subCategory` field per product

### Handler with Broadcasting
**File**: `server/src/a2ui/handlers/cart.ts` (lines 67-76)
- Pattern: Helper function wraps `broadcastDataModelUpdate()` with specific data structure
- Example: `broadcastCartUpdate()` updates `/cart` path with snapshot
- Applies to: Broadcasting filtered products in `handleRecommend()` and `handleRefine()`

### Logging with INFO Level
**File**: `server/src/agent/tools/search-products.ts` (lines 45-46, 49-50)
- Pattern: `console.log()` with descriptive message and variable interpolation
- Example: `console.log(\`searchProductsTool: found ${products.length} products for query "${query}"\`)`
- Applies to: Diversity filter logging - use same format for consistency

### AI Agent System Prompt Extension
**File**: `server/src/agent/recommendation-agent.ts` (lines 6-27)
- Pattern: Multi-line template literal with numbered instructions
- Example: System prompt lists 6 responsibilities for the agent
- Applies to: Add step 7 for sub-category inference with specific examples

### Response Parsing with Fallback
**File**: `server/src/agent/recommendation-agent.ts` (lines 126-163)
- Pattern: Try-catch with JSON regex extraction, validate fields, provide defaults
- Example: `tier: isValidTier(p.tier) ? p.tier : undefined`
- Applies to: Parse `subCategory` field, default to `undefined` if missing/invalid

### Dynamic Import in Handler
**File**: `server/src/a2ui/stream.ts` (would need to add)
- Pattern: Use `await import()` to avoid circular dependencies
- Example: Import handler function only when needed in SSE stream
- Applies to: Call `handleRecommend()` after sending initial render in stream handler

---

## Complexity Rating

**Medium**: 5-10 behaviors across multiple files. Involves:
- AI prompt modification (low risk)
- Post-processing filter logic (straightforward Set-based deduplication)
- Surface definition change (simple deletion)
- Handler integration (reuse existing broadcast patterns)
- No database migrations required
- No external API integrations

---
