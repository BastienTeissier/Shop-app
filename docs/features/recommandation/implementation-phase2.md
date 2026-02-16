# Phase 2 Implementation: Dynamic Data Binding

## Summary

Phase 2 completes the dynamic data binding layer by refactoring handlers into dedicated files and adding comprehensive integration tests for the event endpoint.

## What Was Implemented

### Handler Refactoring

Extracted inline handlers from `event.ts` into dedicated files for better separation of concerns:

| File | Purpose |
|------|---------|
| `server/src/a2ui/handlers/search.ts` | Search action handler - queries products via `productList()` and broadcasts results |
| `server/src/a2ui/handlers/cart.ts` | Cart handlers - `handleSelectProduct()` and `handleAddToCart()` |
| `server/src/a2ui/handlers/index.ts` | Barrel exports for all handlers |

### Modified Files

| File | Changes |
|------|---------|
| `server/src/a2ui/event.ts` | Refactored to import handlers from `./handlers/`, removed inline implementations |
| `server/src/a2ui/index.ts` | Added exports for handlers |

### Integration Tests

Created `server/tests/a2ui-event.integration.test.ts` with 7 test cases:

| Test | Description |
|------|-------------|
| `test_search_action_updates_products` | Verifies search broadcasts products to SSE client |
| `test_add_to_cart_action` | Verifies addToCart broadcasts cart state |
| `test_invalid_session_returns_error` | POST with non-existent session returns 404 |
| `test_missing_action_returns_error` | Missing action field returns 400 |
| `test_missing_sessionId_returns_error` | Missing sessionId returns 400 |
| `test_search_empty_query_returns_empty` | Empty query returns empty products array |
| `test_unknown_action_returns_error` | Unknown action returns 400 |

## File Structure

```
server/src/a2ui/
├── handlers/
│   ├── index.ts      # Barrel exports
│   ├── search.ts     # handleSearch()
│   └── cart.ts       # handleSelectProduct(), handleAddToCart()
├── event.ts          # Action router (refactored)
├── session.ts        # Session management (unchanged)
├── stream.ts         # SSE endpoint (unchanged)
├── surface.ts        # UI structure (unchanged)
└── index.ts          # Module exports (updated)

server/tests/
├── a2ui-stream.integration.test.ts   # Phase 1 tests
└── a2ui-event.integration.test.ts    # Phase 2 tests (NEW)
```

## Handler Flow

```
POST /api/a2ui/event
        │
        ▼
┌─────────────────┐
│  a2uiEventHandler │  ← Validates session, routes action
└────────┬────────┘
         │
    ┌────┴────┬─────────────┐
    ▼         ▼             ▼
 search   selectProduct  addToCart
    │         │             │
    ▼         ▼             ▼
┌────────┐  ┌────────┐  ┌────────┐
│handlers│  │handlers│  │handlers│
│/search │  │/cart   │  │/cart   │
└────┬───┘  └────┬───┘  └────┬───┘
     │           │           │
     ▼           ▼           ▼
  productList()    broadcastDataModelUpdate()
     │                       │
     ▼                       ▼
  Prisma DB           SSE clients
```

## Test Results

```
✓ server/tests/a2ui-event.integration.test.ts (7 tests)
✓ server/tests/a2ui-stream.integration.test.ts (6 tests)
✓ server/tests/cart.integration.test.ts (5 tests)
✓ server/tests/cart-summary.integration.test.ts (3 tests)
✓ server/tests/mcp-tools.integration.test.ts (1 test)

Test Files  5 passed (5)
     Tests  22 passed (22)
```

## Code Reuse

- **`productList()`** from `server/src/db/products.ts` - Product search
- **`cartAddItem()`, `cartCreate()`, etc.** from `server/src/db/cart.ts` - Cart operations
- **`broadcastDataModelUpdate()`** from `server/src/a2ui/session.ts` - SSE broadcasting

## What Was NOT Changed

- Session management remains in-memory (intentional for POC)
- No database schema changes
- Frontend components unchanged (already working from Phase 1)

## Next Steps (Phase 3)

Phase 3 will add LLM-powered recommendations:

1. Install OpenAI Agents SDK and AI SDK dependencies
2. Create LLM provider factory for OpenAI/Gemini support
3. Create recommendation agent with tools
4. Add intent extraction from natural language queries
5. Generate "why recommended" explanations
6. Create `handleRecommend()` handler for agent-integrated search
