# Implementation Plan: UF1 – Widget Redirect to Cart View

## 1. Feature Description

**Objective**: When a user clicks "Checkout" in the ChatGPT ecom-carousel widget, a new browser tab opens on the standalone storefront showing a read-only cart page with all their items.

**Key Capabilities**:
- **CAN** view cart items (image, title, unit price, quantity, line total) and cart total on the storefront
- **CAN** land on the storefront via `?session=<uuid>` URL parameter from the widget
- **CANNOT** edit cart contents on this page (no add/remove/quantity buttons)
- **CANNOT** proceed to checkout from this page (UF3 scope)

**Business Rules**:
- Invalid or expired session ID → "Cart not found" message + link to browse store
- Valid session with empty cart → "Your cart is empty" message + link to browse store
- Product removed from catalog → still displays with snapshot price and title (handled by `priceSnapshot` on `CartItem`; title/image come from Product relation — graceful null fallback)

---

## 2. Architecture

### Files to Modify

#### A. `server/src/index.ts`
**Purpose**: Register new REST cart endpoint

**Changes**:
- Import `cartSummaryApiHandler` from new `./api/cart.js`
- Add route: `app.get("/api/cart/:sessionId/summary", cartSummaryApiHandler)` alongside existing `/api/a2ui/*` routes

**Why**: Storefront needs HTTP access to cart data; MCP tools are only callable from ChatGPT

---

#### B. 🟢 `server/src/api/cart.ts` (new)
**Purpose**: REST endpoint exposing cart summary for the storefront

**Changes**:
- `GET /api/cart/:sessionId/summary`
- Validate `sessionId` as UUID via `validateCartSession()` ⚪ `server/src/tools/utils.ts`
- Lookup cart via `cartGetBySessionId(sessionId)` ⚪ `server/src/db/cart.ts`
  - If validation fails OR cart not found → `200 { items: [], subtotal: 0, notFound: true }`
  - **Important**: This check is required because `cartGetSummary` returns `{ items: [], subtotal: 0 }` for both non-existent and empty carts — the two-step lookup is the only way to differentiate.
- Fetch summary via `cartGetSummary(sessionId)` ⚪ `server/src/db/cart.ts`
  - Returns `200 { items: CartSummaryItem[], subtotal: number, notFound: false }`
- Empty cart (items.length === 0, notFound === false) is a valid 200 response; frontend uses `notFound` to differentiate "Cart not found" from "Your cart is empty"

**Why**: Reuses existing `cartGetSummary` + `validateCartSession`; thin HTTP wrapper

---

#### C. `web/src/components/ecom-carousel.tsx`
**Purpose**: Redirect checkout to storefront instead of external URL

**Changes**:
- Replace `const CHECKOUT_URL = "https://alpic.ai"` → `const STORE_URL = import.meta.env.VITE_STORE_URL || "http://localhost:4000"`
- In the checkout modal's `onClick`, build URL: `${STORE_URL}/cart?session=${cart.sessionId}`
- Pass this URL to `openExternal()` instead of `checkoutUrl.toString()`
- Disable the "Checkout" button when `cart.sessionId` is undefined (guard against optional type)

**Why**: PRD requires widget to redirect to storefront with session parameter

---

#### D. `.env`
**Purpose**: Add store URL env var

**Changes**:
- Add `VITE_STORE_URL=http://localhost:4000`

---

#### E. 🟢 `pnpm-workspace.yaml` (new)
**Purpose**: Enable pnpm workspaces for the store package

**Changes**:
- `packages: ["store"]`
- Only the store is a workspace package; `web/` and `server/` stay as root sub-folders

**Why**: Store is deployed independently (per PRD); own `package.json` keeps deps isolated and enables standalone build/deploy

---

#### F. `package.json` (root)
**Purpose**: Add convenience scripts for store

**Changes**:
- Add script: `"dev:store": "pnpm --filter store dev"`
- Add script: `"build:store": "pnpm --filter store build"`
- Add script: `"typecheck:store": "pnpm --filter store typecheck"`
- Update script: `"check": "pnpm lint && pnpm typecheck && pnpm typecheck:store && pnpm audit:ci"`
- No new dependencies at root (`react-router-dom` goes in `store/package.json`)

---

#### G. 🟢 `store/` directory (new — independent workspace package)

**Structure**:
```
store/
├── package.json            # Own deps: react, react-dom, react-router-dom, vite, etc.
├── .env                    # VITE_API_URL=http://localhost:3000
├── index.html              # HTML entry
├── vite.config.ts          # Port 4000, aliases (@shared → ../shared)
├── tsconfig.json           # Own config with @shared path alias
└── src/
    ├── main.tsx            # createRoot + BrowserRouter
    ├── App.tsx             # <Route path="/cart" element={<CartPage />} />
    ├── pages/
    │   └── CartPage.tsx    # Read-only cart (loading/notFound/empty/items states)
    ├── api.ts              # fetchCartSummary(sessionId) → GET /api/cart/:id/summary
    └── index.css           # Reuse widget CSS variable scheme, adapted for full-page
```

