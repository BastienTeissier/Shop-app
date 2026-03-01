# Implementation Plan: UF3 – Order Submission

## 1. Feature Description

**Objective**: Enable users to place orders from the standalone storefront — review cart, enter name + email, submit, and see a confirmation page with order reference.

**Key Capabilities**:
- **CAN** see order review (cart items + total) on checkout page
- **CAN** enter name and email in a form
- **CAN** submit order (persisted to DB with line items)
- **CAN** see confirmation page with reference number, summary, and "Continue shopping" link
- **CAN** refresh confirmation page without re-submitting
- **CANNOT** submit order with empty cart
- **CANNOT** submit order without valid name and email

**Business Rules**:
- Name: required, max 255 characters
- Email: required, valid email format, max 255 characters
- "Place Order" button disabled until both fields valid
- On success: order persisted, cart items deleted from DB, redirect to `/orders/:reference`
- On server error: stay on form, data preserved, error message "Something went wrong. Please try again."
- Empty cart at submit time → "Your cart is empty", order blocked
- Order reference: UUID v4 (`crypto.randomUUID()`)
- Navigate back after order → cart is empty (items deleted server-side, context refreshed)

---

## 2. Architecture

### Files to Modify

#### A. `prisma/schema.prisma`
**Purpose**: Add Order + OrderItem models for order persistence

**Changes**:
- Add `Order` model:
  - `id` (Int, autoincrement PK)
  - `reference` (String, unique) — UUID v4
  - `sessionId` (String, `@map("session_id")`)
  - `customerName` (String, `@map("customer_name")`)
  - `customerEmail` (String, `@map("customer_email")`)
  - `totalPrice` (Int, `@map("total_price")`) — cents
  - `createdAt` (DateTime, `@default(now())`, `@map("created_at")`)
  - `items` relation to `OrderItem[]`
  - `@@map("orders")`

- Add `OrderItem` model:
  - `id` (Int, autoincrement PK)
  - `orderId` (Int, `@map("order_id")`)
  - `productId` (Int, `@map("product_id")`)
  - `title` (String) — snapshot at order time
  - `imageUrl` (String, `@map("image_url")`) — snapshot
  - `unitPrice` (Int, `@map("unit_price")`) — snapshot in cents
  - `quantity` (Int)
  - `order` relation to `Order` (onDelete: Cascade)
  - `@@index([orderId])`
  - `@@map("order_items")`

**Why**: PRD requires order persistence with line items. OrderItem denormalizes product data (title, imageUrl, unitPrice) so confirmation page works regardless of future product changes.

---

#### B. `shared/types.ts`
**Purpose**: Add order domain types

**Changes**:
- Add `OrderSummaryItem`:
  - `productId: number`, `title: string`, `imageUrl: string`, `unitPrice: number`, `quantity: number`, `lineTotal: number`
- Add `OrderSummary`:
  - `reference: string`, `customerName: string`, `customerEmail: string`, `items: OrderSummaryItem[]`, `totalPrice: number`, `createdAt: string`
- Add `OrderApiResponse` (discriminated union):
  - `(OrderSummary & { notFound: false }) | { notFound: true }`
- Add `CreateOrderRequest`:
  - `sessionId: string`, `customerName: string`, `customerEmail: string`
- Add `CreateOrderResponse` (discriminated union):
  - `{ ok: true, reference: string } | { ok: false, error: string }`

**Why**: Typed contract shared between server and store frontend

---

#### C. 🟢 `server/src/db/order.ts` (new)
**Purpose**: Order domain queries

**Changes**:
- `orderCreate(data: { sessionId, customerName, customerEmail, reference, totalPrice, items: { productId, title, imageUrl, unitPrice, quantity }[] }): Promise<void>`
  - Uses `prisma.$transaction`:
    1. `prisma.order.create({ data: { ...fields, items: { create: items } } })`
    2. `prisma.cartItem.deleteMany({ where: { cart: { sessionId } } })`
  - Transaction ensures atomicity: order created + cart cleared together

- `orderGetByReference(reference: string): Promise<OrderSummary | null>`
  - `prisma.order.findUnique({ where: { reference }, include: { items: true } })`
  - Maps to `OrderSummary` (with `lineTotal = unitPrice * quantity` computed)
  - Returns `null` if not found

**Why**: Follows existing pattern of domain-prefixed query functions in `server/src/db/`

---

#### D. `server/src/db/index.ts`
**Purpose**: Barrel re-export order queries

**Changes**:
- Add `export * from "./order.js";`

---

#### E. 🟢 `server/src/api/order.ts` (new)
**Purpose**: REST endpoints for order operations

