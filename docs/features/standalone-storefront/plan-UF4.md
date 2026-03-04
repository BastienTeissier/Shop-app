# Implementation Plan: UF4 – Product Browsing

## 1. Feature Description

**Objective**: Enable product discovery on the standalone storefront via a search bar and tiered product grid, powered by the existing A2UI recommendation agent over SSE.

**Key Capabilities**:
- **CAN** see a search bar and pre-registered prompt buttons on homepage
- **CAN** click a prompt button or type a query to search products
- **CAN** see products streaming in real-time via SSE, organized into Essential/Recommended/Optional tiers
- **CAN** see a loading indicator while the recommendation agent processes
- **CAN** click a product card to navigate to a detail page (`/products/:id`)
- **CAN** see full product details (larger image, full description, price) on detail page
- **CAN** add products to cart from both the grid and detail page
- **CAN** reconnect manually if SSE connection drops
- **CANNOT** filter or sort products (out of scope — agent handles relevance)
- **CANNOT** paginate results (agent returns a curated set)

**Business Rules**:
- Empty homepage on load: search bar + prompt buttons (e.g., "Running gear", "Ski equipment", "Beach essentials")
- Search triggers SSE connection to A2UI stream → products stream into tiered grid
- New search while previous is streaming → disconnect old SSE, start new one, replace grid
- SSE connection drop → "Connection lost" message + "Reconnect" button
- No results → "No products found" with suggestion to try different terms
- Product detail page fetches from REST endpoint `GET /api/products/:id` (not SSE)
- Shared presentational components (ProductCard, TieredProductGrid) extracted to `shared/components/` for reuse by both store and A2UI widget

---

## 2. Architecture

### Files to Modify

#### A. `server/src/db/products.ts`
**Purpose**: Add single-product lookup for detail page

**Changes**:
- Add `productGetById(id: number): Promise<Product | null>`
  - `prisma.product.findUnique({ where: { id } })`
  - Returns `Product | null`

**Why**: Store detail page needs to fetch a single product by ID; only `productList` and `productListByCategories` exist today

---

#### B. 🟢 `server/src/api/products.ts` (new)
**Purpose**: REST endpoint for single product lookup

**Changes**:
- Add `productGetApiHandler` — `GET /api/products/:id`
  - Parse `id` as integer from `req.params.id` → `400 { notFound: true }` if NaN
  - Call ⚪ `productGetById(id)` from `server/src/db/products.ts`
  - Found → `200 { ...product, notFound: false }`
  - Not found → `404 { notFound: true }`

**Why**: Product detail page needs HTTP access to product data; follows existing REST API pattern from `server/src/api/cart.ts`

---

#### C. `server/src/api/index.ts`
**Purpose**: Barrel re-export product handler

**Changes**:
- Add `export * from "./products.js";`

---

#### D. `server/src/index.ts`
**Purpose**: Register product route

**Changes**:
- Import `productGetApiHandler` from `./api/index.js`
- Add route: `app.get("/api/products/:id", productGetApiHandler)`

---

#### E. `shared/types.ts`
**Purpose**: Add product API response type and cart creation types

**Changes**:
- Add `ProductApiResponse`:
  - `(Product & { notFound: false }) | { notFound: true }`
- Add `CreateCartResponse`:
  - `{ sessionId: string }`

**Why**: Typed contract between server and store frontend (matches existing `OrderApiResponse` pattern). `CreateCartResponse` supports lazy cart creation from the standalone storefront.

---

#### E2. 🟢 `server/src/api/cart-create.ts` (new)
**Purpose**: REST endpoint to create a new empty cart and return its session ID

**Changes**:
- Add `cartCreateApiHandler` — `POST /api/cart`
  - Generate a UUID session ID via `crypto.randomUUID()`
  - Call ⚪ `cartCreate(sessionId)` from `server/src/db/cart.ts`
  - Return `201 { sessionId }`

**Why**: The standalone storefront needs to create a cart lazily on first add-to-cart. The ChatGPT flow creates carts via A2UI events, but the store has no A2UI↔cart linking. This endpoint gives the store's `CartContext` a way to obtain a cart session ID without relying on URL params or the A2UI system.

---

#### E3. `server/src/api/index.ts`
**Purpose**: Barrel re-export cart-create handler (in addition to section C for products)

**Changes**:
- Add `export * from "./cart-create.js";`

---

#### E4. `server/src/index.ts`
**Purpose**: Register cart creation route (in addition to section D for products)

