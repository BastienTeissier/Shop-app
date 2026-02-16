# Implementation Plan: Product Recommendation Agent with A2UI

## 1. Feature Description

**Objective**: Build an AI-powered product recommendation agent using A2UI protocol for server-driven UI rendering, enabling natural language product discovery with real-time streaming updates.

**Key Capabilities**:
- **CAN** accept natural language queries ("ski gear for beginners under $200")
- **CAN** stream incremental results as the agent processes
- **CAN** display product recommendations with "why recommended" explanations
- **CAN** integrate with existing cart functionality
- **CANNOT** replace existing ecom-carousel widget (additive feature)
- **CANNOT** require database schema changes in Phase 1-2

**Business Rules**:
- Recommendations must be grounded in actual product data (no hallucinated specs)
- Price explanations must use stored price (cents) formatted correctly
- Session state persists across conversation turns

**Complexity**: High (streaming, LLM orchestration, new protocol, 15+ files)

---

## 2. Architecture

### Integration Strategy: A2UI as Parallel Service

```
[ChatGPT] --> [Skybridge Widget: product-recommendations]
                    |
                    +--> GET /api/a2ui/stream (SSE) --> [Recommendation Orchestrator]
                    |                                          |
                    +--> POST /api/a2ui/event <-----------------+
                                                               |
                                              [OpenAI Agents SDK + existing db/*]
```

**Rationale**: Build A2UI as separate SSE-based service alongside existing Skybridge widgets. Reuses existing `db/products.ts` and `db/cart.ts` query functions.

---

### Files to Modify/Create:

#### Phase 1: A2UI Protocol Foundation

##### A. `shared/a2ui-types.ts` (NEW)
**Purpose**: Define A2UI protocol types

**Changes**:
- A2UIMessage union type (beginRendering, surfaceUpdate, dataModelUpdate, endRendering)
- A2UIComponent types (Text, List, Button, Row, Column, Image)
- RecommendationDataModel type (query, products, status, ui state)
- RecommendationProduct type (id, title, price, highlights, reasonWhy)
- UserAction types for events

**Why**: Type safety for A2UI protocol implementation

---

##### B. `server/src/a2ui/stream.ts` (NEW)
**Purpose**: SSE streaming endpoint for A2UI messages

**Changes**:
- `a2uiStreamHandler(req, res)` - SSE endpoint
- Session store (Map<sessionId, { dataModel, clients }>)
- `sendMessage()`, `broadcastToSession()` helpers
- Initial render sequence (beginRendering -> surface -> data -> endRendering)
- Client disconnect cleanup

**Why**: Core A2UI transport layer

---

##### C. `server/src/a2ui/event.ts` (NEW)
**Purpose**: Handle user actions from widget

**Changes**:
- `a2uiEventHandler(req, res)` - POST endpoint
- Action routing (search, selectProduct, addToCart)
- Session validation

**Why**: Bidirectional communication for user interactions

---

##### D. `server/src/a2ui/session.ts` (NEW)
**Purpose**: Session state management

**Changes**:
- `getSession(sessionId)`, `createSession(sessionId)`
- `updateDataModel(sessionId, path, value)`
- `broadcastDataModelUpdate(session, path, value)`
- Initial data model factory

**Why**: Centralized session state for multi-client support

---

##### E. `server/src/a2ui/surface.ts` (NEW)
**Purpose**: A2UI surface definitions

**Changes**:
- `getRecommendationSurface()` - returns component tree
- Search input, status display, product list template, cart indicator

**Why**: Declarative UI structure separate from data

---

##### F. `server/src/a2ui/index.ts` (NEW)
**Purpose**: Barrel export

---

##### G. `server/src/index.ts` (MODIFY)
**Purpose**: Register A2UI routes

**Changes**:
- Add `/api/a2ui/stream` GET route
- Add `/api/a2ui/event` POST route with JSON body parser

**Why**: Expose A2UI endpoints alongside existing `/mcp`

---

##### H. `server/src/tools/product-recommendations.ts` (NEW)
**Purpose**: Skybridge widget handler (entry point)

**Changes**:
- `productRecommendationsOptions` - widget metadata with CSP for SSE
- `productRecommendationsToolOptions` - input schema (optional query)
- `productRecommendationsHandler` - returns sessionId for widget

**Pattern**: Follow `ecom-carousel.ts` structure

**Why**: Register widget in Skybridge for ChatGPT invocation

---

##### I. `server/src/server.ts` (MODIFY)
**Purpose**: Register new widget

**Changes**:
- Import product-recommendations handler
- Add `.registerWidget('product-recommendations', ...)` call

---

##### J. `web/src/components/a2ui/A2UIRenderer.tsx` (NEW)
**Purpose**: Core A2UI interpreter

