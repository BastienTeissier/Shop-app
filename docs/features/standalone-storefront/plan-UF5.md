# Implementation Plan: UF5 – Independent Store Access

## 1. Feature Description

**Objective**: Ensure the standalone storefront works end-to-end without ChatGPT — a direct visitor can browse products, add to cart, and place orders with a seamlessly created session.

**Key Capabilities**:
- **CAN** visit the storefront directly (no `?session=` param) and browse products, add to cart, checkout
- **CAN** recover from an invalid `?session=` param — "Cart not found" shown on `/cart`, first "Add to cart" click clears invalid session and creates a fresh cart
- **CAN** share session across tabs via `localStorage("cart-session-id")`
- **CANNOT** restore a previously invalid session — a new session is created on recovery

**Business Rules**:
- No `?session=` param + no localStorage → `sessionId` is null, no fetch. First `addItem` triggers lazy cart creation via `POST /api/cart` (already implemented in UF4)
- Invalid `?session=` param → fetch returns `notFound: true` → clear sessionId from state + localStorage + URL param (`?session=` removed via `replace`). `notFound` set for CartPage "Cart not found" display. No separate error banner — `notFound` is the single signal.
- After recovery: `addItem` sees `sessionId === null` → creates fresh cart → `setNotFound(false)` → full functionality restored
- Valid `?session=` param → existing ChatGPT redirect flow (UF1) unchanged

**What already works (from UF1-UF4)**:
- Lazy cart creation in `addItem` (UF4 CartContext)
- `POST /api/cart` endpoint (UF4)
- localStorage-based session persistence (UF4 CartContext)
- Product browsing, cart management, order submission (UF2-UF4)
- All store routes: `/`, `/products/:id`, `/cart`, `/checkout`, `/orders/:reference`

---

## 2. Architecture

### Files to Modify

#### A. `store/src/context/CartContext.tsx`
**Purpose**: Session recovery when `fetchCartSummary` returns `notFound: true`

**Changes**:
- Destructure `setSearchParams` from `useSearchParams()` (currently only `searchParams` is destructured)
- In the initial fetch `useEffect`, when `res.notFound` is true:
  - Call `setSessionId(null)` — reset state so `addItem` triggers lazy cart creation
  - Call `localStorage.removeItem(STORAGE_KEY)` — prevent stale invalid session from persisting
  - Call `searchParams.delete("session"); setSearchParams(searchParams, { replace: true })` — **remove the invalid `?session=` param from the URL** to prevent the URL sync effect (lines 84-93) from re-setting `sessionId` to the invalid value (which would cause an infinite fetch→clear→resync loop)
  - Keep `setNotFound(true)` and `setCart(null)` — unchanged for CartPage display
  - Do **not** call `setError()` — the `notFound` state is the single signal for this case

**Why**: Currently, an invalid `?session=` param is saved to localStorage and stays in state. Since `addItem` checks `if (!currentSessionId)` before creating a cart, the invalid (non-null) sessionId prevents recovery. Clearing sessionId from state, localStorage, **and the URL** enables the lazy creation path without triggering the URL sync effect.

---

#### B. `store/src/pages/CartPage.tsx`
**Purpose**: Handle "no session" state + add browse links

**Changes**:
- Fix `showEmpty` condition: change `cart?.items.length === 0` to `!cart || cart.items.length === 0` — handles `cart === null` when no session exists (currently renders nothing)
- Add `<Link to="/">Browse products</Link>` inside the `notFound` message block
- Add `<Link to="/">Browse products</Link>` inside the `showEmpty` message block

**Why**: Without these changes, visiting `/cart` with no session shows a blank page (only the `<h1>` renders). Users need a path to product discovery. The browse links fulfill UF1's "link to browse the store" placeholder.

---

## 3. Test List

### Test File: `store/src/context/CartContext.test.tsx` (extend existing)

> **Prerequisite**: Extend `TestConsumer` to destructure `addItem` and render an add button: `<button onClick={() => addItem(1)}>add-1</button>`. The existing `TestConsumer` only exposes `setQuantity` and `removeItem`.

1. **`clears sessionId, localStorage, and URL param when fetchCartSummary returns notFound`**
   - MemoryRouter with `?session=invalid-uuid` → mock `fetchCartSummary` returning `{ notFound: true, items: [], subtotal: 0 }` → assert `localStorage.getItem("cart-session-id")` is null
   - Assert "Not found" visible in TestConsumer (existing `notFound` rendering)
   - Assert URL no longer contains `session` param

2. **`addItem creates fresh cart after invalid session recovery`**
   - MemoryRouter with `?session=invalid-uuid` → mock `fetchCartSummary` returning notFound → wait for "Not found" → click `add-1` button → assert `createCart()` called → assert `addCartItem(newSessionId, 1)` called

3. **Update existing `sets notFound when fetchCartSummary returns notFound: true`**
   - Add assertion: `localStorage.getItem("cart-session-id")` is null after notFound

### Test File: `store/src/pages/CartPage.test.tsx` (extend existing)

4. **`renders "Browse products" link in notFound state`**
   - Mock `useCart` with `notFound: true, cart: null` → assert link to `/` visible with text "Browse products"

5. **`renders "Your cart is empty" with browse link when no session`**
   - Mock `useCart` with `cart: null, loading: false, notFound: false, error: null` → assert "Your cart is empty" and "Browse products" link visible