**`store/package.json`**:
- `dependencies`: `react`, `react-dom`, `react-router-dom`
- `devDependencies`: `@vitejs/plugin-react`, `vite`, `typescript`, `@types/react`, `@types/react-dom`
- `scripts`: `dev` (vite on port 4000), `build` (vite build), `preview`, `typecheck`

**`store/tsconfig.json`**:
- Own config with `@shared/*` → `../shared/*` path alias
- Separate from root tsconfig (store has different deps like react-router-dom)

**`store/vite.config.ts`**:
- Port 4000, React plugin, `@shared` alias → `../shared`
- `VITE_API_URL` env var for API base URL (defaults to `http://localhost:3000`)

**`store/src/pages/CartPage.tsx`**:
- Read `session` from `useSearchParams()`
- If no `session` param → render "Cart not found" message (no API call)
- On mount, call `fetchCartSummary(sessionId)`
- States: loading / notFound (`notFound: true` → "Cart not found") / empty cart ("Your cart is empty") / items list
- Render: item rows (image, title, unit price × quantity, line total) + subtotal footer
- Both error/empty states include a link placeholder (future: link to product browsing page)

**`store/src/api.ts`**:
- `const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000"`
- `fetchCartSummary(sessionId: string): Promise<CartSummary & { notFound: boolean }>` — `GET ${API_BASE}/api/cart/${sessionId}/summary`
- Always returns 200; caller checks `notFound` boolean to differentiate missing cart from empty cart

**`store/src/index.css`**:
- Reuse CSS variable scheme from ⚪ `web/src/index.css` (`.light`/`.dark` vars, `--bg`, `--text`, `--accent`)
- Adapt `.summary-item`, `.summary-list`, `.summary-subtotal` patterns from widget cart-summary
- Full-page layout (centered container, max-width, responsive)

---

## 3. Test List

### Test File: `server/tests/cart-api.integration.test.ts`

1. **`returns cart summary for valid session with items`**
   - Seed cart with 2 items → `GET /api/cart/:sessionId/summary` → 200, items array length 2, correct subtotal

2. **`returns empty items for valid session with empty cart`**
   - Create cart with no items → `GET /api/cart/:sessionId/summary` → 200, `items: []`, `subtotal: 0`

3. **`returns notFound for unknown session ID`**
   - `GET /api/cart/<random-uuid>/summary` → 200, `{ items: [], subtotal: 0, notFound: true }`

4. **`returns notFound for invalid (non-UUID) session ID`**
   - `GET /api/cart/not-a-uuid/summary` → 200, `{ items: [], subtotal: 0, notFound: true }`

### Test File: `store/src/pages/CartPage.test.tsx`

5. **`renders cart items when session is valid`**
   - Mock fetch → return 2 items → assert item titles, prices, quantities, line totals, subtotal rendered

6. **`renders "Cart not found" when response has notFound: true`**
   - Mock fetch → 200, `{ notFound: true, items: [], subtotal: 0 }` → assert "Cart not found" message visible

7. **`renders "Your cart is empty" when cart has zero items`**
   - Mock fetch → 200, `{ notFound: false, items: [], subtotal: 0 }` → assert "Your cart is empty" message visible

8. **`renders "Cart not found" when no session param in URL`**
   - No `?session=` → assert "Cart not found" message without making API call

### Test File: `web/src/components/ecom-carousel.test.tsx`

9. **Update existing `"renders checkout summary and opens the checkout URL"` test**
   - Change assertion from `openExternal("https://alpic.ai/?cart=1%2C2")` to `openExternal("http://localhost:4000/cart?session=<sessionId>")`
   - Set `mocks.widgetState.sessionId` to a UUID to verify it's passed in the URL
   - Verify checkout button is disabled when `cart.sessionId` is undefined

> Integration tests (1-4) call the handler directly with mock req/res objects, following the A2UI test pattern in `server/tests/helpers/a2ui-mocks.ts`. No supertest needed. Unit tests (5-8) mock `fetch`. Test 9 updates existing ecom-carousel test.

---

## 4. To Do List

### Phase 1: Widget checkout redirect
> Commit: `feat(widget): redirect checkout to standalone storefront`

- [ ] Add `VITE_STORE_URL=http://localhost:4000` to `.env`
- [ ] Replace `CHECKOUT_URL` with `VITE_STORE_URL` env var in `web/src/components/ecom-carousel.tsx`
- [ ] Build `/cart?session=${cart.sessionId}` URL and pass to `openExternal()`
- [ ] Disable checkout button when `cart.sessionId` is undefined
- [ ] Update existing checkout URL test in `web/src/components/ecom-carousel.test.tsx` (test 9)