**Changes**:
- SSE connection via EventSource
- Message parser and dispatcher
- Data model state management
- Component registry lookup and rendering
- Path resolution for data bindings

**Why**: Interprets A2UI messages into React components

---

##### K. `web/src/components/a2ui/registry.ts` (NEW)
**Purpose**: Component registry mapping

**Changes**:
- Map of component type -> React component
- Standard components: Text, List, Button, Row, Column, Image
- Custom components: ProductCard, SearchInput, StatusBanner

---

##### L. `web/src/components/a2ui/TextRenderer.tsx` (NEW)
**Purpose**: Render Text components with data binding

---

##### M. `web/src/components/a2ui/ListRenderer.tsx` (NEW)
**Purpose**: Render dynamic lists with templates

**Changes**:
- Resolve binding path to array
- Map items through template components
- Handle empty state

---

##### N. `web/src/components/a2ui/ButtonRenderer.tsx` (NEW)
**Purpose**: Render buttons with action handlers

**Changes**:
- onClick -> POST to /api/a2ui/event
- Support disabled state, loading state

---

##### O. `web/src/components/a2ui/ProductCard.tsx` (NEW)
**Purpose**: Product card for recommendations

**Changes**:
- Image, title, price display
- Highlights/reasonWhy badges
- Add to cart button
- Follow styling from existing ecom-carousel

**Pattern**: Reuse formatPrice, CSS classes from `ecom-carousel.tsx`

---

##### P. `web/src/components/product-recommendations.tsx` (NEW)
**Purpose**: Main recommendation widget component

**Changes**:
- Initialize A2UIRenderer with session
- Handle Skybridge hooks (useToolInfo, useLayout, useUser)
- Theme and locale awareness

---

##### Q. `web/src/widgets/product-recommendations.tsx` (NEW)
**Purpose**: Widget entry point

**Changes**:
- `mountWidget(<ProductRecommendations />)`

**Pattern**: Follow `ecom-carousel.tsx` widget pattern

---

#### Phase 2: Dynamic Data Binding

##### R. `server/src/a2ui/handlers/search.ts` (NEW)
**Purpose**: Search handler using existing DB

**Changes**:
- `handleSearch(sessionId, query)`
- Call `productList(query, limit)` from `db/products.ts`
- Transform Product -> RecommendationProduct
- Broadcast status + products updates

**Reuse**: `productList` from `server/src/db/products.ts`

---

##### S. `server/src/a2ui/handlers/cart.ts` (NEW)
**Purpose**: Cart integration

**Changes**:
- `handleAddToCart(sessionId, productId)`
- Call existing `cartAddItem`, `cartCreate`, `cartGetBySessionId`
- Broadcast cart state update

**Reuse**: Cart functions from `server/src/db/cart.ts`

---

##### T. `server/src/a2ui/handlers/index.ts` (NEW)
**Purpose**: Barrel export for handlers

---

#### Phase 3: LLM-Powered Recommendations

##### U. `package.json` (MODIFY)
**Purpose**: Add OpenAI Agents SDK and AI SDK

**Changes**:
- Add `"@openai/agents": "^0.1.0"` to dependencies
- Add `"ai": "^4.0.0"` (Vercel AI SDK) for provider abstraction
- Add `"@ai-sdk/openai": "^1.0.0"` for OpenAI provider
- Add `"@ai-sdk/google": "^1.0.0"` for Gemini provider

**Decision**: Per ADR-001, use OpenAI Agents SDK as primary. Support configurable LLM providers via environment variable (RECOMMENDATION_LLM_PROVIDER=openai|gemini)

---

##### V. `server/src/agent/recommendation-agent.ts` (NEW)
**Purpose**: Main recommendation agent

**Changes**:
- Agent definition with system prompt
- Tool definitions (search_products, rank_products)
- Streaming run support
- Connect tools to existing db functions
- LLM provider selection via `createLLMProvider()` helper

---

##### V2. `server/src/agent/llm-provider.ts` (NEW)
**Purpose**: Configurable LLM provider factory

**Changes**:
- `createLLMProvider()` - returns OpenAI or Gemini based on env var
- Read `RECOMMENDATION_LLM_PROVIDER` (default: "openai")
- Read `OPENAI_API_KEY` or `GOOGLE_AI_API_KEY` accordingly
- Unified interface for agent consumption

---

##### W. `server/src/agent/tools/search-products.ts` (NEW)
**Purpose**: Agent tool for product search

**Changes**:
- Zod schema for input (query, category, limit)
- Handler calls `productList`
- Returns product array

---

##### X. `server/src/agent/tools/rank-products.ts` (NEW)
**Purpose**: Agent tool for ranking/filtering

