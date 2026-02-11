# Implementation Plan: Product Recommendation (UF1-UF3)

## 1. Feature Description

**Objective**: Extend existing A2UI recommendation widget to display tiered product bundles with refinement support.

**Key Capabilities**:
- **CAN** request activity-based recommendations via natural language in chat
- **CAN** view products grouped into 3 tiers: Essential, Recommended, Optional
- **CAN** refine recommendations with follow-up messages (exclude items, change budget)
- **CAN** add individual products to cart from recommendation display
- **CANNOT** add entire bundle to cart with one click
- **CANNOT** save or share recommendations

**Business Rules**:
- LLM assigns product tiers based on activity relevance (no predefined mapping)
- Recommendations are session-scoped (no persistence across sessions)
- No stock consideration for this iteration
- Budget filtering converts user input to cents (e.g., "$100" → 10000)

**Complexity**: Medium (extends existing agent + A2UI, adds tier grouping, refinement handler)

---

## 2. Architecture

### Database Changes:

#### A. `prisma/schema.prisma`
**Purpose**: Add category field to enable activity-based filtering.

**Changes**:
- 🟢 Add `category String?` field to `Product` model

**Why**: LLM can filter products by category for better activity matching (e.g., "skiing" → category LIKE "%ski%").

---

#### B. Migration + Seed Script
**Purpose**: Populate category data.

**Changes**:
- 🟢 Run `pnpm db:migrate` to add column
- ⚪ Update `scripts/load-products.ts` or manually assign categories to existing products

**Why**: Existing products need category values.

---

### Backend Changes:

#### C. `server/src/db/products.ts`
**Purpose**: Support category-based search.

**Changes**:
- ⚪ Update `productList()` to accept optional `category` filter
- 🟢 Add `productListByCategories(categories: string[], limit?)` function

**Why**: Agent tool needs to search by activity-related categories.

---

#### D. `server/src/agent/tools/search-products.ts`
**Purpose**: Add category parameter to search tool.

**Changes**:
- ⚪ Add `categories?: string[]` to input schema
- ⚪ Call `productListByCategories()` when categories provided

**Why**: LLM can now search "ski, winter-apparel" for skiing activity.

---

#### E. `server/src/agent/recommendation-agent.ts`
**Purpose**: Update prompt for tiered recommendations + category usage.

**Changes**:
- ⚪ Update `SYSTEM_PROMPT`:
  - Instruct LLM to identify relevant categories from activity
  - Instruct LLM to assign tier (essential/recommended/optional) to each product
- ⚪ Update `RecommendationResult.products` type to include `tier`
- ⚪ Update JSON output format in prompt

**Why**: Core change enabling tiered display + better search.

---

#### F. `shared/a2ui-types.ts`
**Purpose**: Add tier field and refinement context.

**Changes**:
- ⚪ Extend `RecommendationProduct` with `tier: "essential" | "recommended" | "optional"`
- 🟢 Add `TieredListComponent` type for A2UI registry
- 🟢 Add `RefinementContext` type (lastQuery, lastProducts)

**Why**: Type safety for new features.

---

#### G. `server/src/a2ui/session.ts`
**Purpose**: Store refinement context.

**Changes**:
- ⚪ Add `lastRecommendation` to `RecommendationDataModel` (query + products)
- 🟢 Add `setLastRecommendation()`, `getLastRecommendation()` helpers

**Why**: Refinement needs previous context.

---

#### H. `server/src/a2ui/handlers/recommend.ts`
**Purpose**: Store context after recommendation, support refinement.

**Changes**:
- ⚪ After successful recommendation, call `setLastRecommendation()`
- 🟢 Add `handleRefine(sessionId, refinementQuery)` that passes previous context to agent

**Why**: Enables UF2 refinement flow.

---

#### I. `server/src/a2ui/event.ts`
**Purpose**: Route refinement action.

**Changes**:
- 🟢 Add `case "refine":` handler

**Why**: New action type for refinement input.

---

#### J. `server/src/a2ui/surface.ts`
**Purpose**: Update surface for tiered display + refinement.

**Changes**:
- ⚪ Replace `list` component with `tieredList` component
- 🟢 Add `refineInput` component below product list

**Why**: New UI structure.

---

### Frontend Changes:

#### K. `web/src/components/a2ui/TieredListRenderer.tsx` 🟢
**Purpose**: Group products by tier with section headers.

**Changes**:
- 🟢 New component:
  - Groups products by `tier` field
  - Renders section headers ("Essential", "Recommended", "Optional")
  - Uses existing `ProductCard` for each product
  - Shows tier icon/badge

**Why**: Core UI for UF1.

---

#### L. `web/src/components/a2ui/RefineInput.tsx` 🟢
**Purpose**: Input for follow-up refinements.

