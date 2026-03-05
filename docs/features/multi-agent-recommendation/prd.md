# PRD: Multi-Agent Recommendation Pipeline

## Commitment

### Features

- **Orchestrator** coordinating a 3-agent pipeline for product search: Query Formatter → Recommendation Agent → Refinement Agent
- **Query Formatter Agent** that interprets and structures raw user queries into optimized prompts for the Recommendation Agent
- **Refinement Agent** running in background after products are delivered, producing hybrid suggestion chips (fixed categories + dynamic AI-generated)
- Inline suggestion chips below the search bar enabling one-click query refinement
- Single "Searching..." status throughout the pipeline (no internal stage exposure)

### Technical Details

- Replaces the current direct call to `runRecommendationAgent()` with an orchestrator function
- Query Formatter Agent is text-only (no database access) — uses LLM to normalize, infer categories, and structure the query
- Refinement Agent runs asynchronously after products are broadcast via SSE; receives the formatted query + a summary of the returned products (titles, tiers, prices, sub-categories) as input so that its suggestions reflect what was actually found
- Suggestion chips are delivered via the existing A2UI `dataModelUpdate` mechanism (new `suggestions` data path) and rendered by the **HomePage React component** (not the A2UI surface tree), since the search bar lives in `HomePage.tsx`
- Clicking a chip re-runs the full pipeline using the existing `RefinementContext` pattern (passing previous query + context), not naive string concatenation — the search bar text is updated for display purposes
- All agents use the existing OpenRouter/Ollama model provider
- Each agent call is wrapped with an `AbortController`; starting a new search aborts any in-flight LLM calls from the previous pipeline
- The existing `refineInput` component in the A2UI surface coexists with suggestion chips — chips offer one-click refinement while the text input allows free-form refinement (e.g., "exclude jackets", "show under $100")

### Non-Functional Requirements

- **Cost:** Each pipeline execution should not exceed 3 LLM calls total (1 formatter + 1 recommendation + 1 refinement); no retries within a single pipeline run
- **Latency & Timeouts:** Deferred — performance tuning (per-agent timeouts, latency budgets) will be addressed in a dedicated follow-up after the pipeline is functional

---

## Functional Specification

> **User Flow Slicing:** This feature is broken down into the following user flows.
> Each flow represents an independent, deliverable unit of functionality.

### User Flows

#### UF1: Formatted Recommendation Pipeline

**Context:** User types a search query on the storefront. The orchestrator replaces the current direct agent call with a two-step sequential pipeline: Query Formatter → Recommendation Agent.

**Justification for a separate Query Formatter:** The existing Recommendation Agent has tool-calling responsibilities (search, rank) that constrain its system prompt. A dedicated formatter agent, free of tool schemas, can focus entirely on NLU — expanding abbreviations, disambiguating intent, inferring implicit constraints (budget, gender, activity), and producing richer structured queries. This separation of concerns also enables independent prompt tuning and future model specialization.

AAU (anonymous), when I type a search query and click "Search", I see/can:

- A single "Searching..." status indicator (same as today)
- The orchestrator sends my raw query to the **Query Formatter Agent**, which:
  - Normalizes natural language (e.g., "I need a warm jacket for skiing" → structured query with inferred activity, product type, and attributes)
  - Infers relevant product categories from the user's intent
  - Produces a formatted query string optimized for the Recommendation Agent
- The orchestrator then passes the formatted query to the **Recommendation Agent** (existing), which:
  - Searches the product catalog using its existing tools (search, rank)
  - Returns tiered products (essential, recommended, optional) with highlights and reasonWhy
- Products are displayed in the tiered product grid as they arrive via SSE
- The entire pipeline is transparent to me — I only see "Searching..." then results

**Success scenario:**

- AAU, when I search for "warm jacket for skiing", I see more relevant results than a raw keyword search because the query was formatted and structured before reaching the recommendation engine
- AAU, when I search for "something for the beach", the formatter infers beach-related categories (swimwear, sunglasses, sandals) and the results cover the full range

**Error scenario:**

- AAU, if the Query Formatter fails (LLM error), the orchestrator falls back to passing my raw query directly to the Recommendation Agent (graceful degradation)
- AAU, if the Recommendation Agent fails, I see "Failed to get recommendations. Please try again." (same as current behavior)

**Edge cases:**

- AAU, if I submit a very short query (e.g., "shoes"), the formatter still structures it (infers footwear category) without adding assumptions the user didn't express
- AAU, if I submit a query that is already well-structured (e.g., "men's running shoes under $100"), the formatter passes it through with minimal changes

---

#### UF2: Background Refinement Suggestions

**Context:** After products are delivered to the UI, the Refinement Agent runs in the background and produces suggestion chips that appear below the search bar. The agent receives the formatted query and a summary of the returned products (titles, prices, tiers, sub-categories) as input, so that its suggestions reflect what was actually found.

AAU (anonymous), after I see product results from my search, I see/can:

- **Suggestion chips** appearing below the search bar (in the HomePage, not inside the A2UI surface) once the Refinement Agent completes (non-blocking — products are already visible)
- Chips are organized as **hybrid suggestions**:
  - **Constrained vocabulary** (the agent selects from a predefined set based on what exists in the returned products):
    - Gender: e.g., `Men`, `Women`, `Unisex` — only shown if the returned products span multiple genders
    - Price range: e.g., `Under $50`, `$50-$100`, `$100+` — brackets derived from actual price distribution of results
    - Size: e.g., `S`, `M`, `L`, `XL` — only shown if size is a meaningful differentiator for the product type
  - **Dynamic suggestions** (2-3 AI-generated based on query context and returned products):
    - Could be: material (`Waterproof`, `Fleece`), activity (`Trail running`, `Hiking`), brand, season (`Winter`, `Summer`), color, etc.
    - The Refinement Agent decides which dynamic suggestions are most useful given the specific query and what was returned
