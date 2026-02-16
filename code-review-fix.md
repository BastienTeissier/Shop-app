# Code Review Fix Plan

Implementation plan to address all issues found in the `feat/product-recommendation` branch review.

---

## Phase 1: Critical Fixes (must fix before merge)

### 1. Replace hardcoded URLs with dynamic resolution

**Files:**
- `server/src/tools/product-recommendations.ts`
- `web/src/components/a2ui/A2UIRenderer.tsx`

**Problem:** Hardcoded `http://localhost:3000` URLs and a stale ngrok URL in CSP config will break in any non-local environment.

**Steps:**

1. In `product-recommendations.ts`:
   - Remove the stale ngrok URL `"https://5ccf-46-193-107-8.ngrok-free.app"` from `connectDomains`
   - Change `streamEndpoint` and `eventEndpoint` to relative paths: `"/api/a2ui/stream"` and `"/api/a2ui/event"`
   - Remove `http://localhost:3000` from `connectDomains` — the widget runs same-origin so CSP `connect-src 'self'` suffices. If cross-origin is needed, derive from an environment variable.

2. In `A2UIRenderer.tsx`:
   - Change default props from absolute localhost URLs to relative paths:
     ```typescript
     streamEndpoint = "/api/a2ui/stream",
     eventEndpoint = "/api/a2ui/event",
     ```
   - The `new URL(streamEndpoint, window.location.origin)` constructor on line 92 already handles relative-to-absolute resolution correctly.

**Verification:** `pnpm typecheck` passes. Widget connects successfully in dev with `pnpm dev`.

---

### 2. Delete dead code `handlers/search.ts`

**Files:**
- `server/src/a2ui/handlers/search.ts` — DELETE

**Problem:** `handleSearch` is defined but never imported. The `"search"` action in `event.ts` dispatches to `handleRecommend` instead.

**Steps:**

1. Delete `server/src/a2ui/handlers/search.ts`
2. Verify no imports reference it:
   - `handlers/index.ts` does NOT export from it (confirmed)
   - `event.ts` does NOT import from it (confirmed)
   - `a2ui/index.ts` does NOT re-export it (confirmed)

**Verification:** `pnpm typecheck` passes. `pnpm test:integration` passes.

---

### 3. Fix comment/code mismatch in OpenRouter provider

**Files:**
- `server/src/agent/openrouter-provider.ts`

**Problem:** Comment says "Gemini 2.0 Flash" but code uses `openai/gpt-4o-mini`.

**Steps:**

1. Update the JSDoc comment on `getRecommendationModel()` to accurately describe the model:
   ```typescript
   /**
    * Get the recommendation model via OpenRouter.
    * Using GPT-4o-mini through OpenRouter for good price/performance.
    */
   ```

**Verification:** Read the file and confirm comment matches code.

---

### 4. Add Zod validation to A2UI event endpoint

**Files:**
- `server/src/a2ui/event.ts`

**Problem:** `req.body` is cast with `as UserAction` with no validation. Payload fields are accessed with unsafe `as string` / `as number` casts.

**Steps:**

1. Define a Zod schema for the incoming action at the top of `event.ts`:
   ```typescript
   import { z } from "zod";

   const userActionSchema = z.object({
       sessionId: z.string().min(1),
       action: z.string().min(1),
       payload: z.record(z.unknown()).default({}),
   });
   ```

2. Replace the `as UserAction` cast with Zod parsing:
   ```typescript
   const parsed = userActionSchema.safeParse(req.body);
   if (!parsed.success) {
       res.status(400).json({ error: "Invalid request body" });
       return;
   }
   const action = parsed.data;
   ```

3. For each action case, validate the specific payload fields:
   - `"search"` / `"refine"`: validate `payload.query` is a string
   - `"selectProduct"` / `"addToCart"`: validate `payload.productId` is a number

   Use inline validation or per-action Zod schemas:
   ```typescript
   case "search": {
       const query = z.string().safeParse(action.payload.query);
       if (!query.success) {
           res.status(400).json({ error: "Missing or invalid query" });
           return;
       }
       await handleRecommend(action.sessionId, query.data);
       break;
   }
   ```

4. Remove the early manual check for `!action.sessionId || !action.action` (now handled by Zod).

**Verification:** `pnpm typecheck` passes. Existing integration tests still pass (they send valid payloads). Add a test for malformed payloads if time permits.

---

### 5. Fix duplicate `Product` type in `rank-products.ts`