**Changes**:
- Add Zod schema:
  - `createOrderBodySchema = z.object({ sessionId: z.string().uuid(), customerName: z.string().min(1).max(255), customerEmail: z.string().email().max(255) })`

- Add `orderCreateApiHandler` — `POST /api/orders`
  - Validate body via `createOrderBodySchema` → 400 `{ ok: false, error: "Invalid input" }` on failure
  - Call ⚪ `cartGetSummary(sessionId)` → if null → 404 `{ ok: false, error: "Cart not found" }`
  - If `summary.items` empty → 400 `{ ok: false, error: "Cart is empty" }`
  - Generate `reference = crypto.randomUUID()`
  - Use `summary.subtotal` as `totalPrice`
  - Map `summary.items` to order items: `{ productId, title, imageUrl, unitPrice: item.unitPriceSnapshot, quantity }`
  - Call 🟢 `orderCreate(...)` (transaction: create order + delete cart items)
  - Return `201 { ok: true, reference }`
  - **Note**: Uses existing `cartGetSummary` domain function instead of raw Prisma calls — follows the pattern of all cart API handlers

- Add `orderGetApiHandler` — `GET /api/orders/:reference`
  - Validate `reference` as UUID via `z.string().uuid()` → 400 `{ notFound: true }`
  - Call 🟢 `orderGetByReference(reference)` → if null → 404 `{ notFound: true }`
  - Return `200 { ...orderSummary, notFound: false }`

- **Error response convention**: POST endpoints use `{ ok, error }` for actionable error messages (e.g., "Cart is empty"). GET endpoints use `{ notFound }` for lookup results. This distinction is intentional: mutations need descriptive errors for UI feedback, while reads only need found/not-found.

**Why**: Store frontend needs HTTP access to order operations; follows existing `server/src/api/cart.ts` pattern

---

#### F. `server/src/index.ts`
**Purpose**: Register order routes

**Changes**:
- Import `orderCreateApiHandler`, `orderGetApiHandler` from `./api/order.js`
- Add routes:
  - `app.post("/api/orders", orderCreateApiHandler)`
  - `app.get("/api/orders/:reference", orderGetApiHandler)`

---

#### G. `store/src/api.ts`
**Purpose**: Add order API client functions

**Changes**:
- Add `submitOrder(sessionId, customerName, customerEmail): Promise<{ reference: string }>`
  - `POST ${API_BASE}/api/orders` body `{ sessionId, customerName, customerEmail }`
  - On success (`ok: true`): return `{ reference }`
  - On failure (`ok: false`): throw with `error` message from response body
- Add `fetchOrder(reference): Promise<OrderApiResponse>`
  - `GET ${API_BASE}/api/orders/${reference}`
  - Returns `OrderApiResponse` (same pattern as `fetchCartSummary`)

---

#### H. `store/src/context/CartContext.tsx`
**Purpose**: Add `clearCart` method for post-order cleanup

**Changes**:
- Add `clearCart: () => void` to `CartContextValue` type
- Implement `clearCart`: sets `cart` to `{ items: [], subtotal: 0 }`
- Expose in context value

**Why**: After order submission, CheckoutPage calls `clearCart()` to reset cart indicator and prevent re-ordering

---

#### I. 🟢 `store/src/pages/CheckoutPage.tsx` (new)
**Purpose**: Order form with cart review

**Changes**:
- Read `session` from `useSearchParams()`
- Read `cart`, `sessionId`, `loading`, `notFound` from `useCart()`
- If no session / notFound / empty cart → "Your cart is empty" message with link to browse
- Order review section: reuse `.summary-list` / `.summary-item` markup from CartPage (read-only, no quantity controls)
- Form with:
  - Name input: `required`, `maxLength={255}`, controlled state
  - Email input: `type="email"`, `required`, `maxLength={255}`, controlled state
  - Client-side validation: name non-empty, email matches basic format (HTML5 `type="email"` + `required`)
  - "Place Order" button: `disabled` until `name.trim() && emailValid && !submitting`
- On submit:
  - Set `submitting: true`
  - Call `submitOrder(sessionId, name, email)`
  - On success: call `clearCart()`, `navigate(`/orders/${reference}`)`
  - On error: set `submitError` message, `submitting: false`, form data preserved
- Shows `submitError` banner at top (similar to cart error banner)

---

#### J. 🟢 `store/src/pages/OrderConfirmationPage.tsx` (new)
**Purpose**: Display order confirmation after successful submission

