1) Protocol context (how they fit together)
A2A (Agent2Agent)

A2A is an agent-to-agent / client-to-agent interoperability protocol built on familiar web primitives (HTTP, JSON-RPC 2.0, SSE). It standardizes: capability discovery (AgentCard), task lifecycle, streaming, and artifact exchange so agents can collaborate without sharing internal state.

Key pieces you’ll use:

AgentCard discovery via a well-known endpoint (the spec documents a standardized .well-known/... location).

Task + contextId to keep a user shopping session coherent across turns and parallel subtasks.

SSE streaming for progressive results and status updates (message/stream, task status/artifact update events).

MCP (Model Context Protocol)

MCP is the “USB-C for AI tools/data”: a standard way for an AI host to connect to external systems (tools, resources, prompts) using JSON-RPC 2.0 with multiple transports (stdio for local, Streamable HTTP / SSE for remote).
For your use case, MCP is ideal to expose:

product catalog search

pricing / availability

reviews

affiliate links / checkout initiation

A2UI (Agent-to-UI)

A2UI defines a server→client JSONL stream (commonly over SSE) that describes UI structure (components/surfaces) separately from state (data model). Updates happen via dataModelUpdate and dynamic list rendering via template.
User interactions are sent back to the server as A2A messages (client→server userAction).

The trio together

A2UI: how your React widget renders and live-updates a product list.

A2A: how the UI sends user actions back, and how your recommender delegates to other agents/services (optionally).

MCP: how the recommender gets grounded product data and executes “real” actions.

2) Target architecture for a product-recommendation agent with an A2UI React widget
High-level components

A2UI React Client (Widget)

Connects to GET /ui/stream (SSE JSONL) to receive surfaceUpdate + dataModelUpdate.

Renders a “Product Recommendations” surface:

search input / constraints

product list (dynamic template bound to /products)

sort + filters

product detail drawer

Sends user events to POST /ui/event as A2UI userAction payload (which your backend wraps/handles as A2A-compatible event flow).

Recommender Orchestrator (Backend)

Owns session state keyed by (contextId, surfaceId) and streams UI deltas.

Runs the shopping intent pipeline:

intent extraction → retrieval → ranking → explanation → UI updates

Optionally splits into sub-agents (A2A) for specialized tasks: “spec extractor”, “review analyst”, “price hunter”.

MCP Tooling Layer

One or more MCP servers for:

search_products(query, constraints)

get_product(productId)

get_prices(productId, geo)

get_reviews(productId)

Deployed as remote Streamable HTTP transport for multi-user scale.

(Optional) Embedding targets

Web app: embed the React widget directly.

MCP Apps hosts: your UI can be served as a UI resource rendered in a sandboxed iframe per MCP Apps.

ChatGPT App: OpenAI Apps SDK runs your UI in an iframe inside ChatGPT; you can host your A2UI client inside that iframe and connect to the same backend.

3) Interaction flow (end-to-end)
A) Initial render

Widget loads → opens GET /ui/stream?session=...

Backend streams:

beginRendering

surfaceUpdate defining layout (search controls + list container)

initial dataModelUpdate with empty /products + default filters

endRendering
A2UI’s separation of structure vs state means you rarely need to resend component trees—most changes are state updates.

B) User enters a request (“noise-cancelling headphones under €200”)

UI sends userAction with context { query, budget, constraints } (A2UI event schema).

Orchestrator creates/continues an A2A contextId and starts a task.

Orchestrator calls MCP tools to retrieve candidates + enrich with price/reviews.

As results arrive:

stream dataModelUpdate chunks updating /products list

update /status (“Searching…”, “Found 83”, “Ranking…”)
A2A supports SSE streaming semantics for long tasks; you can mirror that “progressiveness” into A2UI state updates.

C) User clicks a product / changes a filter

UI sends userAction with productId / filterDelta

Backend either:

re-ranks locally (cheap/fast) → dataModelUpdate

or triggers a new retrieval task (slower) → progressive dataModelUpdate

4) Technical strategy (key design choices)
4.1 Data model (A2UI state)

Keep the UI state minimal and server-driven:

/query: string

/constraints: { budget, brand, mustHave, exclude, shippingRegion… }

/products: array of

id, title, imageUrl, price, merchant, rating, highlights[], reasonWhy[], buyUrl

/ui: { selectedProductId, sortMode, activeFilters… }

/status: { phase, message, progress? }

Use A2UI template for list rendering bound to /products so the list auto-renders as you mutate state.

4.2 Recommendation pipeline

Intent extraction (structured)

Parse query into constraints + product category taxonomy.