- Chips appear with a subtle transition (fade-in) so they don't disrupt the product browsing experience
- If the Refinement Agent is still processing, no placeholder or loading indicator is shown for chips — they simply appear when ready
- The existing `refineInput` text field (free-form refinement) remains available alongside chips — they serve complementary purposes

**Success scenario:**

- AAU, when I search for "jacket", I see products immediately, then chips like `Men`, `Women`, `Under $100`, `Waterproof`, `Ski` appear shortly after

**Error scenario:**

- AAU, if the Refinement Agent fails, no chips appear — the experience degrades gracefully to the current behavior (products only, no suggestions)

**Edge cases:**

- AAU, if I submit a new search before chips have appeared from the previous search, the pending chips are discarded and the new pipeline starts fresh
- AAU, if my query is already very specific (e.g., "men's waterproof hiking boots size 10 under $150"), the Refinement Agent may return few or no suggestions

---

#### UF3: Apply Refinement

**Context:** User sees suggestion chips below the search bar and clicks one to refine their search.

AAU (anonymous), when I click a suggestion chip, I see/can:

- The chip value is combined with the **current search bar text** (i.e., the query displayed at the time of click) using the existing `RefinementContext` mechanism — the orchestrator passes the current query, the chip value, and the previous product context to the pipeline
- The search bar text updates to reflect the combined query (e.g., "jacket" + chip "Men" → "jacket Men") for display purposes
- The **full pipeline re-runs**: Query Formatter → Recommendation Agent → products → Refinement Agent
- The "Searching..." status appears again while the pipeline processes
- Previous suggestion chips are removed immediately when the new search starts
- New products replace the current grid when results arrive
- New suggestion chips are generated by the Refinement Agent for the refined query (replacing the old ones)

**Definition:** "Current query" means the search bar text at the time the chip is clicked. Progressive refinement is cumulative: "jacket" → click "Men" → "jacket Men" → click "Waterproof" → "jacket Men Waterproof".

**Success scenario:**

- AAU, when I search "jacket" and click "Men", I see men's jackets with new suggestions like `Under $100`, `Waterproof`, `Ski`, `Casual`
- AAU, when I then click "Waterproof", I see men's waterproof jackets (query is now "jacket Men Waterproof") with further refined suggestions

**Error scenario:**

- AAU, if the re-run pipeline fails, I see the same error handling as UF1 (fallback for formatter, error message for recommendation failure)

**Edge cases:**

- AAU, if I click a chip while a previous search is still processing, the previous pipeline is aborted (via AbortController) and the new one takes priority
- AAU, if I manually edit the search bar text after chips have appeared, submitting the edited text runs as a fresh search (not a chip-appended refinement) — this resets the refinement context

---

### Logging & Audit

- Each pipeline execution logs: original query, formatted query (from Query Formatter), number of products returned, refinement suggestions generated (list of chip labels), and per-agent duration (ms)
- Agent errors are logged with the agent name, error details, and elapsed time for debugging
- Timeouts are logged as a distinct event from failures (to distinguish slow models from broken calls)
- No additional user-facing logging beyond existing behavior

---

### Rights & Permissions

| Permission | Description | User Roles |
|---|---|---|
| Search products | Trigger the multi-agent recommendation pipeline | All visitors (anonymous) |
| Apply refinement | Click suggestion chips to refine search | All visitors (anonymous) |

---

## Out of Scope

- Persistent user preferences or search history
- Saved filters or bookmarked searches
- A/B testing between single-agent and multi-agent pipelines
- Analytics dashboard for agent performance metrics
- User feedback on suggestion quality (thumbs up/down)
- Custom agent model selection by the user
- Refinement Agent accessing the database or product catalog directly (it receives a product summary from the pipeline, not raw DB access)
- Multi-turn conversational refinement (chat-style follow-up questions)
- Removing or replacing the existing `refineInput` free-form text field

---

## Acceptance Criteria

**Functional:**

- [ ] Orchestrator coordinates Query Formatter → Recommendation Agent sequentially for every search
- [ ] Query Formatter Agent produces a structured query from natural language input without database access
- [ ] Recommendation Agent receives the formatted query and returns tiered products (same output as current)
- [ ] Products are displayed to the user before the Refinement Agent completes (non-blocking)
- [ ] Refinement Agent runs in background after products are broadcast; receives the formatted query + product summary as input; delivers suggestion chips via SSE
- [ ] Suggestion chips include constrained-vocabulary categories (gender, price, size — only when present in returned products) + 2-3 dynamic AI-generated suggestions
- [ ] Chips are rendered in the HomePage component (below the search bar) with a subtle fade-in transition
- [ ] Clicking a chip combines its value with the current search bar text, updates the display, and re-runs the full pipeline using `RefinementContext`
- [ ] New chips replace previous chips on each search (no persistence/toggle)
- [ ] If Query Formatter fails, the orchestrator falls back to passing the raw query to the Recommendation Agent
- [ ] If Refinement Agent fails, no chips appear (graceful degradation, products still visible)
- [ ] A new search aborts any in-progress pipeline via AbortController (including pending refinement chips)
- [ ] Single "Searching..." status is shown throughout the pipeline (no stage-by-stage progress)
- [ ] Manually editing the search bar and submitting runs a fresh search (resets refinement context)
- [ ] The existing `refineInput` text field coexists with suggestion chips

**Non-functional:**

- [ ] Pipeline execution logs include: original query, formatted query, product count, chip labels, and per-agent duration (ms)
- [ ] Latency & timeout requirements deferred to a follow-up performance pass