**Changes**:
- Zod schema (products, criteria: budget, preferences)
- Scoring function
- Returns ranked products with scores

---

##### Y. `server/src/agent/intent-extractor.ts` (NEW)
**Purpose**: Extract constraints from natural language

**Changes**:
- Lightweight agent with JSON output
- Extract: category, budget, brand, features
- Use gpt-4o-mini for speed

---

##### Z. `server/src/a2ui/handlers/recommend.ts` (NEW)
**Purpose**: Agent-integrated handler

**Changes**:
- `handleRecommend(sessionId, query)`
- Run agent with streaming
- Emit progressive dataModelUpdates
- Generate reasonWhy from agent output

---

#### Phase 4: Full A2A Support (Future)

##### AA. `server/src/a2a/agent-card.ts` (NEW)
**Purpose**: AgentCard discovery endpoint

**Changes**:
- `agentCardHandler` for `/.well-known/agent-card`
- Return capabilities, endpoints, version

---

##### AB. `prisma/schema.prisma` (MODIFY - Future)
**Purpose**: Extended schema for recommendations

**Changes**:
- Add `category`, `tags` to Product model
- Add UserPreference model
- Add RecommendationHistory model

---

## 3. Test List

### Test File: `server/tests/a2ui-stream.integration.test.ts` (NEW)

1. **`test_sse_connection_sends_initial_render`**
   - Connect to /api/a2ui/stream
   - Verify receives: beginRendering, surfaceUpdate, dataModelUpdate, endRendering

2. **`test_session_isolation`**
   - Connect two clients with different sessions
   - Verify updates don't cross sessions

3. **`test_client_disconnect_cleanup`**
   - Connect, then disconnect
   - Verify session cleaned up when no clients remain

### Test File: `server/tests/a2ui-event.integration.test.ts` (NEW)

4. **`test_search_action_updates_products`**
   - POST search action
   - Verify connected SSE client receives product update

5. **`test_add_to_cart_action`**
   - POST addToCart action
   - Verify cart state broadcast

6. **`test_invalid_session_returns_error`**
   - POST with invalid sessionId
   - Verify 400 response

### Test File: `web/src/components/a2ui/A2UIRenderer.test.tsx` (NEW)

7. **`test_renders_surface_from_messages`**
   - Feed static A2UI messages
   - Verify components render

8. **`test_data_binding_resolution`**
   - Provide data model and binding paths
   - Verify correct values displayed

9. **`test_list_template_rendering`**
   - Provide products array
   - Verify ProductCard rendered for each

10. **`test_button_action_posts_event`**
    - Click button
    - Verify POST to /api/a2ui/event

### Test File: `server/tests/recommendation-agent.integration.test.ts` (NEW - Phase 3)

11. **`test_agent_search_tool_returns_products`**
    - Call search_products tool
    - Verify returns database products

12. **`test_agent_streaming_emits_updates`**
    - Run agent with streaming
    - Verify progressive updates received

---

## 4. To Do List

### Phase 1: A2UI Foundation (MVP)

- [ ] **Define A2UI types**
  - File: `shared/a2ui-types.ts`
  - Create A2UIMessage, A2UIComponent, RecommendationDataModel types

- [ ] **Create SSE stream endpoint**
  - File: `server/src/a2ui/stream.ts`
  - Implement session store, SSE handler, broadcast helpers

- [ ] **Create event handler endpoint**
  - File: `server/src/a2ui/event.ts`
  - Implement action routing (search, addToCart)

- [ ] **Create session management**
  - File: `server/src/a2ui/session.ts`
  - Implement getSession, createSession, updateDataModel

- [ ] **Create surface definitions**
  - File: `server/src/a2ui/surface.ts`
  - Define recommendation UI structure

- [ ] **Register A2UI routes**
  - File: `server/src/index.ts`
  - Add /api/a2ui/stream and /api/a2ui/event routes

- [ ] **Create Skybridge widget handler**
  - File: `server/src/tools/product-recommendations.ts`
  - Follow ecom-carousel pattern

- [ ] **Register widget in server**
  - File: `server/src/server.ts`
  - Add registerWidget call

- [ ] **Create A2UI renderer component**
  - File: `web/src/components/a2ui/A2UIRenderer.tsx`
  - SSE connection, message parsing, component rendering

- [ ] **Create component registry**
  - File: `web/src/components/a2ui/registry.ts`
  - Map component types to React components

- [ ] **Create base A2UI components**
  - Files: `TextRenderer.tsx`, `ListRenderer.tsx`, `ButtonRenderer.tsx`
  - Standard A2UI component implementations

- [ ] **Create ProductCard component**
  - File: `web/src/components/a2ui/ProductCard.tsx`
  - Reuse styling from ecom-carousel