**Changes**:
- Import `cartCreateApiHandler` from `./api/index.js`
- Add route: `app.post("/api/cart", cartCreateApiHandler)`

---

#### E5. `store/src/context/CartContext.tsx`
**Purpose**: Refactor cart session management for standalone storefront

**Changes**:
- **Remove dependency on URL `?session=` param** for cart session ID
- **Use localStorage** to persist the cart session ID across page navigations
  - On mount: read `cart-session-id` from `localStorage`. If present, fetch cart summary.
  - If no session in localStorage → `sessionId` is `null`, no fetch.
- **Lazy cart creation** in `addItem`:
  - If `sessionId` is `null`: call ⚪ `createCart()` from `store/src/api.ts` → receives `{ sessionId }` → store in state + `localStorage`
  - Then call existing `addCartItem(sessionId, productId)` flow
- **Keep `?session=` param as fallback** for backwards compatibility with ChatGPT redirect flow:
  - On mount: if `?session=` URL param exists, use it and save to localStorage (migration path)
  - Otherwise, read from localStorage
- **Expose `sessionId`** in context value so other components (like navigation links to `/cart?session=xxx`) can access it

**Why**: The `?session=` URL param was designed for the ChatGPT redirect flow. The standalone store navigates between pages (homepage → detail → cart) and cannot rely on URL params being present everywhere. `localStorage` provides persistence; lazy creation via `POST /api/cart` avoids requiring a session before the user's first add-to-cart.

---

#### F. 🟢 `shared/a2ui-utils.ts` (new)
**Purpose**: Extract immutable data model update function for reuse

**Changes**:
- Extract `applyDataModelUpdate(dataModel: RecommendationDataModel, path: string, value: unknown): RecommendationDataModel` from ⚪ `web/src/components/a2ui/A2UIRenderer.tsx:167-194`
  - Root update (`/` or `""`) → replace entire model
  - Otherwise → `structuredClone` + path navigation + set value
  - Pure function, no React dependency

**Why**: Both A2UI widget renderer and store SSE hook need the same immutable path-based update logic. Avoids duplication.

---

#### G. 🟢 `shared/components/ProductCard.tsx` (new)
**Purpose**: Presentational product card component shared by A2UI widget and store

**Changes**:
- Props type:
  ```tsx
  type ProductCardProps = {
    product: {
      id: number;
      title: string;
      imageUrl: string;
      price: number;
      description?: string;
      highlights?: string[];
      reasonWhy?: string[];
    };
    selected?: boolean;
    onCardClick?: () => void;
    onAddToCart?: () => void;
    className?: string;
  };
  ```
- Renders: image, title, price (via ⚪ `formatPrice` from `shared/format.ts`), truncated description (100 chars), reasonWhy tags, highlights tags
- `onCardClick` wraps the card body (image + info); `onAddToCart` on the "Add to cart" button
- CSS class `product-card`, `selected` modifier — reuses existing class names from ⚪ `web/src/index.css`

**Why**: Extracts shared visual rendering from A2UI ProductCard; both widget and store use the same card appearance with different interaction wrappers

---

#### H. 🟢 `shared/components/TieredProductGrid.tsx` (new)
**Purpose**: Tier grouping + section rendering, shared by A2UI and store

**Changes**:
- Exports `TIER_CONFIG` constant (label, icon, order per tier) — extracted from ⚪ `web/src/components/a2ui/TieredListRenderer.tsx:10-17`
- Exports `groupProductsByTier<T extends { tier?: string }>(products: T[]): { tier: string; label: string; icon: string; products: T[] }[]`
  - Groups by `tier` field (default `"recommended"`), removes empty groups, sorts by tier order
- Exports `TieredProductGrid` component:
  ```tsx
  type TieredProductGridProps<T extends { tier?: string }> = {
    products: T[];
    renderProduct: (product: T) => React.ReactNode;
    emptyMessage?: string;
    className?: string;
  };
  ```
  - Uses `groupProductsByTier` to group
  - Renders tier sections with header (icon + label + count) and product grid
  - Empty state → `emptyMessage` or "No items"
  - CSS classes: `tier-section`, `tier-header`, `tier-products` — reuses existing names

**Why**: Tier grouping logic and UI are identical between A2UI TieredListRenderer and store homepage. Shared component eliminates duplication.

---

#### I. 🟢 `shared/components/index.ts` (new)
**Purpose**: Barrel exports for shared components