**Files:**
- `server/src/agent/tools/rank-products.ts`

**Problem:** Defines a local `productSchema` + `type Product` that diverges from `shared/types.ts` (makes `imageUrl` optional, omits `category`).

**Steps:**

1. Keep the Zod `productSchema` for the tool's input validation (the AI SDK `tool()` requires a Zod schema for `inputSchema`), but align it with the canonical `Product` type:
   ```typescript
   const productSchema = z.object({
       id: z.number(),
       title: z.string(),
       description: z.string(),
       price: z.number().describe("Price in cents"),
       imageUrl: z.string(),
       category: z.string().nullable().optional(),
   });
   ```

2. Remove the local `type Product = z.infer<typeof productSchema>` line.

3. Import the canonical type for internal use:
   ```typescript
   import type { Product } from "@shared/types.js";
   ```

4. Use `z.infer<typeof productSchema>` only in the `execute` function parameter type, or use `Product` directly if the shapes now match.

**Verification:** `pnpm typecheck` passes.

---

### 6. Export and test the real `applyDiversityFilter`

**Files:**
- `server/src/a2ui/handlers/recommend.ts`
- `server/tests/recommendation-diversity.integration.test.ts`

**Problem:** The test re-implements the function locally instead of testing the real code. Changes to the real implementation would not be caught.

**Steps:**

1. In `recommend.ts`, export the `applyDiversityFilter` function:
   ```typescript
   export function applyDiversityFilter(
       products: RecommendationResult["products"],
   ): RecommendationResult["products"] { ... }
   ```

2. In `recommendation-diversity.integration.test.ts`:
   - Remove the local re-implementation (lines 25-44)
   - Import the real function:
     ```typescript
     import { applyDiversityFilter } from "../src/a2ui/handlers/recommend.js";
     ```
   - Update the `createProduct` factory to match the expected type (it should already be compatible)

3. Verify the `console.info` spy tests now actually test the real logging behavior.

**Verification:** `pnpm test:integration` passes. Tests now exercise the real production code.

---

### 7. Extract shared test utilities

**Files:**
- CREATE `server/tests/helpers/a2ui-mocks.ts`
- `server/tests/recommendation-agent.integration.test.ts`
- `server/tests/recommendation-tiered.integration.test.ts`
- `server/tests/a2ui-event.integration.test.ts`

**Problem:** ~300 lines of identical mock code (types, factories, type guards) copy-pasted across 3 test files.

**Steps:**

1. Create `server/tests/helpers/a2ui-mocks.ts` with:
   - `MockResponse` interface
   - `MockRequest` interface
   - `MockContext` interface
   - `createSSEMockContext(query?)` factory
   - `createEventMockContext(body)` factory
   - `isDataModelUpdate(msg)` type guard
   - `isSurfaceUpdate(msg)` type guard (used in `a2ui-stream` test)

2. In each of the 3 test files:
   - Remove the local definitions of all the above
   - Add: `import { createSSEMockContext, createEventMockContext, isDataModelUpdate } from "./helpers/a2ui-mocks.js";`
   - Keep test-specific setup (prisma seeding, mock agent setup) in each file

3. For `a2ui-stream.integration.test.ts`:
   - It uses a slightly different mock (`createMockContext` without status/json). Normalize it to use `createSSEMockContext` from the shared helper (the extra `status`/`json` fields are harmless).

**Verification:** All integration tests pass: `pnpm test:integration`.

---

### 8. Add missing `product-recommendations.test.tsx`

**Files:**
- CREATE `web/src/components/product-recommendations.test.tsx`

**Problem:** No component test for the main recommendation widget entry component.

**Steps:**

1. Create test file following the docs pattern (`vi.hoisted`, `vi.mock` for skybridge and helpers):
   ```typescript
   import { render, screen } from "@testing-library/react";
   import { beforeEach, describe, expect, it, vi } from "vitest";
   import { ProductRecommendations } from "./product-recommendations";

   const mocks = vi.hoisted(() => ({
       theme: "light",
       useToolInfo: vi.fn(),
   }));

   vi.mock("skybridge/web", () => ({
       useLayout: vi.fn(() => ({ theme: mocks.theme })),
   }));

   vi.mock("../helpers.js", () => ({
       useToolInfo: mocks.useToolInfo,
   }));

   // Mock A2UIRenderer to avoid SSE connection in tests
   vi.mock("./a2ui/index.js", () => ({
       A2UIRenderer: vi.fn(({ sessionId }: { sessionId: string }) => (
           <div data-testid="a2ui-renderer">Session: {sessionId}</div>
       )),
   }));
   ```