**Changes**:
- 🟢 New component:
  - Text input + submit button
  - Sends `refine` action with query payload
  - Placeholder: "Refine: 'I already have goggles', 'show budget options'..."

**Why**: Entry point for UF2.

---

#### M. `web/src/components/a2ui/registry.tsx`
**Purpose**: Register new components.

**Changes**:
- ⚪ Add `tieredList: TieredListRenderer`
- ⚪ Add `refineInput: RefineInput`

**Why**: Enable A2UI to render new components.

---

#### N. `web/src/index.css`
**Purpose**: Style tier sections and refinement input.

**Changes**:
- 🟢 Add `.tier-section`, `.tier-header` styles
- 🟢 Add tier-specific colors (essential=green, recommended=blue, optional=gray)
- 🟢 Add `.refine-input` styles

**Why**: Visual distinction between tiers.

---

## 3. Test List

### Integration Tests: `server/tests/recommendation-tiered.integration.test.ts` 🟢

1. **`test_recommend_returns_tiered_products`**
   - Mock agent returns products with tier field
   - Verify SSE broadcasts products grouped by tier

2. **`test_recommend_uses_category_search`**
   - Query "skiing" → agent calls `search_products` with categories ["ski", "winter"]
   - Verify agent receives category-filtered products

3. **`test_refine_action_excludes_category`**
   - Initial: recommend skiing gear
   - Refine: "I already have a jacket"
   - Verify: updated products exclude jacket category

4. **`test_refine_action_filters_by_budget`**
   - Initial: recommend skiing gear
   - Refine: "show options under $100"
   - Verify: agent receives budget constraint (10000 cents)

5. **`test_refine_without_prior_recommendation_returns_error`**
   - Call refine action on fresh session (no prior search)
   - Verify: error status "No previous recommendation to refine"

6. **`test_empty_tier_not_displayed`**
   - Agent returns products only in "essential" tier
   - Verify: recommended and optional tiers not in response

### Unit Tests: `server/src/db/products.test.ts` 🟢

7. **`test_productListByCategories_filters_correctly`**
   - Query with categories ["ski", "boots"]
   - Verify: returns only products matching those categories

8. **`test_productListByCategories_empty_categories_returns_all`**
   - Query with empty categories array
   - Verify: falls back to regular search behavior

### Component Tests: `web/src/components/a2ui/TieredListRenderer.test.tsx` 🟢

9. **`test_groups_products_by_tier`**
   - Render with products having different tiers
   - Verify: 3 tier sections rendered with correct products

10. **`test_renders_tier_headers`**
    - Render with all tiers populated
    - Verify: "Essential", "Recommended", "Optional" headers visible

11. **`test_empty_state_shows_message`**
    - Render with empty products array
    - Verify: empty message displayed

12. **`test_single_tier_only_renders_that_tier`**
    - Render with products only in "essential" tier
    - Verify: only essential section rendered

### Component Tests: `web/src/components/a2ui/RefineInput.test.tsx` 🟢

13. **`test_submit_sends_refine_action`**
    - Type "I already have boots", submit
    - Verify: `onAction("refine", { query: "..." })` called

14. **`test_empty_input_disabled`**
    - Empty input field
    - Verify: submit button disabled

---

## 4. To Do List

### Phase 1: Database & Types (UF1 Foundation)

- [ ] **Add category field to Product model**
  - File: `prisma/schema.prisma`
  - Add `category String?` field

- [ ] **Run migration**
  - Command: `pnpm db:migrate --name add_product_category`

- [ ] **Assign categories to products**
  - File: `scripts/load-products.ts` or manual SQL
  - Map existing products to categories (ski, beach, running, etc.)

- [ ] **Add tier field to RecommendationProduct type**
  - File: `shared/a2ui-types.ts`
  - Add `tier: "essential" | "recommended" | "optional"` field

- [ ] **Add TieredListComponent type**
  - File: `shared/a2ui-types.ts`
  - New component type with binding, template, emptyMessage

### Phase 2: Backend - Category Search (UF1)

- [ ] **Add productListByCategories function**
  - File: `server/src/db/products.ts`
  - Filter by category OR array

- [ ] **Update search_products tool with categories param**
  - File: `server/src/agent/tools/search-products.ts`
  - Add `categories?: string[]` to input schema

- [ ] **Update agent prompt for tiered output + category usage**
  - File: `server/src/agent/recommendation-agent.ts`
  - Instruct LLM to: identify categories, assign tiers, return structured JSON

- [ ] **Update RecommendationResult type**
  - File: `server/src/agent/recommendation-agent.ts`
  - Add `tier` to products array

### Phase 3: Backend - Refinement (UF2)

- [ ] **Add lastRecommendation to session**
  - File: `server/src/a2ui/session.ts`
  - Store query + products after successful recommendation

