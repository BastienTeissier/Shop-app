# Implementation Plan: Storybook + Playwright Design Verification

## 1. Feature Description

**Objective**: Set up Storybook for isolated component rendering and a Playwright-based screenshot script so a coding agent can autonomously verify UI implementation without running the full app or needing authentication/navigation.

**Key Capabilities**:
- **CAN** render store components in isolation (CartPage, CheckoutPage, OrderConfirmationPage, CartIndicator) with mocked context
- **CAN** capture deterministic screenshots of any story via `node scripts/verify-design.mjs <story-id>`
- **CAN** list available stories via `--list` flag
- **CAN** capture responsive variants via `--viewports` flag
- **CANNOT** test web/ Skybridge widgets (out of scope — Skybridge hook mocking too complex for first iteration)
- **CANNOT** run visual regression in CI (deferred to future phase)

**Scope**: Store app (`store/src/`) components only. Storybook installed inside the `store/` workspace package (co-located with components and dependencies).

---

## 2. Architecture

### Challenge: Component Isolation

Store components (`CartPage`, `CheckoutPage`, `CartIndicator`) use `useCart()` hook internally — they don't accept cart data as props. `useCart()` depends on a private `CartContext` and `react-router-dom`'s `useSearchParams()`. Stories need:

1. A **mock CartContext provider** to inject arbitrary cart state
2. A **per-story MemoryRouter** decorator for routing hooks (`useSearchParams`, `useNavigate`, `useParams`, `Link`) — NOT a global MemoryRouter in preview, because `OrderConfirmationPage` needs `<Routes><Route path="/orders/:reference">` wrapping for `useParams()`, and nesting routers is invalid in react-router-dom v7
3. **CSS import** of `store/src/index.css`

`OrderConfirmationPage` calls `fetchOrder()` from `../api.ts` — this will be mocked via a Storybook `loader` or by module-level mock.

`CheckoutPage` imports `submitOrder` from `../api.ts` and uses `useNavigate()`. These are only called on form submission, so non-error stories render fine without mocking. The `SubmitError` story requires mocking `submitOrder` (see section F).

### Files to Create

#### A. `store/.storybook/main.ts`
**Purpose**: Storybook configuration

**Changes**:
- Framework: `@storybook/react-vite` (automatically picks up `store/vite.config.ts` including the `@shared` alias — no manual `viteFinal` override needed)
- Story globs: `["../src/**/*.stories.tsx"]`

---

#### B. `store/.storybook/preview.tsx`
**Purpose**: Global decorators + deterministic rendering

**Changes**:
- Import `../src/index.css` for store styles
- Disable CSS animations/transitions globally (inline `<style>` decorator)
- Export default `Preview` config
- **No global MemoryRouter** — each story provides its own router decorator to avoid nested router conflicts (see architecture challenge above)

---

#### C. `store/.storybook/mocks/CartContext.tsx`
**Purpose**: Reusable mock CartContext provider for stories

**Changes**:
- Export `MockCartProvider` component accepting `Partial<CartContextValue>` as props
- Provide sensible defaults (empty cart, no loading, no error, noop callbacks for `setQuantity`, `removeItem`, `addItem`, `clearError`, `clearCart`)
- Stories configure cart state via Storybook `decorators`

**Requires**: Export `CartContext` and `CartContextValue` type from `store/src/context/CartContext.tsx` (currently private)

---

#### D. `store/src/components/CartIndicator.stories.tsx`
**Purpose**: Stories for CartIndicator component

**Stories**:
- `WithItems` — 3 items, $59.97 subtotal
- `SingleItem` — 1 item (singular "item" text)
- `WithError` — error banner visible above indicator

---

#### E. `store/src/pages/CartPage.stories.tsx`
**Purpose**: Stories for CartPage component

**Stories**:
- `WithItems` — 2 products with quantities, subtotal, checkout link
- `Empty` — empty cart message
- `Loading` — loading spinner
- `NotFound` — "Cart not found" message
- `Error` — error state (no cart data)
- `ErrorWithCart` — error banner + cart items still visible

---

#### F. `store/src/pages/CheckoutPage.stories.tsx`
**Purpose**: Stories for CheckoutPage component

