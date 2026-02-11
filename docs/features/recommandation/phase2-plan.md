# Phase 2 Completion Plan: Dynamic Data Binding

## Status Assessment

### Already Implemented in Phase 1

Most of the Phase 2 functionality was implemented during Phase 1:

| Feature | Status | Location |
|---------|--------|----------|
| Search handler with DB integration | ✅ Done | `server/src/a2ui/event.ts:72-108` |
| Cart handler with DB integration | ✅ Done | `server/src/a2ui/event.ts:123-159` |
| Data binding resolution | ✅ Done | `web/src/components/a2ui/utils.ts` |
| List template rendering | ✅ Done | `web/src/components/a2ui/ListRenderer.tsx` |
| Data model updates via SSE | ✅ Done | `server/src/a2ui/session.ts` |
| Frontend data model state | ✅ Done | `web/src/components/a2ui/A2UIRenderer.tsx` |

### Remaining Work

The following items from the Phase 2 plan are still pending:

1. **Refactor handlers into dedicated files** - Extract handlers from `event.ts` into `server/src/a2ui/handlers/`
2. **Write integration tests** - Create `server/tests/a2ui-event.integration.test.ts`

---

## Implementation Plan

### Task 1: Extract Handlers into Dedicated Files

**Rationale**: Better separation of concerns and maintainability for Phase 3 when LLM-powered recommendations will need more complex handler logic.

#### Files to Create

| File | Purpose |
|------|---------|
| `server/src/a2ui/handlers/search.ts` | Search action handler |
| `server/src/a2ui/handlers/cart.ts` | Cart action handlers (addToCart, selectProduct) |
| `server/src/a2ui/handlers/index.ts` | Barrel exports |

#### Changes to `server/src/a2ui/event.ts`

- Import handlers from `./handlers`
- Remove inline `handleSearch`, `handleSelectProduct`, `handleAddToCart` functions
- Keep `a2uiEventHandler` as the router that delegates to handlers

---

### Task 2: Write Integration Tests

**File**: `server/tests/a2ui-event.integration.test.ts`

#### Test Cases

1. **`test_search_action_updates_products`**
   - Setup: Connect SSE client, seed test products
   - Action: POST search action with query
   - Verify: SSE client receives `dataModelUpdate` with products matching query

2. **`test_add_to_cart_action`**
   - Setup: Connect SSE client, have a product ID ready
   - Action: POST addToCart action
   - Verify: SSE client receives `dataModelUpdate` with cart state (items, totalQuantity, totalPrice)

3. **`test_invalid_session_returns_error`**
   - Setup: No SSE connection
   - Action: POST with non-existent sessionId
   - Verify: Response is 404 with error message

4. **`test_missing_action_returns_error`**
   - Action: POST with missing action field
   - Verify: Response is 400

5. **`test_search_empty_query_returns_empty_products`**
   - Setup: Connect SSE client
   - Action: POST search with empty query
   - Verify: SSE client receives empty products array

---

## File Changes Summary

| Action | File |
|--------|------|
| CREATE | `server/src/a2ui/handlers/search.ts` |
| CREATE | `server/src/a2ui/handlers/cart.ts` |
| CREATE | `server/src/a2ui/handlers/index.ts` |
| MODIFY | `server/src/a2ui/event.ts` |
| MODIFY | `server/src/a2ui/index.ts` (add handlers export) |
| CREATE | `server/tests/a2ui-event.integration.test.ts` |

---

## Estimated Scope

- 3 new files (handlers)
- 2 modified files
- 1 new test file (~150-200 lines)
- Total: ~250-300 lines of code

---

## Out of Scope (Deferred to Phase 3+)

- Session persistence (keeping in-memory for POC)
- LLM-powered recommendations
- "Why recommended" explanations
- Intent extraction from natural language

---

## Approval Checklist

- [ ] Refactor handlers into `server/src/a2ui/handlers/`
- [ ] Write integration tests for event endpoint
- [ ] Verify existing functionality still works after refactor