**Changes**:
- `export * from "./ProductCard.js";`
- `export * from "./TieredProductGrid.js";`

---

#### J. `web/src/components/a2ui/ProductCard.tsx`
**Purpose**: Refactor to wrap shared ProductCard

**Changes**:
- Import `ProductCard as SharedProductCard` from `@shared/components/ProductCard.js`
- Keep binding resolution + `onAction` dispatch as wrapper logic
- Delegate rendering to `<SharedProductCard product={product} selected={isSelected} onCardClick={handleSelect} onAddToCart={handleAddToCart} />`
- Remove duplicated JSX (image, title, price, description, tags)

**Why**: A2UI ProductCard becomes a thin adapter (binding → props) over the shared presentational component

---

#### K. `web/src/components/a2ui/TieredListRenderer.tsx`
**Purpose**: Refactor to use shared tier grouping

**Changes**:
- Import `groupProductsByTier`, `TIER_CONFIG` from `@shared/components/TieredProductGrid.js`
- Remove local `TIER_CONFIG` and `groupProductsByTier` definitions
- Keep binding resolution + `renderComponent` dispatch (A2UI-specific)
- Use shared `groupProductsByTier` for product grouping

**Why**: Tier constants and grouping logic extracted to shared; renderer keeps A2UI-specific template dispatch

---

#### L. `web/src/components/a2ui/A2UIRenderer.tsx`
**Purpose**: Use shared `applyDataModelUpdate`

**Changes**:
- Import `applyDataModelUpdate` from `@shared/a2ui-utils.js`
- Remove local `applyDataModelUpdate` function definition (lines 167-194)

**Why**: Function extracted to `shared/a2ui-utils.ts` for reuse by store SSE hook

---

#### M. 🟢 `store/src/hooks/useRecommendations.ts` (new)
**Purpose**: Custom hook managing SSE connection to A2UI stream for product recommendations

**Changes**:
- Uses single A2UI session per page load: `useRef(crypto.randomUUID())`
- Return type:
  ```typescript
  type UseRecommendationsReturn = {
    products: RecommendationProduct[];
    status: RecommendationStatus;
    connected: boolean;
    error: string | null;
    search: (query: string) => void;
    reconnect: () => void;
  };
  ```
- **Connection lifecycle**:
  - On first `search(query)` call: create EventSource to `${API_BASE}/api/a2ui/stream?session=${a2uiSessionId}&query=${query}`
  - Parse `dataModelUpdate` messages → apply to local data model state via ⚪ `applyDataModelUpdate` from `shared/a2ui-utils.ts`
  - Extract `products` and `status` from data model
  - Ignore `surfaceUpdate`, `beginRendering`, `endRendering` messages (store has own UI)
  - On `EventSource.onerror` → set `connected: false`, `error: "Connection lost"`
- **Subsequent searches**:
  - POST to `${API_BASE}/api/a2ui/event` with `{ sessionId: a2uiSessionId, action: "search", payload: { query } }`
  - SSE stream receives updated products via data model updates
- **Reconnect**:
  - Store last query in a `useRef` (updated on every `search()` call)
  - Close existing EventSource → create new one with same session ID + `?query=${lastQuery}` to resume the user's previous search
  - Resets data model to initial state (server auto-triggers search on connect, so products will stream back)
- **Cleanup**: close EventSource on unmount
- **Important**: cart operations are NOT routed through A2UI. The store uses `useCart().addItem(productId)` via REST API (already built in UF2). A2UI session is only for product recommendations.

**Why**: Decouples SSE management from UI. Reuses existing A2UI streaming protocol without the full A2UI renderer.

---

#### N. 🟢 `store/src/pages/HomePage.tsx` (new)
**Purpose**: Product browsing page with search bar, prompt buttons, and tiered product grid

**Changes**:
- **Search bar**: text input + submit button at top of page
- **Prompt buttons**: array of pre-registered queries rendered as clickable chips
  - `["Running gear", "Ski equipment", "Hiking essentials", "Beach gear", "Cycling setup"]`
  - Click → calls `search(prompt)` from `useRecommendations()`
- **Product grid**: uses ⚪ `TieredProductGrid` from `shared/components/`
  - `renderProduct` renders ⚪ `SharedProductCard` with:
    - `onCardClick` → `navigate(`/products/${product.id}`, { state: { product } })` — passes recommendation metadata (highlights, reasonWhy, tier) via React Router state
    - `onAddToCart` → `useCart().addItem(product.id)`
