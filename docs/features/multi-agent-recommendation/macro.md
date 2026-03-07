Yes — **AI SDK + a “graph-ready” internal architecture** is a very strong learning path: you’ll ship the POC quickly, you’ll learn the fundamentals (streaming, tool-calling, schemas, cancellation), and you can later *lift* the same node functions into LangGraph with minimal rewrites.

Below is a **technical strategy** a coding agent can follow.

---

## 1) High-level approach

### Core idea

Build your system as **pure “nodes” + an explicit orchestrator**:

* **Nodes** are small functions with strict input/output types (formatter, recommender, refinement).
* The **orchestrator** composes nodes, owns timeouts/fallbacks, and emits SSE events.
* A **RunState** object is the single source of truth; it’s serializable (so it maps cleanly to LangGraph state later).

### Why AI SDK here

* **Abortable streaming** is first-class via `abortSignal`. ([AI SDK][1])
* **Schema-constrained outputs** for formatter/refinement via `output` + Zod/JSON schema. ([AI SDK][2])
* **Tool calling / multi-step control** is supported (you can cap steps). ([AI SDK][3])
* **OpenRouter provider** is available as an AI SDK community provider. ([AI SDK][4])

---

## 2) File / module layout (migration-friendly)

```
src/
  ai/
    models.ts                  // OpenRouter/Ollama model factories
    schemas/
      formattedQuery.schema.ts // Zod schemas
      suggestions.schema.ts
    agents/
      queryFormatter.ts        // node: raw -> formatted (no tools)
      recommendation.ts        // node: formatted -> stream products (+ summary)
      refinement.ts            // node: formatted + summary -> suggestions
    orchestrator/
      runSearchPipeline.ts     // composes nodes, owns fallback + timing + SSE events
      abortRegistry.ts         // per-session AbortController
      timeouts.ts              // helper: withTimeout(signal, ms)
      logging.ts               // structured per-run log record
  api/
    search/stream.ts           // SSE endpoint (or Next route handler)
  ui/
    HomePage.tsx               // renders chips under search bar
```

**Rule:** only `orchestrator/*` knows about SSE and “Searching…” UI status.
**Rule:** nodes are pure and return data (or streams), not UI events.

---

## 3) Define strict contracts (Zod schemas)

### 3.1 Formatted query contract

Used by Query Formatter and fed into Recommendation and Refinement.

```ts
// formattedQuery.schema.ts
export const FormattedQuerySchema = z.object({
  normalizedQuery: z.string(),
  inferredCategories: z.array(z.string()).default([]),
  constraints: z.object({
    gender: z.enum(["men", "women", "unisex"]).optional(),
    budgetMax: z.number().optional(),
    budgetMin: z.number().optional(),
    activity: z.string().optional(),
    size: z.string().optional(),
    season: z.string().optional(),
  }).passthrough(),
  formattedQueryForRecommender: z.string(),
});
export type FormattedQuery = z.infer<typeof FormattedQuerySchema>;
```

### 3.2 Suggestions contract (chips)

Hybrid: constrained vocab + 2–3 dynamic.

```ts
// suggestions.schema.ts
export const SuggestionsSchema = z.object({
  constrained: z.object({
    genders: z.array(z.enum(["Men","Women","Unisex"])).optional(),
    priceBuckets: z.array(z.string()).optional(), // e.g. "Under $50"
    sizes: z.array(z.string()).optional(),        // e.g. "S","M","L"
  }).partial(),
  dynamic: z.array(z.object({
    label: z.string(),
    kind: z.enum(["material","activity","brand","color","season","feature","other"]).default("other"),
  })).max(3),
});
export type Suggestions = z.infer<typeof SuggestionsSchema>;
```

**AI SDK structured output:** use `generateText/streamText` with `output` to enforce these shapes. ([AI SDK][2])

---

## 4) Model/provider setup

### 4.1 OpenRouter

Use the AI SDK OpenRouter provider (community provider). ([AI SDK][4])

* `FAST_MODEL` for Query Formatter (latency cap 3s)
* `REASONING_OR_TOOL_MODEL` for Recommendation (tool calling)
* `CHEAP_MODEL` for Refinement (chips)

Keep this configurable via env.

---

## 5) Node implementations (agents)

### 5.1 Query Formatter node (no tools)

**Goal:** deterministic JSON output; 1 call; timeout + fallback handled by orchestrator.

Implementation pattern:

* `generateText({ model, messages, output: Output.object({ schema: FormattedQuerySchema }) })`
* Must accept `AbortSignal` (forwarded from orchestrator). AI SDK supports `abortSignal`. ([AI SDK][1])

### 5.2 Recommendation node (streaming + tools)

**Goal:** stream products via SSE as they arrive, and accumulate a summary for refinement.

Implementation pattern:

* `streamText({ model, messages, tools, stopWhen: stepCountIs(N), abortSignal })`
* Use `stopWhen: stepCountIs(2)` (or similar) to **cap tool loops**. ([AI SDK][5])

  * Important: tool-calling can trigger multiple “steps” (i.e., multiple model generations). The `stepCountIs` cap is your main control knob.

Also: collect `productSummary` as you stream:

* `titles[]`, `tiers[]`, `prices[]`, `subcategories[]`, maybe `brands[]`.

