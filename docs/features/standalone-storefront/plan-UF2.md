# Implementation Plan: UF2 – Cart Management

## 1. Feature Description

**Objective**: Enable cart editing on the standalone storefront — users can modify quantities, remove items, and see a persistent cart indicator across all pages.

**Key Capabilities**:
- **CAN** increment/decrement item quantity on cart page
- **CAN** remove items entirely from cart page
- **CAN** see a persistent cart indicator (total quantity + total price) on all pages
- **CAN** click cart indicator to navigate to cart page
- **CAN** click "Proceed to checkout" to navigate to order page (UF3)
- **CANNOT** add items to cart from product cards (deferred to UF4)
- **CANNOT** create a new session from scratch (deferred to UF5)

**Business Rules**:
- Optimistic UI: cart indicator updates immediately on mutation; rolls back on server error
- Decrement quantity to 0 → item removed from cart
- Mutation failure → rollback + brief error message
- Cart indicator visible on all pages (header-level component)

**Scope Boundary**: UF2 assumes a `sessionId` exists (from UF1 widget redirect). Session creation for standalone visitors is UF5.

---

## 2. Architecture

### Files to Modify

#### A. `server/src/db/cart.ts`
**Purpose**: Add quantity-set operation for cart page +/- buttons

**Changes**:
- Add `cartSetItemQuantity(cartId: number, productId: number, quantity: number): Promise<CartSnapshot>`
  - If `quantity <= 0` → `prisma.cartItem.deleteMany({ where: { cartId, productId } })`
  - If `quantity > 0` → `prisma.cartItem.updateMany({ where: { cartId, productId }, data: { quantity } })`
  - Returns `cartGetSnapshot(cartId)` (follows existing pattern)
  - If item doesn't exist → no-op, returns current snapshot

**Why**: Existing `cartAddItem` only increments by 1; `cartRemoveItem` deletes entire line. Cart page needs absolute quantity set.

---

#### B. `server/src/api/cart.ts`
**Purpose**: Add mutation endpoints for cart items

**Changes**:
- Add Zod schemas for request body validation:
  - `addItemBodySchema = z.object({ productId: z.number().int().positive() })`
  - `updateItemBodySchema = z.object({ quantity: z.number().int().min(0) })`
  - Return `400 { error: "..." }` on validation failure (same pattern as `validateCartSession`)

- Add `cartAddItemApiHandler` — `POST /api/cart/:sessionId/items`
  - Body: `{ productId: number }` — validated via `addItemBodySchema`
  - Validate sessionId (UUID) via ⚪ `validateCartSession()`
  - Lookup cart via ⚪ `cartGetBySessionId()` → 404 `NOT_FOUND_CART_FALLBACK` if missing
  - Call ⚪ `cartAddItem(cart.id, productId)` then ⚪ `cartGetSummary(sessionId)`
  - Return `200 { items, subtotal, notFound: false }`

- Add `cartUpdateItemApiHandler` — `PUT /api/cart/:sessionId/items/:productId`
  - Body: `{ quantity: number }` — validated via `updateItemBodySchema` (integer ≥ 0)
  - Validate sessionId + lookup cart (same as above)
  - If `quantity === 0` → ⚪ `cartRemoveItem()`; else → 🟢 `cartSetItemQuantity()`
  - Then call ⚪ `cartGetSummary(sessionId)` to produce `CartSummaryApiResponse`
  - Return `200 { items, subtotal, notFound: false }`

- Add `cartRemoveItemApiHandler` — `DELETE /api/cart/:sessionId/items/:productId`
  - No body
  - Validate sessionId + lookup cart
  - Call ⚪ `cartRemoveItem(cart.id, productId)` then ⚪ `cartGetSummary(sessionId)`
  - Return `200 { items, subtotal, notFound: false }`

- All three handlers: `400` for invalid UUID or body validation, `404` for missing cart (with `NOT_FOUND_CART_FALLBACK`), `500` for DB errors (with `NOT_FOUND_CART_FALLBACK`)
- **Error response shape**: All error responses use `CartSummaryApiResponse` shape (`{ items: [], subtotal: 0, notFound: true }`) — same contract as the GET handler. HTTP status codes differentiate error types (400/404/500); the body shape stays uniform so the frontend can always parse it as `CartSummaryApiResponse`.

**Why**: Store needs HTTP access to cart mutations; MCP tools only callable from ChatGPT