**Changes**:
- Read `reference` from `useParams()`
- On mount: call `fetchOrder(reference)`
- States: loading / notFound / loaded
- Loaded view:
  - "Order placed successfully" heading
  - Order reference: `{reference}`
  - Customer info: name, email
  - Order items list (image, title, quantity, unit price, line total) — reuse `.summary-list` / `.summary-item` classes
  - Order total
  - "Continue shopping" link → `/` (future: product browsing page, placeholder for now)
- Not found → "Order not found" message

**Why**: PRD requires confirmation survives page refresh → dedicated route fetching from DB

---

#### K. `store/src/App.tsx`
**Purpose**: Add checkout and confirmation routes

**Changes**:
- Import `CheckoutPage` and `OrderConfirmationPage`
- Add routes:
  - `<Route path="/checkout" element={<CheckoutPage />} />`
  - `<Route path="/orders/:reference" element={<OrderConfirmationPage />} />`

---

#### L. `store/src/index.css`
**Purpose**: Styles for checkout form and confirmation page

**Changes**:
- `.checkout-form` — flex column, gap 1rem
- `.form-group` — flex column, gap 0.25rem
- `.form-label` — font-weight 600, font-size 0.875rem
- `.form-input` — padding 0.5rem, border 1px solid var(--text-muted), border-radius 4px, background var(--bg), color var(--text), font-size 1rem
- `.form-input:invalid` — border-color #d32f2f (only when touched/submitted)
- `.submit-btn` — same as `.checkout-btn` but disabled state (opacity 0.5, cursor not-allowed)
- `.submit-btn:disabled` — opacity 0.5, cursor not-allowed
- `.order-reference` — font-size 1.25rem, font-weight bold, text-align center, margin 1rem 0
- `.confirmation-section` — margin-top 1.5rem
- `.continue-link` — display block, text-align center, margin-top 1.5rem, color var(--accent)

---

## 3. Test List

### Test File: `server/tests/order-api.integration.test.ts` (new)

Uses `createEventMockContext` + direct handler calls (same pattern as `cart-api.integration.test.ts`).

**POST /api/orders:**

1. **`creates order and returns reference`**
   - Seed cart with 2 items → POST `{ sessionId, customerName: "John", customerEmail: "john@example.com" }` → 201, response has `reference` (UUID format)

2. **`deletes cart items after order creation`**
   - Seed cart with items → POST valid order → verify `prisma.cartItem.count({ where: { cartId } })` is 0

3. **`persists order with correct data`**
   - POST valid order → query `prisma.order.findUnique({ where: { reference }, include: { items: true } })` → assert customerName, customerEmail, totalPrice, items count, item snapshots match

4. **`returns 400 for empty cart`**
   - Create cart with no items → POST → 400, `{ ok: false, error: "Cart is empty" }`

5. **`returns 404 for unknown session`**
   - POST with random UUID sessionId → 404, `{ ok: false, error: "Cart not found" }`

6. **`returns 400 for invalid body (missing name)`**
   - POST with `{ sessionId, customerEmail: "a@b.com" }` → 400, `{ ok: false, error: "Invalid input" }`

7. **`returns 400 for invalid email format`**
   - POST with `{ sessionId, customerName: "John", customerEmail: "not-an-email" }` → 400, `{ ok: false, error: "Invalid input" }`

8. **`returns 400 for name exceeding 255 chars`**
   - POST with `customerName` of 256 chars → 400

**GET /api/orders/:reference:**

9. **`returns order summary for valid reference`**
   - Create order directly in DB → GET `/api/orders/:reference` → 200, `notFound: false`, items array with correct fields

10. **`returns 404 for unknown reference`**
    - GET with random UUID → 404, `{ notFound: true }`

11. **`returns 400 for invalid (non-UUID) reference`**
    - GET with `"not-a-uuid"` → 400, `{ notFound: true }`

### Test File: `store/src/pages/CheckoutPage.test.tsx` (new)

Mock `useCart()` via `vi.mock("../context/CartContext.js")`. Mock `store/src/api.js` for `submitOrder`.

12. **`renders order review with cart items`**
    - Provide cart with 2 items → assert item titles, prices, quantities, subtotal visible

13. **`renders form with name and email inputs`**
    - Provide cart with items → assert name input, email input, "Place Order" button visible

14. **`disables submit button when fields empty`**
    - Provide cart → assert "Place Order" button disabled initially

15. **`enables submit button when both fields valid`**
    - Type valid name + email → assert button enabled

16. **`calls submitOrder and navigates on success`**
    - Mock `submitOrder` resolving `{ reference: "uuid" }` → fill form → click submit → assert `submitOrder` called with correct args, `clearCart` called, navigation to `/orders/uuid`