### 5.3 Refinement node (async, no tools)

**Goal:** produce `SuggestionsSchema` based on *formatted query + actual results summary*.

Implementation pattern:

* `generateText({ model, messages, output: Output.object({ schema: SuggestionsSchema }), abortSignal })`
* No UI blocking; orchestrator fires it after products are broadcast.

---

## 6) Orchestrator design (the heart of the PRD)

### 6.1 RunState (graph-ready)

Make state serializable and explicit:

```ts
type RunState = {
  runId: string;
  rawQuery: string;
  refinementContext?: RefinementContext;
  formattedQuery?: FormattedQuery;
  productsCount: number;
  productSummary?: ProductSummary;
  suggestions?: Suggestions;
  timings: {
    formatterMs?: number;
    recommenderMs?: number;
    refinementMs?: number;
  };
};
```

### 6.2 SSE event model

Every SSE event must carry `runId`, so the client can ignore stale events.

Events:

* `status`: `{ runId, status: "searching"|"done"|"error" }`
* `dataModelUpdate`: `{ runId, path: "products"|"suggestions", value: ... }`
* `error`: `{ runId, message }` (user-facing only for recommendation failure)

### 6.3 Abort + timeouts

* Maintain a per-session/current-search **AbortController** in `abortRegistry`.
* New search:

  1. abort previous
  2. create new controller
  3. clear chips immediately (SSE suggestions = [])

AI SDK supports passing `abortSignal` to stop streams/model calls. ([AI SDK][1])

Timeout strategy:

* Each node gets **hard timeout 5s** via a derived AbortController.
* Query Formatter additionally has a **soft deadline 3s**: if exceeded, treat as failed and fallback to raw query.

### 6.4 Control flow (exact PRD behavior)

1. Emit `status=searching` once (no internal stage exposure).
2. Try Query Formatter:

   * success within 3s → use formatted
   * else → fallback formattedQueryForRecommender = rawQuery
3. Run Recommendation node:

   * stream products via SSE as they arrive
   * on failure → emit user-visible error message (same as today)
4. After products are done (or after you have enough summary), fire Refinement node **async**:

   * on success → SSE `suggestions`
   * on failure/timeout → do nothing
5. Emit `status=done`

Logging:

* Emit one structured log object at end (or incremental), including per-agent durations and chip labels.

---

## 7) UI integration notes (HomePage)

* Chips live under search bar (HomePage owns rendering).
* On new search start:

  * clear chips immediately
  * show Searching…
* When `suggestions` arrives:

  * render with fade-in CSS transition
* On chip click:

  * build `RefinementContext` (your existing pattern) and rerun pipeline
  * update search bar text for display (but orchestrator uses context, not naive concatenation)

---

## 8) “Migration to LangGraph later” guardrails (do these now)

To make migration painless:

1. **Keep nodes pure**: `node(state, runtime) -> { stateDelta, events? }`
2. **Single state object**: `RunState` is the payload LangGraph would checkpoint.
3. **All side effects in orchestrator**: SSE emission, abort registry, request parsing.
4. **Serializable summaries**: product summaries must be JSON-safe.
5. **Deterministic schemas**: formatter/refinement outputs always validated.

When you migrate:

* Each node becomes a LangGraph node operating on the same `RunState`.
* Your current orchestrator becomes a thin wrapper that “runs the graph” instead of calling nodes directly.

---

## 9) Implementation checklist (for a coding agent)

1. Add OpenRouter provider + env vars; implement `models.ts`. ([AI SDK][4])
2. Create Zod schemas (`FormattedQuerySchema`, `SuggestionsSchema`).
3. Implement `withTimeout(parentSignal, ms)` helper.
4. Implement `abortRegistry` keyed by session/user (or connection id).
5. Implement `queryFormatter.ts` using AI SDK structured output. ([AI SDK][2])
6. Implement `recommendation.ts` streaming with tools + step cap via `stepCountIs`. ([AI SDK][5])
7. Implement `refinement.ts` (generate suggestions from formatted query + summary).
8. Implement `runSearchPipeline.ts` orchestrator with:

   * fallbacks, time budgets, logging
   * SSE event emission (status/products/suggestions)
9. Wire SSE endpoint (`/api/search/stream`) and client subscription.
10. HomePage renders chips from `suggestions` and clears them on new search.
11. Add tests:

* schema validation tests for formatter/refinement
* abort test: start run A, start run B, ensure A emits no further events

---

If you paste (or describe) your current `runRecommendationAgent()` signature + where SSE is implemented (Next route handler vs Express), I can translate this strategy into a concrete set of files + exact function signatures consistent with your repo conventions.

[1]: https://ai-sdk.dev/docs/advanced/stopping-streams?utm_source=chatgpt.com "Advanced: Stopping Streams - Vercel"
[2]: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data?utm_source=chatgpt.com "AI SDK Core: Generating Structured Data - Vercel"
[3]: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling?utm_source=chatgpt.com "AI SDK Core: Tool Calling"
[4]: https://ai-sdk.dev/providers/community-providers/openrouter?utm_source=chatgpt.com "Community Providers: OpenRouter - ai-sdk.dev"
[5]: https://ai-sdk.dev/docs/reference/ai-sdk-core/step-count-is?utm_source=chatgpt.com "AI SDK Core: stepCountIs"