**Stories**:
- `Default` — order summary + empty form
- `Empty` — empty cart message
- `Loading` — loading spinner
- `SubmitError` — error banner + form (rendered via `initialError` prop, see section I2)

**Note**: `CheckoutPage` imports `submitOrder` from `../api.ts` and `useNavigate` from `react-router-dom`. These are only called on form submission, so `Default`/`Empty`/`Loading` stories render fine without mocking. The `SubmitError` story uses the new `initialError` prop to render the error state directly.

---

#### G. `store/src/pages/OrderConfirmationPage.stories.tsx`
**Purpose**: Stories for OrderConfirmationPage

**Stories**:
- `Default` — full order confirmation with items, customer info, total
- `Loading` — loading spinner
- `NotFound` — order not found message

**Note**: `fetchOrder()` from `../api.ts` must be mocked. Use Storybook `loaders` + module mock or inject order data via a wrapper component that bypasses the API call.

---

#### H. `store/scripts/verify-design.mjs`
**Purpose**: Playwright-based screenshot capture script

**Behavior**:
- `--list`: fetch `/stories.json` from Storybook, print all story IDs
- `<story-id>`: navigate to `/iframe.html?id=<story-id>&viewMode=story`, wait for render, screenshot to `screenshots/<story-id>--<viewport>.png`
- `--all`: capture all stories
- `--viewports mobile,tablet,desktop`: capture at multiple widths (375, 768, 1280)
- Defaults: single story, desktop viewport (1280x720)
- Uses Chromium only

---

### Files to Modify

#### I. `store/src/context/CartContext.tsx`
**Purpose**: Export `CartContext` for Storybook mocking

**Changes**:
- Add `export` to `const CartContext = createContext<CartContextValue | null>(null)` → `export const CartContext`
- Also export `CartContextValue` type

**Why**: Stories need to wrap components with a mock provider using the same context symbol that `useCart()` reads from.

---

#### I2. `store/src/pages/CheckoutPage.tsx`
**Purpose**: Add optional `initialError` prop for Storybook

**Changes**:
- Add optional `initialError?: string` prop to `CheckoutPage`
- Initialize `submitError` state with `initialError` value: `useState<string | null>(initialError ?? null)`
- No change to existing behavior when prop is omitted (defaults to `null`)

**Why**: `submitError` is local state only set when `submitOrder()` rejects. Without this prop, the `SubmitError` story cannot render the error state. This is a minimal, backwards-compatible change.

---

#### J. `store/package.json`
**Purpose**: Add Storybook + Playwright devDependencies and scripts

**Changes**:
- Add devDeps: `@storybook/react-vite`, `@storybook/react`, `storybook`, `@playwright/test`
- Add scripts: `storybook`, `storybook:build`, `verify:list`, `verify:story`, `verify:all`

---

#### J2. `package.json` (root)
**Purpose**: Add proxy scripts for convenience

**Changes**:
- Add scripts: `"storybook": "pnpm --filter store storybook"`, `"verify:list": "pnpm --filter store verify:list"`, `"verify:story": "pnpm --filter store verify:story"`, `"verify:all": "pnpm --filter store verify:all"`

---

#### K. `.gitignore`
**Purpose**: Exclude generated artifacts

**Changes**:
- Add `screenshots/`
- Add `storybook-static/`

---

## 3. Test List

No new automated tests for this feature. Storybook stories are the verification tool themselves. Validation is done visually by the agent via `verify-design.mjs` screenshots.

### Manual verification checklist (run once after implementation):

1. `pnpm storybook` starts without errors on port 6006
2. All stories render correctly in browser at `http://localhost:6006`
3. `node scripts/verify-design.mjs --list` outputs all story IDs
4. `node scripts/verify-design.mjs <story-id>` produces a PNG in `screenshots/`
5. `node scripts/verify-design.mjs --all` captures all stories
6. `node scripts/verify-design.mjs <story-id> --viewports mobile,desktop` produces two PNGs per story
7. Existing tests still pass: `pnpm test:store`, `pnpm test:unit`, `pnpm check`

---

## 4. To Do List

### Phase 1: Storybook Setup