If critical ambiguity: update /status and render a clarification UI (chips / follow-up form).

Retrieval (grounded)

Call MCP search_products with normalized query/constraints.

Enrich top-N with price/availability and reviews (parallel MCP calls).

Ranking

Hard filters first (budget, availability, region).

Score: relevance + quality + price-value + user prefs.

Provide “why recommended” strings (don’t invent facts; tie to tool outputs).

UI shaping

Send incremental dataModelUpdate while retrieval and scoring run.

Only send surfaceUpdate when layout changes (e.g., switching to comparison mode).

4.3 Protocol boundaries

A2UI stream endpoint is “UI protocol” (JSONL over SSE).

A2A endpoints exist for:

receiving userAction (your UI event handler)

optional agent-to-agent delegation (future-proofing)

MCP servers are purely tool/data providers (no UI responsibility).

4.4 Embedding strategy

Primary: ship a standalone React widget that implements the A2UI interpreter.

Secondary:

MCP Apps: expose the same widget bundle as a UI resource for MCP hosts.

ChatGPT Apps: host the widget in the Apps SDK iframe and connect to your backend (Apps SDK is explicitly iframe-based).

5) Detailed implementation plan (testable milestones)
Step 1 — Define contracts (schemas + capabilities)

Deliverables

A2UI surface + data model schema (TypeScript types + JSON schema validation)

A2A AgentCard for your recommender service (capabilities: streaming true, etc.)

MCP tool schemas for product operations

Tests

Contract tests validating:

A2UI messages match spec-required fields (dataModelUpdate, userAction)

AgentCard served from the well-known route and parses correctly

MCP tool input/output JSON schemas validate

Step 2 — Build the A2UI React “interpreter” MVP (static)

Deliverables

React component registry for A2UI standard components you need (Text, Row/Column, Image, Button, List container)

SSE JSONL parser + dispatcher

Local “demo server” streaming a fixed UI + state

Tests

Unit: JSONL parsing, message dispatch routing

Snapshot: rendering output for a fixed stream

E2E (Playwright): page loads and renders the surface

Step 3 — Add dynamic list rendering (template) + state updates

Deliverables

Implement dynamic list rendering bound to /products with A2UI template

Implement dataModelUpdate application logic

Tests

Unit: apply dataModelUpdate to store (including nested maps/paths)

E2E: server pushes 1→N products; UI list grows without re-sending the surface

Step 4 — Implement client→server events (userAction)

Deliverables

UI actions wired with context bindings (e.g., {productId, query})

POST /ui/event endpoint handling A2UI userAction payloads

Tests

Unit: context resolution (bound values → concrete payload)

Integration: clicking a button triggers server receipt and an echoed dataModelUpdate (“selectedProductId”)

Step 5 — Orchestrator skeleton (no real products yet)

Deliverables

Session store keyed by (contextId, surfaceId)

Minimal “recommender” that returns mocked products and updates /products

Tests

Integration: send userAction(query=...) → observe SSE stream updates within 500ms

Load: 50 concurrent sessions updating without cross-talk

Step 6 — Stand up MCP “Product Catalog” server (mock DB)

Deliverables

MCP server exposing:

search_products

get_product

get_prices

get_reviews

Choose Streamable HTTP transport for multi-user hosting

Tests

Contract: each tool validates input/output schema

Integration: orchestrator calls tools and gets deterministic results

Replay tests: fixed queries → stable outputs

Step 7 — Implement real retrieval + enrichment

Deliverables

Orchestrator calls MCP tools in parallel

Normalization layer (currency, locale, dedupe merchants)

Incremental UI updates: push partial results (top 3 first, then fill to top 10)

Tests

Integration: partial updates arrive in order; UI never breaks when fields are missing

Property-based: random product sets don’t crash ranking/UI

Step 8 — Ranking + explanations (grounding rules)

Deliverables

Scoring function + tie-breakers

“Reason why” strings derived from tool outputs (avoid hallucinated specs)

Optional comparison mode surface (swap layout with surfaceUpdate only when needed)

Tests

Unit: ranking invariants (budget hard constraint, stable sort)

Golden tests: known queries → expected top results ordering

Safety: explanation generator must reference only retrieved attributes

Step 9 — Streaming/long-running task UX

Deliverables

A2A-style task phases mapped into UI /status (“working”, “input-required”, “completed”)

Retry/resubscribe strategy for SSE disconnects (client reconnect → rehydrate latest model snapshot)

Tests

Chaos: drop SSE connection mid-stream; reconnect; UI recovers to latest state

Integration: simulated slow MCP tool → progressive status updates