---

#### C. `server/src/index.ts`
**Purpose**: Register mutation routes + update CORS

**Changes**:
- Import `cartAddItemApiHandler`, `cartUpdateItemApiHandler`, `cartRemoveItemApiHandler` from `./api/cart.js`
- Add routes:
  - `app.post("/api/cart/:sessionId/items", cartAddItemApiHandler)`
  - `app.put("/api/cart/:sessionId/items/:productId", cartUpdateItemApiHandler)`
  - `app.delete("/api/cart/:sessionId/items/:productId", cartRemoveItemApiHandler)`
- Update CORS `Access-Control-Allow-Methods` → `"GET,POST,PUT,DELETE,OPTIONS"`

---

#### D. 🟢 `store/src/context/CartContext.tsx` (new)
**Purpose**: Shared cart state across all store pages

**Changes**:
- `CartProvider` component wrapping the app
  - State: `{ cart: CartSummary | null, sessionId: string | null, loading: boolean, notFound: boolean, error: string | null }`
  - On mount: read `session` from `useSearchParams()`; if present, call ⚪ `fetchCartSummary(sessionId)`
    - If response has `notFound: true` → set `notFound: true`, `cart: null`
    - If response has items → set `cart`, `notFound: false`
    - If fetch throws → set `error` message, `cart: null`, `notFound: false`
  - Exposes via context:
    - `cart`, `sessionId`, `loading`, `notFound`, `error`
    - `totalQuantity` (derived: `cart.items.reduce(sum + qty)`)
    - `setQuantity(productId, quantity)` — optimistic update → `PUT` → sync or rollback
    - `removeItem(productId)` — optimistic update → `DELETE` → sync or rollback
    - `addItem(productId)` — `POST` → refresh cart (no optimistic; UF4 will add product context)
    - `clearError()`
- `useCart()` hook — `useContext(CartContext)` with throw on missing provider

**Optimistic update pattern** (for `setQuantity` / `removeItem`):
1. Save `prevCart` reference
2. Compute and set new cart state immediately (recalculate lineTotal + subtotal)
3. Call API
4. On success: replace state with server response
5. On error: revert to `prevCart`, set `error` message, auto-clear after 3s

**Why**: Cart indicator needs cart data on every page; context avoids prop drilling and duplicate fetches

---

#### E. 🟢 `store/src/components/CartIndicator.tsx` (new)
**Purpose**: Persistent header showing cart totals + link to cart page

**Changes**:
- Renders in site header (above routes)
- Uses `useCart()` to read `totalQuantity` + `cart.subtotal`
- Displays: cart icon/label + `{totalQuantity} items · {formatPrice(subtotal)}`
- Hidden when `cart` is null or `totalQuantity === 0`
- Clickable → `<Link to={`/cart?session=${sessionId}`}>`
- Shows error banner when `error` is set (auto-dismisses)

---

#### F. `store/src/pages/CartPage.tsx`
**Purpose**: Add mutation controls to existing read-only cart display

**Changes**:
- Replace internal state + `useEffect` fetch with `useCart()` context
- Map `useCart()` states: `loading` → spinner, `notFound` → "Cart not found", `error && !cart` → error message, `cart.items.length === 0` → empty, else → loaded
- For each item row, add:
  - `−` button → `setQuantity(productId, quantity - 1)` (removes if hits 0)
  - Quantity display between buttons
  - `+` button → `setQuantity(productId, quantity + 1)`
  - `Remove` button → `removeItem(productId)`
- Add "Proceed to checkout" button below subtotal → `<Link to={`/checkout?session=${sessionId}`}>`
- Error banner from context displayed at top (auto-clears)

---

#### G. `store/src/api.ts`
**Purpose**: Add mutation client functions

**Changes**:
- Add `addCartItem(sessionId, productId): Promise<CartSummaryApiResponse>` — `POST /api/cart/${sessionId}/items` body `{ productId }`
- Add `updateCartItemQuantity(sessionId, productId, quantity): Promise<CartSummaryApiResponse>` — `PUT /api/cart/${sessionId}/items/${productId}` body `{ quantity }`
- Add `removeCartItem(sessionId, productId): Promise<CartSummaryApiResponse>` — `DELETE /api/cart/${sessionId}/items/${productId}`
- All throw on non-2xx responses (consistent with existing `fetchCartSummary`)

---

