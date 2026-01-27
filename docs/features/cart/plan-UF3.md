# Implementation Plan: Cart - UF3 (View Cart Summary in Cart Widget)

## 1. Feature Description

**Objective**: Provide a dedicated read-only cart summary widget backed by the `cart-summary` tool.

**Key Capabilities**:
- **CAN** render list of cart items (title, image, unit price snapshot, qty, line total)
- **CAN** show subtotal from server response
- **CANNOT** mutate cart (read-only)

**Business Rules**:
- Uses `cart-summary` tool with `sessionId`
- Empty cart renders empty list (no message) and no subtotal
- On load failure, show empty cart summary

---

## 2. Architecture

### Files to Modify:

#### A. `server/src/server.ts`
**Purpose**: Expose read-only cart summary tool.

**Changes**:
- 🟢 Register `cart-summary` tool with input `{ sessionId }` and output `{ sessionId, items, subtotal }`.
- 🟢 Validate UUID; on invalid session return `isError: true` + message `"Invalid cart session"`.

**Why**: UF3 needs dedicated summary API.

---

#### B. `server/src/db.ts`
**Purpose**: Fetch summary data.

**Changes**:
- ⚪ Reuse `getCartBySessionId` + `getCartSnapshot` from UF1/UF2.
- 🟢 Add `getCartSummary(sessionId)` (items with title, image, unit price snapshot, qty, line total, subtotal).

**Why**: Tool needs denormalized summary view.

---

#### C. `web/src/widgets/cart-summary.tsx`
**Purpose**: Widget entry for summary.

**Changes**:
- 🟢 Create widget entry and mount summary component.

**Why**: Tool name must match widget file.

---

#### D. `web/src/components/cart-summary.tsx`
**Purpose**: Read-only UI for cart summary.

**Changes**:
- 🟢 Use `useToolInfo<\"cart-summary\">()` to render list + subtotal.
- 🟢 On error or empty cart, render empty list (no message, no subtotal).

**Why**: UF3 UI requirements.

---

## 3. Test List

### Test File: `server/tests/cart-summary.integration.test.ts`

1. **`test_cart_summary_returns_items_and_subtotal`**
   - Verify response includes item fields + subtotal.

2. **`test_cart_summary_invalid_session`**
   - Verify invalid `sessionId` returns `isError: true` + message.

### Test File: `web/src/components/cart-summary.test.tsx`

1. **`test_renders_items_and_subtotal`**
   - Verify list + subtotal render from tool output.

2. **`test_empty_cart_renders_empty_list_no_subtotal`**
   - Verify empty list and no subtotal on empty cart.

---

## 4. To Do List

### Implementation Tasks:

- [ ] **Register cart-summary tool**
  - File: `server/src/server.ts`
  - Add tool with `{ sessionId }` input, UUID validation, output `{ sessionId, items, subtotal }`.

- [ ] **Add DB summary helper**
  - File: `server/src/db.ts`
  - Implement `getCartSummary(sessionId)` using existing cart helpers.

- [ ] **Add cart summary widget**
  - File: `web/src/widgets/cart-summary.tsx`
  - Mount summary component.

- [ ] **Build read-only summary UI**
  - File: `web/src/components/cart-summary.tsx`
  - Render list + subtotal; empty cart shows empty list, no subtotal.

- [ ] **Write tests**
  - File: `server/tests/cart-summary.integration.test.ts`
  - Test: `test_cart_summary_returns_items_and_subtotal` - fields + subtotal.
  - Test: `test_cart_summary_invalid_session` - `isError` + message.
  - File: `web/src/components/cart-summary.test.tsx`
  - Test: `test_renders_items_and_subtotal` - list + subtotal.
  - Test: `test_empty_cart_renders_empty_list_no_subtotal` - no subtotal.

- [ ] **Verify implementation**
  - Run `pnpm test:integration` and `pnpm test:unit`.

---

## 5. Context: Current System Architecture

### Widgets
Current behavior:
- Only `ecom-carousel` widget exists; no cart summary widget.
Current limitations:
- No read-only cart UI.

### Backend
Current behavior:
- No `cart-summary` tool.
Current limitations:
- No summary endpoint or denormalized cart item view.

### Key Files
| File | Purpose |
|------|---------|
| `web/src/widgets/ecom-carousel.tsx` | Existing widget entry pattern |
| `web/src/components/ecom-carousel.tsx` | Existing component pattern |
| `server/src/server.ts` | Tool registration |
| `server/src/db.ts` | Prisma queries |

---

## 6. Reference Implementations

- `server/src/server.ts` — tool registration pattern (⚪ reuse).
- `server/src/db.ts` — Prisma helper style for queries (⚪ reuse).
- `web/src/widgets/ecom-carousel.tsx` — widget entrypoint pattern (⚪ reuse).
- `web/src/components/ecom-carousel.tsx` — component structure + styling conventions (⚪ reuse).

---

## Notes *(optional)*

- Unresolved questions: none.