- [ ] **Install Storybook + deps**
  - Run `npx storybook@latest init` inside `store/` directory (no `--type` flag — Storybook 8+ auto-detects React)
  - Ensure `@storybook/react-vite` is used as framework
  - Install deps: `cd store && pnpm add -D @storybook/react-vite @storybook/react storybook`
  - Remove auto-generated example stories in `store/src/stories/`

- [ ] **Configure `store/.storybook/main.ts`**
  - File: `store/.storybook/main.ts`
  - Set story globs to `["../src/**/*.stories.tsx"]`
  - Framework: `@storybook/react-vite` (automatically picks up `store/vite.config.ts` with `@shared` alias — no manual viteFinal override needed)

- [ ] **Configure `store/.storybook/preview.tsx`**
  - File: `store/.storybook/preview.tsx`
  - Import `../src/index.css`
  - Add animation-disabling `<style>` decorator
  - **No global MemoryRouter** — each story provides its own router decorator

- [ ] **Export CartContext**
  - File: `store/src/context/CartContext.tsx`
  - Export `CartContext` and `CartContextValue` type
  - Verify existing tests still pass (`pnpm test:store`)

- [ ] **Add `initialError` prop to CheckoutPage**
  - File: `store/src/pages/CheckoutPage.tsx`
  - Add optional `initialError?: string` prop
  - Initialize `submitError` with `initialError ?? null`
  - Verify existing tests still pass (`pnpm test:store`)

- [ ] **Create MockCartProvider**
  - File: `store/.storybook/mocks/CartContext.tsx`
  - Accept `Partial<CartContextValue>` props
  - Provide defaults: empty cart, loading=false, no error, noop callbacks (`setQuantity`, `removeItem`, `addItem`, `clearError`, `clearCart`)

### Phase 2: Write Stories

- [ ] **CartIndicator stories**
  - File: `store/src/components/CartIndicator.stories.tsx`
  - Stories: `WithItems`, `SingleItem`, `WithError`
  - Each story wraps in `<MemoryRouter>` + `<MockCartProvider>` decorator

- [ ] **CartPage stories**
  - File: `store/src/pages/CartPage.stories.tsx`
  - Stories: `WithItems`, `Empty`, `Loading`, `NotFound`, `Error`, `ErrorWithCart`
  - Each story wraps in `<MemoryRouter initialEntries={["/cart?session=test"]}>` + `<MockCartProvider>` decorator

- [ ] **CheckoutPage stories**
  - File: `store/src/pages/CheckoutPage.stories.tsx`
  - Stories: `Default`, `Empty`, `Loading`, `SubmitError`
  - `SubmitError` uses `<CheckoutPage initialError="Something went wrong. Please try again." />`
  - Each story wraps in `<MemoryRouter initialEntries={["/checkout?session=test"]}>` + `<MockCartProvider>` decorator

- [ ] **OrderConfirmationPage stories**
  - File: `store/src/pages/OrderConfirmationPage.stories.tsx`
  - Stories: `Default`, `Loading`, `NotFound`
  - Mock `fetchOrder()` via module mock or wrapper component
  - Each story wraps in `<MemoryRouter initialEntries={["/orders/test-ref"]}><Routes><Route path="/orders/:reference" ...>` (required for `useParams()`)

### Phase 3: Playwright Verification Script

- [ ] **Install Playwright**
  - `cd store && pnpm add -D @playwright/test`
  - `npx playwright install chromium`

- [ ] **Create verify-design.mjs**
  - File: `store/scripts/verify-design.mjs`
  - Implement `--list`, single story capture, `--all`, `--viewports` flags
  - Output to `store/screenshots/` directory
  - Default viewport: 1280x720 (desktop)

- [ ] **Add scripts to store/package.json**
  - File: `store/package.json`
  - `"storybook": "storybook dev -p 6006"`
  - `"storybook:build": "storybook build -o storybook-static"`
  - `"verify:list": "node scripts/verify-design.mjs --list"`
  - `"verify:story": "node scripts/verify-design.mjs"`
  - `"verify:all": "node scripts/verify-design.mjs --all"`

- [ ] **Add proxy scripts to root package.json**
  - File: `package.json`
  - `"storybook": "pnpm --filter store storybook"`
  - `"verify:list": "pnpm --filter store verify:list"`
  - `"verify:story": "pnpm --filter store verify:story"`
  - `"verify:all": "pnpm --filter store verify:all"`