2. Test cases:
   - **Loading state**: `isPending: true` → shows "Loading recommendations..."
   - **Error state**: `output: undefined, isPending: false` → shows error message (no sessionId)
   - **Success state**: `output: { sessionId: "abc", ... }` → renders `A2UIRenderer` with correct props
   - **Dark theme**: Verify theme class is applied

**Verification:** `pnpm test:unit` passes.

---

### 9. Fix fire-and-forget async in `stream.ts`

**Files:**
- `server/src/a2ui/stream.ts`

**Problem:** The `void (async () => { ... })()` pattern swallows errors silently if the dynamic import or handler throws unexpectedly.

**Steps:**

1. Add a `.catch()` handler that broadcasts an error status:
   ```typescript
   void (async () => {
       const { handleRecommend } = await import("./handlers/recommend.js");
       await handleRecommend(sessionId, queryToUse);
   })().catch((error) => {
       console.error("Auto-search failed:", error);
       broadcastDataModelUpdate(sessionId, "/status", {
           phase: "error",
           message: "Failed to load recommendations. Please try again.",
       });
   });
   ```

2. Import `broadcastDataModelUpdate` from `./session.js` (already imported in the file scope? Check — no, `stream.ts` only imports `addClient`, `getOrCreateSession`, `removeClient`, `sendMessage`). Add it to the import.

3. Combine the two `req.on("close")` handlers into one:
   ```typescript
   req.on("close", () => {
       removeClient(sessionId, res);
       clearInterval(keepalive);
   });
   ```

4. Remove the unused `_sessionId` parameter from `sendInitialRender` (just use `sessionId` from closure or remove the parameter entirely).

**Verification:** `pnpm typecheck` passes. `pnpm test:integration` passes.

---

## Phase 2: Style & Consistency Fixes

### 10. Change `interface` to `type` in recommendation-agent.ts

**Files:**
- `server/src/agent/recommendation-agent.ts`

**Steps:**

1. Replace:
   ```typescript
   export interface RecommendationResult { ... }
   export interface RefinementContext { ... }
   ```
   With:
   ```typescript
   export type RecommendationResult = { ... };
   export type RefinementContext = { ... };
   ```

**Verification:** `pnpm typecheck` passes.

---

### 11. Normalize log levels in agent tools

**Files:**
- `server/src/agent/tools/search-products.ts`

**Steps:**

1. Change `console.log` on lines 46, 50, 54 to `console.info` to match the logging convention used in `recommend.ts` and other agent code.

**Verification:** Read the file and confirm consistency.

---

### 12. Fix import path for `Product` type in `search-products.ts`

**Files:**
- `server/src/agent/tools/search-products.ts`

**Steps:**

1. Change line 3:
   ```typescript
   // Before
   import type { Product } from "../../db/products.js";
   // After
   import type { Product } from "@shared/types.js";
   ```

2. Keep the function imports from `../../db/products.js` (only the type import changes).

**Verification:** `pnpm typecheck` passes.

---

## Phase 3: Architectural Improvements (recommended but lower priority)

### 13. Deduplicate `createInitialDataModel`

**Files:**
- `shared/a2ui-types.ts`
- `server/src/a2ui/session.ts`
- `web/src/components/a2ui/A2UIRenderer.tsx`

**Steps:**

1. Add the factory function to `shared/a2ui-types.ts`:
   ```typescript
   export function createInitialDataModel(): RecommendationDataModel {
       return {
           query: "",
           constraints: {},
           products: [],
           status: { phase: "idle", message: "Ready to search" },
           ui: { query: "" },
           cart: { items: [], totalQuantity: 0, totalPrice: 0 },
       };
   }
   ```

2. In `server/src/a2ui/session.ts`, replace the local function with:
   ```typescript
   import { createInitialDataModel } from "@shared/a2ui-types.js";
   ```

3. In `web/src/components/a2ui/A2UIRenderer.tsx`, replace the local function with:
   ```typescript
   import { createInitialDataModel } from "@shared/a2ui-types.js";
   ```
   Note: The web version has a slightly different initial message (`"Connecting..."` vs `"Ready to search"`). Either:
   - Use the shared function and override the message after creation, OR
   - Accept the shared default and remove the "Connecting..." text (the `connectionStatus` state already handles the connecting UI)