- [ ] **Create main widget component**
  - File: `web/src/components/product-recommendations.tsx`
  - Integrate A2UIRenderer with Skybridge hooks

- [ ] **Create widget entry point**
  - File: `web/src/widgets/product-recommendations.tsx`
  - mountWidget call

- [ ] **Write Phase 1 tests**
  - Files: `a2ui-stream.integration.test.ts`, `A2UIRenderer.test.tsx`

### Phase 2: Dynamic Data Binding

- [ ] **Create search handler**
  - File: `server/src/a2ui/handlers/search.ts`
  - Integrate with existing productList

- [ ] **Create cart handler**
  - File: `server/src/a2ui/handlers/cart.ts`
  - Integrate with existing cart functions

- [ ] **Write Phase 2 tests**
  - File: `a2ui-event.integration.test.ts`

### Phase 3: LLM-Powered Recommendations

- [ ] **Install LLM dependencies**
  - File: `package.json`
  - Add @openai/agents, ai, @ai-sdk/openai, @ai-sdk/google

- [ ] **Create LLM provider factory**
  - File: `server/src/agent/llm-provider.ts`
  - Support OpenAI and Gemini via env var

- [ ] **Create recommendation agent**
  - File: `server/src/agent/recommendation-agent.ts`
  - Define agent with tools

- [ ] **Create agent tools**
  - Files: `search-products.ts`, `rank-products.ts`
  - Connect to DB functions

- [ ] **Create intent extractor**
  - File: `server/src/agent/intent-extractor.ts`
  - Extract constraints from queries

- [ ] **Create recommend handler**
  - File: `server/src/a2ui/handlers/recommend.ts`
  - Run agent with streaming

- [ ] **Write Phase 3 tests**
  - File: `recommendation-agent.integration.test.ts`

### Verification

- [ ] **Manual E2E test**
  - Start dev server: `pnpm dev`
  - Open ChatGPT, invoke product-recommendations widget
  - Verify SSE connection, search, cart integration

---

## 5. Context: Current System Architecture

### Skybridge/MCP Integration
- Widgets registered via `server.ts` using `registerWidget()`
- Each widget: options + toolOptions + handler
- Frontend widgets mounted via `mountWidget()` from `skybridge/web`
- Communication via `/mcp` endpoint (request-response)

### Database Layer
- Prisma ORM with SQLite (dev)
- Product model: id, title, description, imageUrl, price (cents)
- Cart/CartItem models with session-based anonymous carts
- Query functions: `productList()`, `cartAddItem()`, `cartGetBySessionId()`

### Frontend Patterns
- React 19 + Vite
- Skybridge hooks: useToolInfo, useLayout, useUser, useWidgetState
- Optimistic updates with rollback
- i18n via translations object
- Theme awareness (light/dark)

### Key Files
| File | Purpose |
|------|---------|
| `server/src/server.ts` | Widget registration |
| `server/src/tools/ecom-carousel.ts` | Widget handler pattern |
| `server/src/db/products.ts` | Product queries |
| `server/src/db/cart.ts` | Cart operations |
| `web/src/components/ecom-carousel.tsx` | Component pattern |
| `shared/types.ts` | Domain types |

---

## 6. Reference Implementations

### Widget Handler Pattern
- `server/src/tools/ecom-carousel.ts:1-30` - Options, toolOptions, handler structure

### Component Pattern
- `web/src/components/ecom-carousel.tsx:49-285` - Skybridge hooks usage, state management, i18n

### Database Query Pattern
- `server/src/db/products.ts:7-30` - productList with Prisma, safe input handling

### Test Pattern
- `server/tests/cart.integration.test.ts` - MCP tool integration tests with InMemoryTransport
- `web/src/components/ecom-carousel.test.tsx` - Component tests with mocked hooks

### A2UI Protocol Reference
- `docs/features/recommandation/initial.md` - Full A2UI specification and flow examples

### Agent Framework Decision
- `docs/adr/001-agent-framework.md` - OpenAI Agents SDK selection rationale

---

## Notes

- **SSE vs WebSocket**: SSE chosen for simplicity; sufficient for server->client streaming. Client->server uses POST.
- **Session Storage**: In-memory Map for MVP; consider Redis for production multi-instance.
- **Price Format**: All prices stored in cents; use `(price / 100).toFixed(2)` for display.
- **No Schema Changes Phase 1-2**: Reuse existing Product model; schema extensions in Phase 4.
- **LLM Provider**: Configurable via `RECOMMENDATION_LLM_PROVIDER` env var. Supports `openai` (default, GPT-4o) and `gemini` (Gemini 2.0 Flash). Requires corresponding API key env var.