- **States**:
  - Idle (no search yet) → search bar + prompt buttons, no grid
  - Searching (`status.phase === "searching"`) → loading indicator + grid (products appear incrementally)
  - Completed → grid with results
  - No results → "No products found. Try different search terms."
  - Disconnected → "Connection lost" + "Reconnect" button
- **New search replaces previous**: each `search()` call clears products (reset to empty before new results stream in)

---

#### O. 🟢 `store/src/pages/ProductDetailPage.tsx` (new)
**Purpose**: Full product detail view

**Changes**:
- Route: `/products/:id`
- Read `id` from `useParams()`
- **Data loading strategy** (two sources):
  1. Check `useLocation().state?.product` for recommendation metadata passed via React Router state (has highlights, reasonWhy, tier)
  2. If no route state (direct URL access, page refresh): call ⚪ `fetchProduct(id)` from `store/src/api.ts` (basic `Product` data only)
- States: loading / notFound / loaded
- Loaded view:
  - Large product image
  - Full title
  - Full description (no truncation)
  - Price (via ⚪ `formatPrice`)
  - Highlights and reasonWhy tags (if available from route state)
  - "Add to cart" button → `useCart().addItem(product.id)`
  - "Back to search" link → navigate back or `/`
- Not found → "Product not found" message

---

#### P. `store/src/api.ts`
**Purpose**: Add product, cart creation, and A2UI event API functions

**Changes**:
- Add `fetchProduct(id: number): Promise<ProductApiResponse>`
  - `GET ${API_BASE}/api/products/${id}`
  - Returns ⚪ `ProductApiResponse` from `shared/types.ts`
- Add `createCart(): Promise<CreateCartResponse>`
  - `POST ${API_BASE}/api/cart`
  - Returns ⚪ `CreateCartResponse` from `shared/types.ts`
  - Used by `CartContext` for lazy cart session creation
- Add `postA2UIEvent(sessionId: string, action: string, payload: Record<string, unknown>): Promise<void>`
  - `POST ${API_BASE}/api/a2ui/event` body `{ sessionId, action, payload }`
  - Throws on non-2xx
- Add `getA2UIStreamUrl(sessionId: string, query?: string): string`
  - Returns `${API_BASE}/api/a2ui/stream?session=${sessionId}` with optional `&query=${query}`
  - Used by `useRecommendations` hook to construct EventSource URL

---

#### Q. `store/src/App.tsx`
**Purpose**: Add homepage and product detail routes

**Changes**:
- Import `HomePage` and `ProductDetailPage`
- Add routes:
  - `<Route path="/" element={<HomePage />} />`
  - `<Route path="/products/:id" element={<ProductDetailPage />} />`

---

#### R. `store/src/index.css`
**Purpose**: Styles for homepage, search, product grid, and detail page

**Changes**:
- `.search-bar` — flex row, gap 0.5rem, max-width, centered
- `.search-input` — flex 1, padding 0.75rem, border, border-radius 8px, font-size 1rem
- `.search-btn` — accent background, white text, padding 0.75rem 1.5rem, border-radius 8px
- `.prompt-buttons` — flex row, flex-wrap, gap 0.5rem, justify-content center, margin 1rem 0
- `.prompt-btn` — pill button (border, rounded-full, padding 0.5rem 1rem), hover accent
- `.product-grid` — CSS grid, `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`, gap 1rem
- `.tier-section` — margin-bottom 1.5rem
- `.tier-header` — flex row, align-items center, gap 0.5rem, font-weight 600, margin-bottom 0.75rem
- `.status-message` — text-align center, padding 1rem, color var(--text-muted)
- `.connection-error` — text-align center, padding 2rem
- `.reconnect-btn` — accent outline button
- `.product-detail` — max-width 600px, centered, padding 2rem
- `.product-detail-image` — width 100%, max-height 400px, object-fit contain
- `.product-detail-info` — padding 1rem 0
- `.back-link` — color var(--accent), margin-bottom 1rem

---

## 3. Test List

### Test File: `server/tests/product-api.integration.test.ts` (new)

Uses a local `createMockContext` wrapper around `createEventMockContext` (from `helpers/a2ui-mocks.ts`) that sets `req.params.id` — same pattern as `cart-api.integration.test.ts:72-79` which wraps `createEventMockContext` and sets `req.params.sessionId`.