- [ ] **Add handleRefine function**
  - File: `server/src/a2ui/handlers/recommend.ts`
  - Pass previous context to agent for refinement

- [ ] **Add refine action to event handler**
  - File: `server/src/a2ui/event.ts`
  - New case for "refine" action

### Phase 4: Frontend - Tiered Display (UF1)

- [ ] **Create TieredListRenderer component**
  - File: `web/src/components/a2ui/TieredListRenderer.tsx`
  - Group products by tier, render headers

- [ ] **Register TieredListRenderer**
  - File: `web/src/components/a2ui/registry.tsx`
  - Add to registry

- [ ] **Update surface to use tieredList**
  - File: `server/src/a2ui/surface.ts`
  - Replace `list` with `tieredList` component

- [ ] **Add tier styles**
  - File: `web/src/index.css`
  - `.tier-section`, `.tier-header`, tier-specific colors

### Phase 5: Frontend - Refinement Input (UF2)

- [ ] **Create RefineInput component**
  - File: `web/src/components/a2ui/RefineInput.tsx`
  - Text input + submit button

- [ ] **Register RefineInput**
  - File: `web/src/components/a2ui/registry.tsx`
  - Add to registry

- [ ] **Add refineInput to surface**
  - File: `server/src/a2ui/surface.ts`
  - Add below product list

### Phase 6: Testing & Verification

- [ ] **Write integration tests**
  - File: `server/tests/recommendation-tiered.integration.test.ts`
  - Tests 1-6 from test list

- [ ] **Write component tests**
  - Files: `TieredListRenderer.test.tsx`, `RefineInput.test.tsx`
  - Tests 9-14 from test list

- [ ] **Run full test suite**
  - Command: `pnpm test:unit && pnpm test:integration`

- [ ] **Run type check and lint**
  - Command: `pnpm check`

---

## 5. Context: Current System Architecture

### Recommendation Agent
Current state: LLM agent (`server/src/agent/recommendation-agent.ts`) with two tools:
- `search_products`: keyword search via `productList(query, limit)`
- `rank_products`: score by budget + keyword matching

**Limitation**: No category-based filtering; relies on title/description keywords only.

### A2UI Infrastructure
Current state: Fully functional SSE-based rendering with:
- Session management (`server/src/a2ui/session.ts`)
- Component registry (`web/src/components/a2ui/registry.tsx`)
- ProductCard with `highlights` and `reasonWhy` display

**Limitation**: Flat product list; no tier grouping; no refinement input.

### Database
Current state: `Product` model with `id, title, description, imageUrl, price`.

**Limitation**: No `category` field for activity-based filtering.

### Key Files

| File | Purpose |
|------|---------|
| `server/src/agent/recommendation-agent.ts` | LLM orchestration with `generateText()` |
| `server/src/agent/tools/search-products.ts` | Search tool wrapping `productList()` |
| `server/src/a2ui/handlers/recommend.ts` | Bridges agent → A2UI broadcast |
| `server/src/a2ui/surface.ts` | A2UI component tree definition |
| `server/src/a2ui/session.ts` | Session state + broadcast helpers |
| `web/src/components/a2ui/ListRenderer.tsx` | Current flat list component |
| `web/src/components/a2ui/ProductCard.tsx` | Product display with add-to-cart |
| `shared/a2ui-types.ts` | All A2UI protocol types |

---

## 6. Reference Implementations

### Similar Patterns in Codebase

| Pattern | File | Reuse for |
|---------|------|-----------|
| A2UI component with binding | `web/src/components/a2ui/ListRenderer.tsx` | TieredListRenderer structure |
| Input with action dispatch | `web/src/components/a2ui/InputRenderer.tsx` | RefineInput component |
| Agent tool definition | `server/src/agent/tools/search-products.ts` | Category search tool extension |
| SSE broadcast pattern | `server/src/a2ui/handlers/recommend.ts` | Refine handler |
| Component registration | `web/src/components/a2ui/registry.tsx` | New component registration |
| Test mock pattern | `server/tests/a2ui-event.integration.test.ts` | New integration tests |

### Agent Prompt Pattern
Current prompt structure in `recommendation-agent.ts`:
```
SYSTEM_PROMPT → Instructions for search/rank/explain
User prompt → JSON output format specification
```
Extend by adding tier assignment instructions to SYSTEM_PROMPT.

### Data Model Update Pattern
`broadcastDataModelUpdate(sessionId, "/products", value)` in `recommend.ts`.
Reuse for storing `lastRecommendation` context.

---

## Notes

- **No breaking changes**: Existing search action continues to work; tier field is optional until fully migrated.
- **Incremental rollout**: Can deploy category field + search tool update before UI changes.
- **LLM flexibility**: Tier assignment by LLM allows adaptation without code changes.

