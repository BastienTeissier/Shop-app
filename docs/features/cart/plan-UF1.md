# Implementation Plan: Cart - UF1 (Initialize Anonymous Cart Session)

## 1. Feature Description

**Objective**: Create/validate anonymous cart session on first cart mutation; return `sessionId` to widget; disable cart actions on invalid session while browsing still works.

**Key Capabilities**:
- **CAN** create cart session when add/remove called without `sessionId`, return new UUID + empty cart state
- **CAN** reuse existing cart session when valid `sessionId` provided
- **CANNOT** allow cart actions when `sessionId` invalid (non-UUID or unknown); show error "Invalid cart session"

**Business Rules**:
- `sessionId` is UUID; generated server-side on first add/remove when missing
- Cart does not expire
- If cart creation fails, return empty cart state and keep cart actions disabled

---

## 2. Architecture

### Files to Modify:

#### A. `prisma/schema.prisma`
**Purpose**: Persist anonymous cart sessions + items.

**Changes**:
- 🟢 Add `Cart` (id, sessionId UUID, createdAt) and `CartItem` (id, cartId, productId, quantity, priceSnapshot) models + relations.

**Why**: UF1 needs DB-backed cart keyed by `sessionId`.

---

#### B. `server/src/db.ts`
**Purpose**: Cart session creation/lookup helpers.

**Changes**:
- 🟢 Add `getCartBySessionId(sessionId)` and `createCart(sessionId)` helpers.
- 🟢 Add `getCartSnapshot(cartId)` returning items + totals for tool response.

**Why**: `cart` tool needs reusable DB access + snapshot for response.

---

#### C. `server/src/server.ts`
**Purpose**: Expose cart mutation tool with session bootstrap.

**Changes**:
- ⚪ Reuse `.registerWidget()` pattern to add `cart` tool (action add/remove, sessionId?, productId) with UUID validation.
- 🟢 Generate `sessionId` on missing add/remove; return structuredContent `{ sessionId, cart }` on success; on invalid session return `isError: true` + message `"Invalid cart session"`.

**Why**: UF1 requires session creation and invalid-session handling on first mutation.

---

#### D. `web/src/components/ecom-carousel.tsx`
**Purpose**: Store sessionId + disable cart actions on invalid session.

**Changes**:
- 🟢 Add `useWidgetState` for `{ sessionId?, cartDisabled?, error? }`.
- 🟢 When cart tool responds with `isError`, set `cartDisabled` and show error message; keep product browsing active.

**Why**: Widget must retain `sessionId` and reflect invalid-session state.

---

## 3. Test List

### Test File: `server/tests/cart.integration.test.ts`

1. **`test_cart_creates_session_on_first_add`**
   - Verify `cart` tool add without `sessionId` returns new UUID + empty cart snapshot.

2. **`test_cart_rejects_invalid_session`**
   - Verify non-UUID `sessionId` returns `isError: true` + message `"Invalid cart session"`.

### Test File: `web/src/components/ecom-carousel.test.tsx`

1. **`test_disables_cart_actions_on_invalid_session`**
   - Verify cart buttons disabled + error message shown when tool returns error.

2. **`test_calls_cart_tool_with_expected_args`**
   - Verify add/remove triggers tool call with `{ action, productId, sessionId }`.

---

## 4. To Do List

### Implementation Tasks:

- [ ] **Add cart schema**
  - File: `prisma/schema.prisma`
  - Add `Cart` + `CartItem` models, relations, indexes on `sessionId`.

- [ ] **Create migration + seed impact**
  - File: `prisma/migrations/*`
  - Run `pnpm db:migrate`; ensure seed unaffected.

- [ ] **Add cart DB helpers**
  - File: `server/src/db.ts`
  - Implement `getCartBySessionId`, `createCart`, `getCartSnapshot`.

- [ ] **Register cart tool**
  - File: `server/src/server.ts`
  - Add `cart` tool (add/remove), validate UUID, auto-create session, return `{ sessionId, cart }` or `isError` + message.

- [ ] **Store sessionId + disable cart on invalid**
  - File: `web/src/components/ecom-carousel.tsx`
  - Persist `sessionId` in `useWidgetState`; disable cart actions + show error on tool error.

- [ ] **Write tests**
  - File: `server/tests/cart.integration.test.ts`
  - Test: `test_cart_creates_session_on_first_add` - new UUID + empty cart snapshot.
  - Test: `test_cart_rejects_invalid_session` - `isError` + message.
  - File: `web/src/components/ecom-carousel.test.tsx`
  - Test: `test_disables_cart_actions_on_invalid_session` - UI disabled + error.
  - Test: `test_calls_cart_tool_with_expected_args` - tool invoked with `{ action, productId, sessionId }`.

- [ ] **Verify implementation**
  - Run `pnpm check`, `pnpm test:integration` and `pnpm test:unit`.

---

## 5. Context: Current System Architecture

### MCP Tools + Widgets
Current behavior:
- `ecom-carousel` tool returns product list only; no cart APIs.
- `EcomCarousel` widget uses local `useWidgetState` cart (ids only) and modal checkout.
Current limitations:
- No persistent cart session; no server reconciliation; no cart widget.

### Database
Current behavior:
- Only `Product` table in Prisma; SQLite dev DB.
Current limitations:
- No cart/session tables; no price snapshot persistence.

### Key Files
| File | Purpose |
|------|---------|
| `server/src/server.ts` | Registers `ecom-carousel` tool |
| `server/src/db.ts` | Prisma client + product query |
| `web/src/components/ecom-carousel.tsx` | Carousel UI + local cart state |
| `prisma/schema.prisma` | Product model only |

---

## 6. Reference Implementations

- `server/src/server.ts` — existing `.registerWidget()` pattern for tool registration (⚪ reuse).
- `server/src/db.ts` — Prisma helper functions (⚪ reuse pattern for cart queries).
- `web/src/components/ecom-carousel.tsx` — `useWidgetState` + optimistic UI patterns (⚪ reuse; replace local-only cart).
- `web/src/components/ecom-carousel.test.tsx` — Skybridge hook mocks for widget tests (⚪ reuse).

---

## Notes *(optional)*

- Unresolved questions: none.