1. **`returns product for valid ID`**
   - Seed product → `GET /api/products/:id` → 200, `{ ...product, notFound: false }`

2. **`returns 404 for unknown product ID`**
   - `GET /api/products/99999` → 404, `{ notFound: true }`

3. **`returns 400 for non-numeric ID`**
   - `GET /api/products/abc` → 400, `{ notFound: true }`

### Test File: `shared/components/ProductCard.test.tsx`

Run via store Vitest config (add `../shared/**/*.test.tsx` to include pattern).

4. **`renders image, title, and formatted price`**
   - Render with product `{ title: "Trail Shoe", price: 12999, imageUrl: "..." }` → assert image, "Trail Shoe", "$129.99"

5. **`truncates description over 100 chars`**
   - Render with 150-char description → assert ends with "..."

6. **`calls onAddToCart on button click`**
   - Click "Add to cart" → assert callback called

7. **`calls onCardClick on card body click`**
   - Click card body → assert callback called

8. **`renders highlights and reasonWhy tags`**
   - Render with `highlights: ["Waterproof"]`, `reasonWhy: ["Great for trails"]` → assert both visible

### Test File: `shared/components/TieredProductGrid.test.tsx`

9. **`groups products by tier with correct section headers`**
   - Render with products spanning 3 tiers → assert "Essential", "Recommended", "Optional" sections

10. **`sorts tiers: essential → recommended → optional`**
    - Render with products in reverse order → assert sections ordered correctly

11. **`defaults to recommended tier when tier is undefined`**
    - Render with product missing `tier` → assert appears in "Recommended" section

12. **`renders empty message when no products`**
    - Render with `[]` → assert "No products found" visible

### Test File: `store/src/hooks/useRecommendations.test.ts` (new)

Mock `EventSource` globally. Mock `store/src/api.js` for `postA2UIEvent` and `getA2UIStreamUrl`.

13. **`connects EventSource on first search call`**
    - Call `search("running")` → assert EventSource created with correct URL

14. **`extracts products from dataModelUpdate messages`**
    - Simulate SSE message `{ type: "dataModelUpdate", path: "/products", value: [product1, product2] }` → assert `products` returns 2 items

15. **`extracts status from dataModelUpdate messages`**
    - Simulate `{ path: "/status", value: { phase: "searching", message: "Searching..." } }` → assert `status.phase === "searching"`

16. **`sets connected: false and error on EventSource error`**
    - Trigger `onerror` → assert `connected === false`, `error === "Connection lost"`

17. **`posts search event for subsequent searches`**
    - Call `search("ski")` twice → first creates EventSource, second calls `postA2UIEvent(sessionId, "search", { query: "ski" })`

18. **`reconnect closes old connection and creates new one with last query`**
    - Call `search("running")` then `reconnect()` → assert old EventSource closed, new one created with `?query=running` in URL

19. **`closes EventSource on unmount`**
    - Unmount → assert EventSource.close() called

### Test File: `store/src/pages/HomePage.test.tsx` (new)

Mock `useRecommendations` hook and `useCart` context.

20. **`renders search bar and prompt buttons on initial load`**
    - Provide idle status → assert search input, submit button, 5 prompt buttons visible

21. **`clicking prompt button triggers search`**
    - Click "Running gear" → assert `search("Running gear")` called

22. **`typing query and submitting triggers search`**
    - Type "trail shoes" + submit → assert `search("trail shoes")` called

23. **`shows loading indicator during search`**
    - Provide `status.phase: "searching"` → assert loading indicator visible

24. **`renders products in tiered grid when completed`**
    - Provide products with tiers + `status.phase: "completed"` → assert tier sections and product cards rendered

25. **`shows "No products found" for empty completed results`**
    - Provide `products: []`, `status.phase: "completed"` → assert empty message visible

26. **`shows connection error with Reconnect button`**
    - Provide `connected: false`, `error: "Connection lost"` → assert error message + Reconnect button visible

27. **`clicking Reconnect calls reconnect()`**
    - Click "Reconnect" → assert `reconnect()` called

28. **`product card click navigates to /products/:id with route state`**
    - Click product card → assert navigation to `/products/<id>` with `state: { product }` containing recommendation metadata

29. **`add to cart on product card calls useCart().addItem`**
    - Click "Add to cart" on card → assert `addItem(productId)` called

### Test File: `store/src/pages/ProductDetailPage.test.tsx` (new)

Mock `store/src/api.js` for `fetchProduct`. Mock `useCart` context.