#### H. `store/src/App.tsx`
**Purpose**: Wrap routes with CartProvider + add CartIndicator layout

**Changes**:
- Wrap `<Routes>` with `<CartProvider>`
- Add `<CartIndicator />` above `<Routes>` (visible on all pages)
- CartProvider reads sessionId from URL, so it sits inside `BrowserRouter` (already in `main.tsx`)

---

#### I. `store/src/index.css`
**Purpose**: Styles for cart mutation controls and cart indicator

**Changes**:
- `.cart-indicator` — fixed/sticky header bar, flex layout, accent background
- `.cart-indicator-link` — white text, no decoration
- `.error-banner` — red background, white text, padding, margin-bottom
- `.quantity-controls` — inline flex, gap 0.25rem, aligned center
- `.quantity-btn` — small square button (28px), border, rounded
- `.quantity-value` — min-width 2ch, text-align center
- `.remove-btn` — text button, red/muted color, small font
- `.checkout-btn` — full-width accent button below subtotal, bold, rounded

---

## 3. Test List

### Test File: `server/tests/cart-api.integration.test.ts` (extend existing)

Uses `createEventMockContext` + direct handler calls (same pattern as existing GET tests).

**POST /api/cart/:sessionId/items:**

1. **`adds item and returns updated summary`**
   - Seed cart with 0 items → POST `{ productId }` → 200, items array length 1, correct subtotal

2. **`increments quantity for existing item`**
   - Seed cart with 1 item (qty 1) → POST same productId → 200, item quantity 2, subtotal doubled

3. **`returns 404 for unknown session`**
   - POST with random UUID → 404, `{ items: [], subtotal: 0, notFound: true }`

4. **`returns 400 for invalid session`**
   - POST with `"not-a-uuid"` → 400, `{ items: [], subtotal: 0, notFound: true }`

5. **`returns 400 for invalid body`**
   - POST with `{ productId: "abc" }` → 400

**PUT /api/cart/:sessionId/items/:productId:**

6. **`sets item quantity and returns updated summary`**
   - Seed cart with item qty 1 → PUT `{ quantity: 5 }` → 200, item quantity 5, subtotal = price × 5

7. **`removes item when quantity set to 0`**
   - Seed cart with 2 items → PUT `{ quantity: 0 }` for first item → 200, items array length 1

8. **`returns 404 for unknown session`**
   - PUT with random UUID → 404, `{ items: [], subtotal: 0, notFound: true }`

9. **`returns 400 for invalid quantity`**
   - PUT with `{ quantity: -1 }` → 400

**DELETE /api/cart/:sessionId/items/:productId:**

10. **`removes item and returns updated summary`**
    - Seed cart with 2 items → DELETE first item → 200, items array length 1, subtotal recalculated

11. **`returns 404 for unknown session`**
    - DELETE with random UUID → 404, `{ items: [], subtotal: 0, notFound: true }`

### Test File: `store/src/pages/CartPage.test.tsx` (rewrite — now uses CartContext)

Mock `useCart()` via a test CartContext provider wrapper. Tests cover mutation UI added on top of UF1 read-only display.

12. **`renders quantity controls for each item`**
    - Provide cart with 2 items → assert +/− buttons and quantity display for each

13. **`calls setQuantity with incremented value on + click`**
    - Item qty 2 → click + → assert `setQuantity(productId, 3)` called

14. **`calls setQuantity with decremented value on − click`**
    - Item qty 2 → click − → assert `setQuantity(productId, 1)` called

15. **`calls removeItem on Remove button click`**
    - Click Remove → assert `removeItem(productId)` called

16. **`renders "Proceed to checkout" link to /checkout`**
    - Assert link with `href` containing `/checkout?session=`

17. **`shows error banner when context has error`**
    - Provide `error: "Something went wrong"` → assert banner visible

18. **`renders loading, notFound, empty, error states`**
    - `loading: true` → spinner, `notFound: true` → "Cart not found", `error && !cart` → error message, `cart.items.length === 0` → "Your cart is empty"

### Test File: `store/src/components/CartIndicator.test.tsx` (new)

19. **`shows total quantity and formatted subtotal`**
    - Provide cart with 3 items totaling 15000 → assert "3 items · $150.00"

20. **`hidden when cart is null`**
    - Provide null cart → assert nothing rendered

21. **`links to cart page with session param`**
    - Assert link href = `/cart?session=<sessionId>`

