# Implementation Plan: Cart - UF2 (Manage Cart from Product Carousel)

## 1. Feature Description

**Objective**: Enable optimistic add/remove from carousel with server reconciliation; update cart indicator; show error banner on mismatch or failure.

**Key Capabilities**:
- **CAN** add item optimistically; increment quantity if already in cart
- **CAN** remove line entirely; update cart count immediately
- **CANNOT** keep optimistic state when server snapshot differs (must reconcile to server)

**Business Rules**:
- Add/remove uses `cart` tool; if response differs, replace local cart with server snapshot
- On server error/mismatch, show auto-dismiss banner "An error occur while updating your cart" (3s)
- If cart load fails, show empty cart but still allow optimistic add/remove + reconcile

---

## 2. Architecture

### Files to Modify:

#### A. `server/src/server.ts`
**Purpose**: Cart mutation tool returns authoritative snapshot.

**Changes**:
- ⚪ Extend `cart` tool to return full cart snapshot after add/remove (items + counts).
- 🟢 Include response metadata for optimistic vs. persisted state (for reconciliation decisions).

**Why**: UI must reconcile optimistic state with server snapshot.

---

#### B. `server/src/db.ts`
**Purpose**: Update cart line quantities + snapshot price.

**Changes**:
- 🟢 Add `addToCart(cartId, productId)` (increment qty, snapshot price on first add).
- 🟢 Add `removeFromCart(cartId, productId)` (delete line).
- ⚪ Reuse `getCartSnapshot` for response.

**Why**: UF2 requires add/remove semantics and snapshot prices.

---

#### C. `web/src/components/ecom-carousel.tsx`
**Purpose**: Optimistic UI + reconciliation + error banner.

**Changes**:
- 🟢 Optimistically update local cart state on click; call `cart` tool.
- 🟢 On tool response, replace local cart with server snapshot (source of truth).
- 🟢 If error/mismatch, show banner \"An error occur while updating your cart\" (auto-dismiss 3s).

**Why**: UF2 requires optimistic UX with server reconciliation and error signaling.

---

#### D. `web/src/index.css`
**Purpose**: Banner styling.

**Changes**:
- 🟢 Add minimal styles for inline error banner near top of carousel.

**Why**: Display reconciliation error in UI.

---

## 3. Test List

### Test File: `server/tests/cart.integration.test.ts`

1. **`test_cart_add_increments_quantity`**
   - Verify repeated add increments qty and returns updated snapshot.

2. **`test_cart_remove_deletes_line`**
   - Verify remove deletes line and snapshot reflects removal.

3. **`test_cart_snapshots_price_on_first_add`**
   - Verify priceSnapshot captured from product price at add time.

### Test File: `web/src/components/ecom-carousel.test.tsx`

1. **`test_optimistic_add_then_reconciles_to_server`**
   - Verify immediate UI update then replace with server snapshot.

2. **`test_shows_error_banner_on_reconcile_failure`**
   - Verify banner shows and auto-dismisses after 3s.

---

## 4. To Do List

### Implementation Tasks:

- [ ] **Cart mutation logic**
  - File: `server/src/db.ts`
  - Add `addToCart` (increment qty, snapshot price on first add), `removeFromCart` (delete line), reuse `getCartSnapshot`.

- [ ] **Return authoritative snapshot**
  - File: `server/src/server.ts`
  - Ensure `cart` tool returns full cart snapshot after each mutation.

- [ ] **Optimistic UI + reconciliation**
  - File: `web/src/components/ecom-carousel.tsx`
  - Update local cart immediately; replace with server snapshot on response.

- [ ] **Error banner UI**
  - File: `web/src/components/ecom-carousel.tsx`
  - Show inline banner on error/mismatch; auto-dismiss after 3s.
  - File: `web/src/index.css`
  - Add banner styles.

- [ ] **Write tests**
  - File: `server/tests/cart.integration.test.ts`
  - Test: `test_cart_add_increments_quantity` - qty increment + snapshot.
  - Test: `test_cart_remove_deletes_line` - line removed.
  - Test: `test_cart_snapshots_price_on_first_add` - price snapshot stable.
  - File: `web/src/components/ecom-carousel.test.tsx`
  - Test: `test_optimistic_add_then_reconciles_to_server` - optimistic then replace.
  - Test: `test_shows_error_banner_on_reconcile_failure` - banner shows + dismisses.

- [ ] **Verify implementation**
  - Run `pnpm test:integration` and `pnpm test:unit`.

---

## 5. Context: Current System Architecture

### Carousel Widget
Current behavior:
- Local-only cart (`useWidgetState` of ids), no server calls for cart.
- Cart indicator + modal checkout summary.
Current limitations:
- No optimistic reconciliation with server; no persistence.

### Backend
Current behavior:
- `ecom-carousel` tool returns products only.
Current limitations:
- No cart mutation tool; no snapshot price logic.

### Key Files
| File | Purpose |
|------|---------|
| `web/src/components/ecom-carousel.tsx` | Carousel UI + local cart |
| `server/src/server.ts` | MCP tool registration |
| `server/src/db.ts` | Prisma helper queries |
| `web/src/index.css` | Widget styling |

---

## 6. Reference Implementations

- `server/src/server.ts` — widget/tool registration pattern (⚪ reuse).
- `server/src/db.ts` — query helpers and input validation style (⚪ reuse).
- `web/src/components/ecom-carousel.tsx` — optimistic UI + cart indicator patterns (⚪ reuse).
- `web/src/components/ecom-carousel.test.tsx` — widget tests + Skybridge hook mocks (⚪ reuse).

---

## Notes *(optional)*

- Unresolved questions: none.