30. **`renders product details for valid ID`**
    - Mock `fetchProduct` resolving `{ ...product, notFound: false }` → assert image, title, description, price visible

31. **`renders loading state`**
    - Mock `fetchProduct` as pending → assert loading indicator visible

32. **`renders "Product not found" when notFound`**
    - Mock `fetchProduct` resolving `{ notFound: true }` → assert "Product not found" visible

33. **`add to cart button calls useCart().addItem`**
    - Click "Add to cart" → assert `addItem(productId)` called

34. **`renders back link to homepage`**
    - Assert link to `/` visible

> Integration tests (1-3) call handler directly with mock req/res. Shared component tests (4-12) test presentational components with direct props. Hook tests (13-19) mock EventSource + API. Page tests (20-34) mock hook and context. All follow existing UF1-UF3 patterns.

---

## 4. To Do List

### Phase 1: REST endpoints (product detail + cart creation)
> Commit: `feat(api): add GET /api/products/:id and POST /api/cart endpoints`

- [ ] Add `productGetById(id: number)` to `server/src/db/products.ts` — `prisma.product.findUnique`
- [ ] Add `ProductApiResponse` and `CreateCartResponse` types to `shared/types.ts`
- [ ] Create `server/src/api/products.ts` — `productGetApiHandler` (validate int ID, lookup, return JSON)
- [ ] Create `server/src/api/cart-create.ts` — `cartCreateApiHandler` (generate UUID, create cart, return `{ sessionId }`)
- [ ] Add `export * from "./products.js"` and `export * from "./cart-create.js"` to `server/src/api/index.ts`
- [ ] Register routes in `server/src/index.ts`:
  - `app.get("/api/products/:id", productGetApiHandler)`
  - `app.post("/api/cart", cartCreateApiHandler)`
- [ ] Write tests 1-3 in `server/tests/product-api.integration.test.ts`

### Phase 2: Shared utilities and components
> Commit: `refactor(shared): extract ProductCard, TieredProductGrid, and applyDataModelUpdate`

- [ ] Create `shared/a2ui-utils.ts` — extract `applyDataModelUpdate` from `web/src/components/a2ui/A2UIRenderer.tsx` (immutable, `structuredClone`-based)
- [ ] Create `shared/components/ProductCard.tsx` — presentational component with `product`, `onCardClick`, `onAddToCart`, `selected` props. Uses `formatPrice` from `shared/format.ts`
- [ ] Create `shared/components/TieredProductGrid.tsx` — export `TIER_CONFIG`, `groupProductsByTier`, and `TieredProductGrid` component with `products`, `renderProduct`, `emptyMessage` props
- [ ] Create `shared/components/index.ts` — barrel exports
- [ ] Update `store/vite.config.ts` — add `../shared/**/*.test.{ts,tsx}` to Vitest include (for shared component tests)
- [ ] Write tests 4-8 in `shared/components/ProductCard.test.tsx`
- [ ] Write tests 9-12 in `shared/components/TieredProductGrid.test.tsx`

### Phase 3: A2UI refactoring to use shared components
> Commit: `refactor(a2ui): use shared ProductCard, tier config, and applyDataModelUpdate`

- [ ] Refactor `web/src/components/a2ui/ProductCard.tsx` — import shared `ProductCard`, delegate rendering, keep binding resolution + `onAction` dispatch as wrapper
- [ ] Refactor `web/src/components/a2ui/TieredListRenderer.tsx` — import `groupProductsByTier` and `TIER_CONFIG` from shared, remove local definitions, keep binding resolution + `renderComponent` dispatch
- [ ] Refactor `web/src/components/a2ui/A2UIRenderer.tsx` — import `applyDataModelUpdate` from `@shared/a2ui-utils.js`, remove local definition
- [ ] Verify existing A2UI tests still pass (`pnpm test:unit`)

### Phase 4: CartContext refactor for standalone storefront
> Commit: `refactor(store): use localStorage for cart session, add lazy cart creation`

- [ ] Add `createCart()` to `store/src/api.ts` — `POST /api/cart` → returns `{ sessionId }`
- [ ] Refactor `store/src/context/CartContext.tsx`:
  - Read cart session from `localStorage("cart-session-id")` instead of `?session=` URL param
  - Keep `?session=` as fallback: if URL param exists, use it and save to localStorage
  - In `addItem`: if `sessionId` is null, call `createCart()` first, store result in state + localStorage, then proceed with `addCartItem`