### Phase 2: REST cart summary endpoint
> Commit: `feat(api): add GET /api/cart/:sessionId/summary endpoint`

- [ ] Create `server/src/api/cart.ts` — validate session, call `cartGetSummary`, return JSON with `notFound` boolean
- [ ] Register route in `server/src/index.ts`
- [ ] Write tests 1-4 — `server/tests/cart-api.integration.test.ts`

### Phase 3: Store app scaffold
> Commit: `chore(store): scaffold standalone Vite app with blank cart route`

- [ ] Create `pnpm-workspace.yaml`
- [ ] Add `dev:store`, `build:store`, `typecheck:store` scripts to root `package.json`
- [ ] Update `check` script in root `package.json` to include `pnpm typecheck:store`
- [ ] Create `store/package.json` with deps (react, react-dom, react-router-dom, vite, etc.)
- [ ] Create `store/.env` with `VITE_API_URL=http://localhost:3000`
- [ ] Run `pnpm install` to initialize workspace and install store dependencies
- [ ] Create `store/tsconfig.json`, `store/vite.config.ts`, `store/index.html`
- [ ] Create `store/src/main.tsx` + `store/src/App.tsx` (blank `<CartPage />` placeholder)
- [ ] Add `store/src/index.css` — base styles (CSS vars, full-page layout)

### Phase 4: Cart display page
> Commit: `feat(store): implement read-only cart page`

- [ ] Create `store/src/api.ts` — `fetchCartSummary(sessionId)`
- [ ] Implement `store/src/pages/CartPage.tsx` — loading/error/empty/items states
- [ ] Write tests 5-8 — `store/src/pages/CartPage.test.tsx`
- [ ] Verify full flow: API + store running, widget checkout → storefront displays cart

---

## 5. Context: Current System Architecture

### Cart Data Flow
Two session concepts in the system:
- **Cart session ID** (UUID): stored in `carts.session_id`, used by MCP tools, tracked in `CartWidgetState.sessionId`
- **A2UI session ID**: in-memory (`server/src/a2ui/session.ts`), links to cart session via `A2UISession.cartSessionId`

UF1 uses the **cart session ID** directly (passed in `?session=` URL param).

### Current Checkout Flow
1. Cart indicator click → `useRequestModal()` opens modal
2. Modal shows order summary from widget state (not server)
3. "Checkout" button → `openExternal("https://alpic.ai?cart=1,2,3")`

UF1 replaces step 3 with `openExternal("${STORE_URL}/cart?session=${sessionId}")`.

### Key Files
| File | Purpose |
|------|---------|
| `server/src/db/cart.ts` | `cartGetSummary`, `cartGetBySessionId` |
| `server/src/tools/utils.ts` | `validateCartSession`, response builders |
| `server/src/tools/cart-summary.ts` | MCP tool (reference pattern for REST endpoint) |
| `web/src/components/ecom-carousel.tsx` | Checkout modal + `openExternal` redirect |
| `web/src/components/cart-summary.tsx` | Read-only cart display (UI reference for store) |
| `shared/types.ts` | `CartSummary`, `CartSummaryItem` types |

---

## 6. Reference Implementations

- **Cart summary MCP tool** (`server/src/tools/cart-summary.ts`): Same data flow as the new REST endpoint — validate session, fetch summary, return. Direct pattern to replicate as HTTP handler.
- **Cart summary React component** (`web/src/components/cart-summary.tsx`): Read-only cart display with items list + subtotal. UI structure to mirror in `CartPage`.
- **A2UI event endpoint** (`server/src/a2ui/event.ts`): Express request handler pattern with Zod validation.
- **Widget CSS** (`web/src/index.css`): CSS variable scheme (`.light`/`.dark` themes) and `.summary-*` classes to reuse in store.
- **Ecom-carousel checkout modal** (`web/src/components/ecom-carousel.tsx:180-226`): Current redirect logic to modify.

---

## Notes

- **Deleted products edge case**: `cartGetSummary` joins on `Product` for title/imageUrl. Current schema prevents product deletion when cart items exist (no cascade on `CartItem→Product`). Safe for UF1; if soft-delete is needed later, add `titleSnapshot` + `imageUrlSnapshot` to `CartItem`.
- **CORS**: Already `Access-Control-Allow-Origin: *` — store on port 4000 can call API on port 3000.
- **Future UFs**: Store scaffold (React Router, api.ts, styles) designed to extend for UF2-UF5.

---

## Unresolved Questions

1. **Store deployment**: Same server, separate domain, or subdomain? Affects production `VITE_STORE_URL`.
2. **Light/dark theme**: Auto-detect system preference or default to light? Widget uses ChatGPT's theme via `useLayout()`.