### Test File: `store/src/context/CartContext.test.tsx` (new)

Render a test consumer component inside CartProvider with MemoryRouter. Mock `store/src/api` module.

22. **`fetches cart on mount when sessionId in URL`**
    - MemoryRouter with `?session=uuid` → assert `fetchCartSummary` called → cart state populated

23. **`sets notFound when fetchCartSummary returns notFound: true`**
    - Mock `fetchCartSummary` returning `{ notFound: true, items: [], subtotal: 0 }` → assert `notFound === true`, `cart === null`

24. **`sets error when fetchCartSummary throws`**
    - Mock `fetchCartSummary` rejecting → assert `error` is set, `notFound === false`, `cart === null`

25. **`setQuantity applies optimistic update then syncs`**
    - Mock `updateCartItemQuantity` resolving → assert intermediate state has new quantity → assert final state matches API response

26. **`setQuantity rolls back on API error`**
    - Mock `updateCartItemQuantity` rejecting → assert cart reverts to previous state + error message set

27. **`removeItem applies optimistic removal`**
    - Mock `removeCartItem` resolving → assert item removed from state

28. **`removeItem rolls back on API error`**
    - Mock `removeCartItem` rejecting → assert item reappears + error message set

> Integration tests (1-11) call handlers directly with mock req/res. Store tests (12-28) mock API module or context. All follow existing patterns from UF1.

---

## 4. To Do List

### Phase 1: Backend cart mutation endpoints
> Commit: `feat(api): add cart item mutation endpoints (POST/PUT/DELETE)`

- [ ] Add `cartSetItemQuantity(cartId, productId, quantity)` to `server/src/db/cart.ts` — delete if ≤ 0, update otherwise, return `CartSnapshot`
- [ ] Add Zod body schemas (`addItemBodySchema`, `updateItemBodySchema`) in `server/src/api/cart.ts`
- [ ] Add `cartAddItemApiHandler` in `server/src/api/cart.ts` — POST handler, validate UUID + body, lookup cart (404 with `NOT_FOUND_CART_FALLBACK`), call `cartAddItem` then `cartGetSummary`, return `CartSummaryApiResponse`
- [ ] Add `cartUpdateItemApiHandler` in `server/src/api/cart.ts` — PUT handler, validate UUID + body, call `cartSetItemQuantity` or `cartRemoveItem` if 0, then `cartGetSummary`
- [ ] Add `cartRemoveItemApiHandler` in `server/src/api/cart.ts` — DELETE handler, validate UUID, call `cartRemoveItem` then `cartGetSummary`
- [ ] Register 3 routes in `server/src/index.ts` (POST, PUT, DELETE under `/api/cart/:sessionId/items`)
- [ ] Update CORS `Access-Control-Allow-Methods` to include `PUT` in `server/src/index.ts`
- [ ] Write tests 1-11 in `server/tests/cart-api.integration.test.ts` (extend existing describe blocks)

### Phase 2: Store cart context & indicator
> Commit: `feat(store): add CartContext provider and CartIndicator component`

- [ ] Add `addCartItem`, `updateCartItemQuantity`, `removeCartItem` to `store/src/api.ts`
- [ ] Create `store/src/context/CartContext.tsx` — `CartProvider` + `useCart()` hook with `notFound` state + optimistic update/rollback
- [ ] Create `store/src/components/CartIndicator.tsx` — sticky header, quantity + subtotal, link to cart, error banner
- [ ] Update `store/src/App.tsx` — wrap with `CartProvider`, add `CartIndicator` above `Routes`
- [ ] Add indicator + error banner + quantity control styles to `store/src/index.css`
- [ ] Write tests 19-21 in `store/src/components/CartIndicator.test.tsx`
- [ ] Write tests 22-28 in `store/src/context/CartContext.test.tsx`

### Phase 3: CartPage mutation UI
> Commit: `feat(store): add cart editing controls to CartPage`

- [ ] Refactor `store/src/pages/CartPage.tsx` — replace internal state + useEffect with `useCart()` context
- [ ] Add per-item quantity controls: `−` / quantity / `+` buttons calling `setQuantity`
- [ ] Add per-item "Remove" button calling `removeItem`
- [ ] Add "Proceed to checkout" link below subtotal → `/checkout?session=${sessionId}`
- [ ] Rewrite tests 12-18 in `store/src/pages/CartPage.test.tsx` — mock context instead of API