- [ ] Update existing CartContext tests for localStorage-based session management

### Phase 5: Store SSE hook and API functions
> Commit: `feat(store): add useRecommendations hook and product/A2UI API client`

- [ ] Add `fetchProduct(id)`, `postA2UIEvent(sessionId, action, payload)`, `getA2UIStreamUrl(sessionId, query)` to `store/src/api.ts`
- [ ] Create `store/src/hooks/useRecommendations.ts` — EventSource connection, data model state, `search()` and `reconnect()` (with last query ref) functions
- [ ] Write tests 13-19 in `store/src/hooks/useRecommendations.test.ts`

### Phase 6: Store homepage
> Commit: `feat(store): implement homepage with search and tiered product grid`

- [ ] Create `store/src/pages/HomePage.tsx` — search bar, prompt buttons, tiered grid via shared components, loading/error/empty states. Product card click navigates with React Router state (recommendation metadata).
- [ ] Add `<Route path="/" element={<HomePage />} />` to `store/src/App.tsx`
- [ ] Add homepage + search + prompt buttons + product grid + status styles to `store/src/index.css`
- [ ] Write tests 20-29 in `store/src/pages/HomePage.test.tsx`

### Phase 7: Store product detail page
> Commit: `feat(store): implement product detail page`

- [ ] Create `store/src/pages/ProductDetailPage.tsx` — use route state for recommendation metadata if available, fall back to REST fetch. Display full details, add to cart, back link.
- [ ] Add `<Route path="/products/:id" element={<ProductDetailPage />} />` to `store/src/App.tsx`
- [ ] Add detail page styles to `store/src/index.css`
- [ ] Write tests 30-34 in `store/src/pages/ProductDetailPage.test.tsx`

---

## 5. Context: Current System Architecture

### A2UI Streaming Flow (Widget)
1. ChatGPT invokes `product-recommendations` MCP tool with query
2. Server creates A2UISession, starts SSE connection at `/api/a2ui/stream`
3. Stream sends initial render: `beginRendering → surfaceUpdate → dataModelUpdate → endRendering`
4. `handleRecommend(sessionId, query)` runs LLM recommendation agent
5. Agent calls `search_products` and `rank_products` tools
6. Products broadcast via `broadcastDataModelUpdate(sessionId, "/products", products)`
7. Frontend A2UIRenderer applies data model updates → TieredListRenderer renders tiers
8. User interactions (addToCart, selectProduct, refine) go via `POST /api/a2ui/event`

UF4 reuses steps 2-6 for the store. The store creates its own SSE connection and parses data model updates directly (no A2UIRenderer, no surface/binding system). Cart operations go through REST API instead of A2UI events.

### Two Session Systems
- **Cart session** (UUID): `carts.session_id`, used by REST cart API, stored in `localStorage("cart-session-id")` (standalone store) or URL `?session=xxx` (ChatGPT redirect fallback). Created lazily via `POST /api/cart` on first add-to-cart.
- **A2UI session** (UUID): in-memory (`server/src/a2ui/session.ts`), used for SSE stream + recommendation engine. Internal to `useRecommendations` hook, never exposed in URLs.

In the store, these are completely independent. A2UI session is internal to the `useRecommendations` hook. Cart session is managed by `CartContext` via localStorage. No linking needed — cart operations use REST, not A2UI events.

### Store App (Current — UF3)
- Routes: `/cart`, `/checkout`, `/orders/:reference`
- No homepage or product browsing
- CartContext manages cart state
- No SSE integration

UF4 adds `/` (homepage) and `/products/:id` routes, plus the `useRecommendations` SSE hook.

### Key Files
| File | Purpose |
|------|---------|
| `server/src/a2ui/stream.ts` | SSE endpoint — store connects here |
| `server/src/a2ui/event.ts` | Event endpoint — store posts search actions here |
| `server/src/a2ui/handlers/recommend.ts` | `handleRecommend` — runs LLM agent, broadcasts products |
| `server/src/a2ui/session.ts` | Session management, `broadcastDataModelUpdate` |
| `web/src/components/a2ui/A2UIRenderer.tsx` | Widget SSE client — reference for store hook |
| `web/src/components/a2ui/ProductCard.tsx` | A2UI ProductCard — refactored to wrap shared |
| `web/src/components/a2ui/TieredListRenderer.tsx` | A2UI tier grouping — extracted to shared |
| `shared/a2ui-types.ts` | `RecommendationDataModel`, `A2UIMessage`, `RecommendationProduct` types |
| `store/src/context/CartContext.tsx` | `useCart().addItem()` — used for cart ops from product cards |
| `server/src/db/products.ts` | `productList`, `productListByCategories` — extended with `productGetById` |