17. **`shows error message on submit failure`**
    - Mock `submitOrder` rejecting → fill form → click submit → assert error message "Something went wrong. Please try again." visible, form data preserved

18. **`renders empty cart message when cart has no items`**
    - Provide cart `{ items: [], subtotal: 0 }` → assert "Your cart is empty" visible, no form

19. **`renders empty cart message when notFound`**
    - Provide `notFound: true`, `cart: null` → assert empty/not-found message

### Test File: `store/src/pages/OrderConfirmationPage.test.tsx` (new)

Mock `store/src/api.js` for `fetchOrder`.

20. **`renders order confirmation with all details`**
    - Mock `fetchOrder` resolving full order → assert reference, customer name, email, items, total visible

21. **`renders loading state`**
    - Mock `fetchOrder` as pending promise → assert "Loading..." visible

22. **`renders not-found state`**
    - Mock `fetchOrder` resolving `{ notFound: true }` → assert "Order not found" visible

23. **`renders "Continue shopping" link`**
    - Mock `fetchOrder` resolving full order → assert link to `/`

> Integration tests (1-11) call handlers directly with mock req/res (same as cart-api tests). Store tests (12-23) mock context and API module. All follow existing UF1/UF2 patterns.

---

## 4. To Do List

### Phase 1: Prisma schema + DB queries
> Commit: `feat(db): add Order and OrderItem models with order queries`

- [ ] Add `Order` and `OrderItem` models to `prisma/schema.prisma`
- [ ] Run `pnpm db:migrate` to create migration
- [ ] Add `OrderSummaryItem`, `OrderSummary`, `OrderApiResponse`, `CreateOrderRequest`, `CreateOrderResponse` types to `shared/types.ts`
- [ ] Create `server/src/db/order.ts` — `orderCreate` (transactional: create order + delete cart items) + `orderGetByReference`
- [ ] Add `export * from "./order.js"` to `server/src/db/index.ts`

### Phase 2: REST order endpoints
> Commit: `feat(api): add order creation and retrieval endpoints`

- [ ] Create `server/src/api/order.ts` — `orderCreateApiHandler` (POST) + `orderGetApiHandler` (GET)
- [ ] Register routes in `server/src/index.ts` — `POST /api/orders` + `GET /api/orders/:reference`
- [ ] Write tests 1-11 in `server/tests/order-api.integration.test.ts`

### Phase 3: Store API client + CartContext update
> Commit: `feat(store): add order API client and clearCart method`

- [ ] Add `submitOrder(sessionId, name, email)` and `fetchOrder(reference)` to `store/src/api.ts`
- [ ] Add `clearCart()` to `CartContextValue` type and `CartProvider` in `store/src/context/CartContext.tsx`

### Phase 4: Checkout page
> Commit: `feat(store): implement checkout page with order form`

- [ ] Create `store/src/pages/CheckoutPage.tsx` — order review + name/email form + submit logic
- [ ] Add `/checkout` route in `store/src/App.tsx`
- [ ] Add checkout form styles to `store/src/index.css`
- [ ] Write tests 12-19 in `store/src/pages/CheckoutPage.test.tsx`

### Phase 5: Order confirmation page
> Commit: `feat(store): implement order confirmation page`

- [ ] Create `store/src/pages/OrderConfirmationPage.tsx` — fetch + display order details
- [ ] Add `/orders/:reference` route in `store/src/App.tsx`
- [ ] Add confirmation page styles to `store/src/index.css`
- [ ] Write tests 20-23 in `store/src/pages/OrderConfirmationPage.test.tsx`

---

## 5. Context: Current System Architecture

### Cart-to-Order Flow (New)
1. User reviews cart on `/cart?session=xxx` (UF2)
2. Clicks "Proceed to checkout" → `/checkout?session=xxx`
3. CheckoutPage reads cart from `CartContext` (already fetched)
4. User fills name + email → clicks "Place Order"
5. `POST /api/orders` with `{ sessionId, customerName, customerEmail }`
6. Server: validate → `cartGetSummary(sessionId)` → create Order + OrderItems (transaction) → delete CartItems → return `{ ok: true, reference }`
7. Frontend: `clearCart()` → `navigate(/orders/${reference})`
8. OrderConfirmationPage: `GET /api/orders/:reference` → display

### Session Continuity
- Cart `sessionId` is passed via `?session=` URL param through all pages
- Order references the `sessionId` for audit but is identified by its own `reference` UUID
- After order: cart items deleted server-side; CartContext cleared client-side via `clearCart()`