---

## 5. Context: Current System Architecture

### Cart Mutation Flow (Widget)
1. User clicks add/remove in ecom-carousel widget
2. Widget does **optimistic update** on local `CartWidgetState` (snapshot + sessionId)
3. Calls MCP tool `cart` via `callToolAsync({ action: "add"|"remove", productId, sessionId })`
4. Server handler: validate → lookup/create cart → `cartAddItem`/`cartRemoveItem` → return `CartSnapshot`
5. Widget syncs state with server response; on error → rollback + error banner

UF2 replicates steps 2-5 via REST instead of MCP. The DB functions (`cartAddItem`, `cartRemoveItem`) are shared.

### Store App (Current — UF1)
- Single route `/cart` with read-only display
- CartPage manages own state via `useState` + `useEffect` fetching `fetchCartSummary(sessionId)`
- No shared state — no context, no cart indicator
- SessionId read from `?session=` URL param per page

UF2 lifts cart state into `CartContext`, adds mutation endpoints, and makes CartPage interactive.

### DB Layer Gap
- `cartAddItem` → increments by 1 (exists ⚪)
- `cartRemoveItem` → deletes entire line (exists ⚪)
- `cartSetItemQuantity` → sets absolute quantity (needed 🟢) — for cart page +/- where frontend knows target quantity

### Key Files
| File | Purpose |
|------|---------|
| `server/src/db/cart.ts` | `cartAddItem`, `cartRemoveItem`, `cartGetSummary` — all reused |
| `server/src/api/cart.ts` | Existing GET handler — pattern for new mutation handlers |
| `server/src/tools/cart.ts` | MCP cart tool — reference for validation + error handling flow |
| `server/src/tools/utils.ts` | `validateCartSession()` — reused for UUID validation |
| `store/src/pages/CartPage.tsx` | Current read-only page — refactored to use context |
| `store/src/api.ts` | `fetchCartSummary` — extended with mutation functions |
| `web/src/components/ecom-carousel.tsx` | Optimistic update + rollback pattern — reference for CartContext |
| `server/tests/helpers/a2ui-mocks.ts` | `createEventMockContext` — reused for integration tests |

---

## 6. Reference Implementations

- **GET cart summary handler** (`server/src/api/cart.ts`): Validate sessionId → lookup cart → fetch summary → return JSON. Direct pattern for mutation handlers (same validation, same response shape).
- **Cart MCP tool** (`server/src/tools/cart.ts`): `cartAddItem`/`cartRemoveItem` + session validation + error responses. Business logic to reuse; only the transport layer differs (HTTP vs MCP).
- **Ecom-carousel optimistic updates** (`web/src/components/ecom-carousel.tsx:80-130`): Save prev state → optimistic set → API call → sync or rollback. Exact pattern for CartContext mutations.
- **Cart API integration tests** (`server/tests/cart-api.integration.test.ts`): `createEventMockContext` with `req.params` + `req.body` → call handler → assert `statusCode()` + `responseBody()`. Extend for POST/PUT/DELETE.
- **CartPage unit tests** (`store/src/pages/CartPage.test.tsx`): MemoryRouter + mock API → render + assert. UF2 replaces API mock with context mock wrapper.
- **Widget cart-summary component** (`web/src/components/cart-summary.tsx`): Read-only item list with image/title/price/quantity. CSS class names (`.summary-*`) already in store's `index.css`.

---

## Notes

- **CORS**: Already allows `*` origin. Only change: add `PUT` to `Access-Control-Allow-Methods`.
- **No new Prisma migration**: `cartSetItemQuantity` uses existing `CartItem` model — just a new query function.
- **`addItem` in context**: Exposed but not wired to UI in UF2. UF4 product cards will call `useCart().addItem(productId)`.
- **Checkout route**: "Proceed to checkout" links to `/checkout?session=xxx` which doesn't exist yet (UF3). Link is functional; page shows 404 until UF3 is implemented.
- **Error auto-dismiss**: CartContext clears error after 3s via `setTimeout` in the mutation catch block.

---

## Unresolved Questions

1. **Product not found on add**: `cartAddItem` silently returns unchanged snapshot if product doesn't exist. Should the POST endpoint return a specific error, or keep silent behavior?
2. **Concurrent mutations**: If two tabs share a session, mutations may race. Acceptable for MVP?