---

## 6. Reference Implementations

- **A2UIRenderer** (`web/src/components/a2ui/A2UIRenderer.tsx`): EventSource connection, message parsing, `applyDataModelUpdate`, `onAction` POST. Direct reference for store's `useRecommendations` hook — same SSE protocol, same data model updates.
- **A2UI ProductCard** (`web/src/components/a2ui/ProductCard.tsx`): Product card with image, title, price, highlights, reasonWhy. Refactored to wrap shared component; reference for the shared ProductCard's prop interface.
- **A2UI TieredListRenderer** (`web/src/components/a2ui/TieredListRenderer.tsx`): `TIER_CONFIG`, `groupProductsByTier`. Extracted to shared; reference for tier grouping in store.
- **Cart API handlers** (`server/src/api/cart.ts`): REST handler pattern with session validation, Zod schemas, consistent response shapes. Direct pattern for product API handler.
- **Cart API integration tests** (`server/tests/cart-api.integration.test.ts`): `createMockContext()` wrapper, direct handler invocation. Pattern for product API tests.
- **OrderConfirmationPage** (`store/src/pages/OrderConfirmationPage.tsx`): Fetch-by-ID on mount, loading/notFound/loaded states. Reference for ProductDetailPage.
- **CartPage tests** (`store/src/pages/CartPage.test.tsx`): MemoryRouter + mock context, state-driven assertions. Pattern for HomePage and ProductDetailPage tests.

---

## Notes

- **No A2UI↔Cart linking**: Store uses REST cart API for add-to-cart, not A2UI events. The A2UI session is purely for product recommendations. This avoids the complexity of linking A2UI sessions to cart sessions.
- **Cart session via localStorage**: The standalone store uses `localStorage("cart-session-id")` for cart session persistence instead of URL `?session=` params. URL param is kept as fallback for the ChatGPT redirect flow. Cart is created lazily via `POST /api/cart` on first add-to-cart.
- **Two independent session systems**: A2UI session (in-memory, `useRecommendations` hook) and cart session (DB-backed, `CartContext` via localStorage) are completely independent. The A2UI session ID never appears in URLs or cart API calls.
- **Shared components scope**: Only `ProductCard` and `TieredProductGrid` are extracted. A2UI-specific components (RefineInput, ButtonRenderer, ListRenderer, etc.) stay in `web/src/components/a2ui/`.
- **EventSource lifecycle**: Single SSE connection per page load. First `search()` creates it; subsequent searches POST events on the same connection. `reconnect()` closes and reopens with the last query (stored in a ref). Unmount closes.
- **SSE session deletion on disconnect**: When EventSource disconnects, `removeClient` auto-deletes the A2UI session if no clients remain. On reconnect, `getOrCreateSession` creates a fresh session. The last query is passed via `?query=` param so the server auto-triggers the correct search.
- **Prompt buttons not editable**: Hard-coded activity categories matching the agent's known categories. Future: could be fetched from server or configured per deployment.
- **`shared/` React components**: Both `web/` and `store/` Vite configs have `@shared` alias and React plugin. JSX in `shared/components/` is transpiled by the consumer's build. No additional config needed (confirmed: both `store/vite.config.ts` and `web/vite.config.ts` already have the alias).
- **Existing A2UI tests**: Refactoring wraps shared components without changing behavior. All existing unit tests in `web/src/components/` should pass without modification.
- **Product detail page — dual data source**: When navigating from homepage, React Router state carries recommendation metadata (highlights, reasonWhy, tier). On direct URL access or page refresh, falls back to REST `GET /api/products/:id` which returns basic `Product` data (no recommendation metadata).

---

## Resolved Questions

1. **Default SSE connection on page load**: No. SSE connects only on first `search()` call. No eager connection on page load.
2. **Product detail page — recommendation data**: Pass recommendation metadata via React Router state (`navigate(`/products/${id}`, { state: { product } })`). Detail page uses route state if available, falls back to REST fetch for basic product data.
3. **Cart session on homepage**: Lazy creation via `POST /api/cart` endpoint. `CartContext` uses `localStorage` for session persistence. On first `addItem` when no session exists, creates a cart and stores the session ID.