6. **Update existing `renders loading, notFound, empty, error states`**
   - Update notFound assertion to also check for "Browse products" link
   - Add case: `cart: null` (no session) renders "Your cart is empty"

> All tests follow existing patterns: mock `useCart()` for page/component tests, mock `api.js` module for CartContext tests. No new test files needed. No changes to `CartIndicator.test.tsx` — the component is unchanged.

---

## 4. To Do List

### Phase 1: CartContext session recovery
> Commit: `feat(store): recover from invalid cart session on standalone access`

- [ ] Modify initial fetch effect in `store/src/context/CartContext.tsx` — when `res.notFound`: call `setSessionId(null)`, `localStorage.removeItem(STORAGE_KEY)`, clear `?session=` URL param via `setSearchParams`. No `setError()`.
- [ ] Destructure `setSearchParams` from existing `useSearchParams()` call in CartContext
- [ ] Fix `showEmpty` in `store/src/pages/CartPage.tsx` — handle `cart === null` case (`!cart || cart.items.length === 0`)
- [ ] Add `<Link to="/">Browse products</Link>` to `notFound` and `showEmpty` blocks in `store/src/pages/CartPage.tsx`
- [ ] Extend `TestConsumer` in `CartContext.test.tsx` to expose `addItem` via a button
- [ ] Write tests 1-2, update test 3, write tests 4-5, update test 6

---

## 5. Context: Current System Architecture

### Session Management (Current — UF4)

Two entry paths into the store:
1. **ChatGPT redirect**: `?session=<uuid>` → saved to localStorage, cart fetched
2. **Standalone visit**: no param → read from localStorage → if empty, `sessionId = null`

Lazy cart creation in `addItem`: if `sessionId === null` → `POST /api/cart` → create cart → store in state + localStorage → proceed with `addCartItem`.

**Gap**: When `?session=invalid` is provided, CartContext saves it to localStorage and keeps it in state. Since `sessionId` is non-null (just invalid), `addItem` skips cart creation and tries to use the invalid session → fails. UF5 fixes this by clearing the invalid session from state, localStorage, and the URL on `notFound`. The URL param must also be cleared because the URL sync effect (lines 84-93) would otherwise re-set `sessionId` to the invalid value, causing an infinite fetch→clear→resync loop.

### CartPage Empty State (Current)

`showEmpty = !loading && !notFound && !error && cart?.items.length === 0` — when `cart` is null (no session), `cart?.items.length` is `undefined`, so `showEmpty` is false → page renders only `<h1>`. UF5 fixes with `!cart || cart.items.length === 0`.

### Key Files
| File | Purpose |
|------|---------|
| `store/src/context/CartContext.tsx` | Cart session management, lazy creation, optimistic updates |
| `store/src/pages/CartPage.tsx` | Cart display with mutation controls |
| `store/src/api.ts` | `createCart()`, `fetchCartSummary()` — already implemented |
| `server/src/api/cart.ts` | `POST /api/cart` handler — already implemented |

---

## 6. Reference Implementations

- **CartContext lazy creation** (`store/src/context/CartContext.tsx:192-227`): `addItem` checks `if (!currentSessionId)` → calls `createCart()` → stores new sessionId in state + localStorage. UF5 leverages this path after clearing the invalid session.
- **CartContext URL sync effect** (`store/src/context/CartContext.tsx:84-93`): Re-syncs `sessionId` from URL param when they diverge. UF5 must clear the URL param on `notFound` to prevent this effect from re-setting the invalid session (infinite loop).
- **CartPage state rendering** (`store/src/pages/CartPage.tsx:11-32`): loading/notFound/error/empty/items state machine. UF5 fixes the `cart === null` gap.
- **CartContext test patterns** (`store/src/context/CartContext.test.tsx`): `TestConsumer` + `renderWithProvider(search)` + `mockFetchCartSummary`. New tests follow the same pattern but `TestConsumer` must be extended to expose `addItem`.

---

## Notes

- **No backend changes**: All API endpoints and DB operations are already implemented (UF1-UF4). UF5 is purely a frontend behavior fix.
- **No new files**: All changes are modifications to 2 existing files (`CartContext.tsx`, `CartPage.tsx`) + extending 2 existing test files. `CartIndicator.tsx` is unchanged.
- **Multi-tab sharing**: Already works via `localStorage("cart-session-id")`. When one tab creates a new session, the other tab will pick it up on next mount/navigation.
- **URL param clearing prevents infinite loop**: `setSessionId(null)` alone would cause an infinite loop — the URL sync effect (lines 84-93) would see `urlSession !== sessionId` and re-set `sessionId` to the invalid URL value. Clearing the `?session=` param via `setSearchParams` breaks the cycle. The `replace: true` option avoids polluting browser history.
- **Single signal for invalid session**: `notFound: true` is the only signal — no separate `setError()`. This avoids dual-message UX (error banner + "Cart not found") and keeps the error banner available for actual runtime errors (mutation failures, network errors).
- **Existing tests**: Test 3's existing assertion (`notFound: true` → "Not found" in TestConsumer) still passes. The new assertions check the added behavior (localStorage cleared, URL param cleared).
- **CartPage `showEmpty` fix is a bug fix**: Even without UF5, visiting `/cart` with no session shows a blank page. This is a pre-existing gap that UF5 makes visible.

---

## Unresolved Questions

1. **Browse links destination**: "Browse products" links go to `/`. Should they include any context (e.g., a suggested search query) or just the bare homepage?