**Verification:** `pnpm typecheck` and `pnpm test:unit` pass.

---

### 14. Simplify redundant cart logic in `handlers/cart.ts`

**Files:**
- `server/src/a2ui/handlers/cart.ts`

**Steps:**

1. In `handleAddToCart`, simplify the double-creation fallback. After `cartCreate(cartSessionId)` succeeds, `cartGetBySessionId` will always return the cart. Remove the fallback path (lines 44-52).

2. Use the return value of `cartAddItem` directly instead of calling `cartGetSnapshot` separately:
   ```typescript
   // Before
   await cartAddItem(cart.id, productId);
   const snapshot = await cartGetSnapshot(cart.id);

   // After
   const snapshot = await cartAddItem(cart.id, productId);
   ```

**Verification:** `pnpm test:integration` — specifically the `test_add_to_cart_action` test.

---

### 15. Add session TTL cleanup

**Files:**
- `server/src/a2ui/session.ts`

**Steps:**

1. Add a periodic cleanup interval that removes sessions older than a threshold (e.g., 1 hour) with no active clients:
   ```typescript
   const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

   function cleanupStaleSessions(): void {
       const now = Date.now();
       for (const [sessionId, entry] of sessions) {
           if (entry.clients.size === 0) {
               const age = now - entry.session.createdAt.getTime();
               if (age > SESSION_TTL_MS) {
                   sessions.delete(sessionId);
               }
           }
       }
   }

   // Run cleanup every 10 minutes
   setInterval(cleanupStaleSessions, 10 * 60 * 1000);
   ```

2. Keep existing behavior: sessions with active clients are never cleaned up.

**Verification:** Manual testing or a unit test for `cleanupStaleSessions`.

---

### 16. Update CLAUDE.md folder structure

**Files:**
- `CLAUDE.md`

**Steps:**

1. Add `a2ui/` and `agent/` to the folder structure diagram under `server/src/`:
   ```
   server/
   ├── src/
   │   ├── a2ui/            # A2UI streaming protocol (SSE + event handlers)
   │   │   ├── event.ts     # POST endpoint for user actions
   │   │   ├── stream.ts    # SSE endpoint for real-time updates
   │   │   ├── session.ts   # In-memory session management
   │   │   ├── surface.ts   # UI component tree definition
   │   │   ├── handlers/    # Action handlers (cart, recommend)
   │   │   └── index.ts     # Barrel re-exports
   │   ├── agent/           # LLM recommendation agent
   │   │   ├── recommendation-agent.ts  # Agent orchestration
   │   │   ├── openrouter-provider.ts   # LLM provider config
   │   │   ├── tools/       # Agent tools (search, rank)
   │   │   └── index.ts     # Barrel re-exports
   ```

2. Add `shared/a2ui-types.ts` to the shared section with a note on its purpose.

3. Update the "Adding a New Tool/Widget" section if the A2UI pattern is a supported alternative to the MCP widget pattern.

**Verification:** Read the updated file for accuracy.

---

## Execution Order

| Priority | Task | Est. Complexity |
|----------|------|-----------------|
| 1 | #2 Delete dead `search.ts` | Trivial |
| 2 | #3 Fix comment mismatch | Trivial |
| 3 | #10 `interface` → `type` | Trivial |
| 4 | #11 Normalize log levels | Trivial |
| 5 | #12 Fix import path | Trivial |
| 6 | #1 Replace hardcoded URLs | Low |
| 7 | #5 Fix duplicate Product type | Low |
| 8 | #4 Add Zod validation to event endpoint | Medium |
| 9 | #9 Fix fire-and-forget + merge close handlers | Low |
| 10 | #6 Export + test real diversity filter | Low |
| 11 | #14 Simplify cart logic | Low |
| 12 | #7 Extract shared test utilities | Medium |
| 13 | #8 Add missing component test | Medium |
| 14 | #13 Deduplicate `createInitialDataModel` | Low |
| 15 | #15 Add session TTL cleanup | Medium |
| 16 | #16 Update CLAUDE.md | Low |

**Total: 16 tasks. Tasks 1-11 should be done in a single pass. Tasks 12-16 can be follow-up.**

---

## Verification Checklist

After each fixes:

- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm lint` — zero violations
- [ ] `pnpm test:unit` — all pass
- [ ] `pnpm test:integration` — all pass
- [ ] `pnpm build` — succeeds
- [ ] Manual: widget connects and streams recommendations in dev