### Store App (Current — UF2)
- Routes: `/cart` only
- CartContext: `cart`, `sessionId`, `loading`, `notFound`, `error`, `setQuantity`, `removeItem`, `addItem`, `clearError`
- No checkout or order pages

UF3 adds `/checkout` and `/orders/:reference` routes, `clearCart` to context, and the full order submission flow.

### Key Files
| File | Purpose |
|------|---------|
| `server/src/db/cart.ts` | `cartGetSummary` — reused for cart + items lookup during order creation |
| `server/src/api/cart.ts` | REST handler pattern — reference for order API handlers |
| `store/src/context/CartContext.tsx` | Cart state — extended with `clearCart` |
| `store/src/pages/CartPage.tsx` | Cart display — UI patterns reused in CheckoutPage order review |
| `store/src/api.ts` | API client — extended with order functions |
| `shared/types.ts` | Domain types — extended with order types |
| `server/tests/cart-api.integration.test.ts` | Test pattern — reference for order integration tests |
| `server/tests/helpers/a2ui-mocks.ts` | `createEventMockContext` — reused for handler tests |

---

## 6. Reference Implementations

- **Cart API handlers** (`server/src/api/cart.ts`): `resolveCart()` helper for session validation + cart lookup. `respondWithSummary()` for consistent response shape. Direct pattern for order handlers. `orderCreateApiHandler` uses `cartGetSummary` instead of `resolveCart` since it needs item details, not just the cart entity.
- **Cart DB queries** (`server/src/db/cart.ts`): Domain-prefixed functions (`cartGetBySessionId`, `cartGetSummary`). `orderCreate`/`orderGetByReference` follow same naming convention.
- **Cart API integration tests** (`server/tests/cart-api.integration.test.ts`): `createMockContext()` wrapper, `beforeEach` cleanup, direct handler invocation. Exact pattern for order tests.
- **CartPage** (`store/src/pages/CartPage.tsx`): `.summary-list`/`.summary-item` markup for item rows. CheckoutPage reuses this for order review (read-only variant, no quantity controls).
- **CartContext** (`store/src/context/CartContext.tsx`): `cartFromResponse()`, optimistic updates, error auto-dismiss. `clearCart` follows same `useCallback` + `setCart` pattern.
- **Store API client** (`store/src/api.ts`): `fetch` + `throw on non-ok` pattern. `submitOrder`/`fetchOrder` follow identical structure.
- **CartPage tests** (`store/src/pages/CartPage.test.tsx`): `vi.mock("../context/CartContext.js")`, `mockCartState()` helper, `MemoryRouter` wrapper. Direct pattern for CheckoutPage tests.

---

## Notes

- **No `CartItem → Order` relation**: OrderItem stores full snapshots (title, imageUrl, unitPrice). No FK to CartItem or Product needed — order data is self-contained.
- **Cart deletion is transactional**: `orderCreate` uses `prisma.$transaction` to atomically create order and delete cart items. If order creation fails, cart items remain.
- **Race condition (MVP trade-off)**: Cart items are read via `cartGetSummary` _before_ the transaction that creates the order and deletes cart items. If another request modifies the cart between the read and the transaction, the order may contain stale data (e.g., items added in that window would be deleted but not included in the order). This is acceptable for MVP — a production system would read cart items inside the transaction or use row-level locking.
- **`cartGetSummary` reuse**: The order handler uses the existing `cartGetSummary(sessionId)` domain function (which returns items with `title`, `imageUrl`, `unitPriceSnapshot`) instead of raw Prisma queries. This follows the pattern of all cart API handlers calling domain functions from `db/`.
- **Confirmation page refresh**: `/orders/:reference` fetches from DB → works across sessions, tabs, and refreshes.
- **"Continue shopping" link**: Points to `/` for now. UF4 will implement the product browsing page at that route.
- **No `sessionId` on confirmation page URL**: Confirmation uses `reference` as identifier, not session. CartContext won't have session context on this page — the page is independent.
- **Error response convention**: POST `/api/orders` uses `{ ok, error }` shape for discriminated error handling. GET `/api/orders/:reference` uses `{ notFound }` to match the existing cart API pattern for read endpoints.

---

## Unresolved Questions

1. **Name/email validation strictness**: Zod `z.string().email()` uses a permissive regex. Should we use a stricter RFC 5322 pattern, or is Zod's default sufficient for MVP?
2. **Multiple orders per session**: Should we allow multiple orders from the same session (user shops again after ordering)? Currently yes — cart is cleared but session persists, so user could rebuild a cart and order again.