- [ ] **Update .gitignore**
  - File: `.gitignore`
  - Add `screenshots/` and `storybook-static/`

### Phase 4: Agent Integration & Documentation

- [ ] **Update CLAUDE.md**
  - Add design verification workflow instructions
  - Document `verify:list`, `verify:story` commands
  - Add story ID format convention
  - Add `storybook` and `verify:*` to Commands table

- [ ] **Update docs/**
  - File: `docs/frontend.md` — add Storybook section (story conventions, file locations, how to write stories for store components)
  - File: `docs/testing.md` — add Design Verification section (verify-design.mjs usage, screenshot workflow)

- [ ] **End-to-end validation**
  - Start Storybook, run verify script, check screenshots
  - Run `pnpm check` to ensure no regressions

---

## 5. Context: Current System Architecture

### Store App (`store/`)
Standalone Vite + React storefront (separate pnpm workspace package). Uses `react-router-dom` for routing, plain CSS with custom properties for styling.

- **Components**: `CartIndicator` (sticky bar), `CartPage`, `CheckoutPage`, `OrderConfirmationPage`
- **State**: `CartContext` provides cart state via `useCart()` hook. Fetches from REST API, supports optimistic updates.
- **Styling**: Single `store/src/index.css` with CSS custom properties (`--bg`, `--text`, `--accent`). Dark mode via `prefers-color-scheme` media query.
- **Path alias**: `@shared/*` → `../shared/*` (configured in `store/tsconfig.json` + `store/vite.config.ts`)
- **Testing**: Vitest + happy-dom + Testing Library (`pnpm test:store`)

### Key Files
| File | Purpose |
|------|---------|
| `store/src/context/CartContext.tsx` | Cart state provider — `CartContext` is private, only `CartProvider` + `useCart` exported |
| `store/src/index.css` | All store styles (page layout, cart items, forms, indicators) |
| `store/vite.config.ts` | Vite config with `@shared` alias + vitest config |
| `store/tsconfig.json` | TS config with `@shared/*` path |
| `shared/types.ts` | `CartSummary`, `CartSummaryItem`, `OrderSummary`, etc. |
| `shared/format.ts` | `formatPrice()` used across all store components |

---

## 6. Reference Implementations

- **Existing test mocks for CartContext**: `store/src/context/CartContext.test.tsx` and `store/src/pages/CartPage.test.tsx` — these mock `useCart()` via `vi.mock()`. The Storybook approach differs (context provider wrapping instead of module mocking) but the mock data shapes are reusable.
- **Vitest happy-dom setup**: `store/src/test/setup.ts` — shows the test environment config pattern. Storybook uses its own rendering but the CSS import pattern is similar.
- **Path alias resolution**: `store/vite.config.ts:10-12` — `@shared` alias. Since Storybook is installed inside `store/`, `@storybook/react-vite` automatically picks up `store/vite.config.ts` and inherits the alias — no manual `viteFinal` override needed.

---

## Notes

- **OrderConfirmationPage** is the trickiest component to story-ify: it calls `fetchOrder()` in a `useEffect` and uses `useParams()`. Two options: (1) mock `../api.ts` module in Storybook config, or (2) create a thin wrapper component that accepts `order` as a prop and renders the same markup. Option 2 is simpler but requires a small refactor. Recommend option 1 first. Additionally, stories must use their own `<MemoryRouter><Routes><Route path="/orders/:reference">` wrapping (not a global router) so `useParams()` receives the route param.
- **CheckoutPage SubmitError**: The `submitError` state is local and only set when `submitOrder()` rejects. A new optional `initialError` prop is added to `CheckoutPage` so Storybook can render the error state directly. This is a minimal, backwards-compatible change.
- **All Storybook deps go in `store/package.json` devDependencies** — co-located with the store workspace package for clean pnpm resolution.
- **Dark mode stories**: since `store/src/index.css` uses `prefers-color-scheme`, Storybook's `@storybook/addon-themes` or a manual CSS class toggle could be added later for explicit dark mode stories. Not in scope for this plan.
