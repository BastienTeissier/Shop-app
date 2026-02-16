# ADR 001: Choose a TypeScript Agent Framework for an MCP-Rendered A2UI Product Recommender

## Context

We are building a **product recommendation agent** in a **full TypeScript stack**. The agent is **invoked via MCP tools** (because MCP Apps can render a widget UI), and the UI is a **React widget** that renders **A2UI-driven** product lists that update as the user refines the request.

The agent must support:

* **Tool calling** (product search, pricing, reviews, availability) via MCP-exposed tools and/or downstream services.
* **Streaming / incremental updates** to the UI (progressive result filling and status updates).
* **Testable, stepwise implementation** (retrieval → enrichment → ranking → explanation → UI updates).
* **Observability** (traces/logs) to debug agent behavior and evaluate quality.

We will use the **official MCP TypeScript SDK** for the MCP server/tool layer regardless of the agent framework choice. ([Model Context Protocol][1])

### Requirements

1. **TypeScript-first implementation**: The agent framework must be idiomatic TS and integrate cleanly into a Node/TS backend.
2. **Streaming + tool orchestration**: The framework must support multi-step tool usage and incremental progress/partial output.
3. **Production observability and debuggability**: Built-in tracing/evals or straightforward integration to get high-fidelity traces.

## Options Considered

### OpenAI Agents SDK (JavaScript/TypeScript)

A lightweight agent framework focused on tools, handoffs, streaming, and traces. ([OpenAI Platform][2])

**Pros:**

* Built for agentic apps with **tools, handoffs, streaming partial results**, and **full traces**. ([OpenAI Platform][2])
* Strong default for **production debugging** thanks to built-in tracing and evaluation workflow support. ([openai.github.io][3])

**Cons:**

* Less “workflow-graph native” than graph-first frameworks; complex branching flows can require additional structure you design.
* Operational coupling to the OpenAI ecosystem is likely (even if parts are portable), which can matter if you demand strict provider neutrality.

### LangGraph.js

Graph-based orchestration/runtime for **long-running, stateful agents**, with explicit nodes and state transitions. ([docs.langchain.com][4])

**Pros:**

* Excellent for **explicit, testable workflows** (node-by-node), which maps well to “retrieval → rank → explain → refine”. ([docs.langchain.com][5])
* Designed for **stateful, long-running agents** with low-level orchestration control. ([docs.langchain.com][4])

**Cons:**

* More boilerplate / steeper setup for teams that want “agent loop + tools” quickly.
* You’ll typically need to assemble your own tracing/evals stack or integrate external observability patterns.

### Mastra

A TypeScript framework for AI apps/agents emphasizing workflows, memory, streaming, evals, and tracing. ([mastra.ai][6])

**Pros:**

* TS-native with **workflows, memory, streaming, evals, tracing** and dev tooling. ([mastra.ai][6])
* Positioned for modern full-stack TS integration (React/Next.js/Node). ([mastra.ai][7])

**Cons:**

* Smaller ecosystem/mindshare than LangChain/LangGraph; more platform risk for long-lived enterprise standards.
* MCP integration story may require more “glue code” (depending on how you structure your MCP server and app-only tools).

## Comparison

| Criterion                                       | OpenAI Agents SDK | LangGraph.js | Mastra |
| ----------------------------------------------- | ----------------- | ------------ | ------ |
| **Fast path to production (tools + streaming)** | 🟢                | 🟠           | 🟠     |
| **Workflow explicitness & step-testability**    | 🟠                | 🟢           | 🟠     |
| **Built-in tracing / debugging**                | 🟢                | 🟠           | 🟢     |

Legend: 🟢 Excellent | 🟠 Adequate | 🔴 Poor

## Recommendation

**Use OpenAI Agents SDK (TypeScript)**

## Decision Rationale

### Why OpenAI Agents SDK

1. **Streaming + tool orchestration is a primary concern**: The SDK is explicitly designed for agentic apps where models use tools, can hand off, and can stream partial results. ([OpenAI Platform][2])
2. **Observability is first-class**: Built-in tracing and debugging support reduces time-to-diagnosis when recommendations look wrong or regress. ([openai.github.io][3])
3. **Fits the MCP + A2UI architecture cleanly**: It’s straightforward to run the agent inside the MCP tool handler, then emit incremental UI updates (A2UI messages) as the agent progresses, while keeping an end-to-end trace for each session/task. ([OpenAI Platform][2])

### Why Not LangGraph.js

LangGraph.js is the best choice when the **workflow graph** is the core artifact (highly branched state machines, strong node-level determinism, graph visualization). ([docs.langchain.com][4])
However, for this project’s near-term priority—**shipping an MCP-invoked agent with streaming UI updates and strong tracing quickly**—Agents SDK provides a more direct path with less orchestration scaffolding. ([OpenAI Platform][2])

## Trade-offs

1. **Less explicit orchestration vs faster delivery**: We accept that complex branching flows may be less “graph-native” than LangGraph in exchange for faster integration of streaming + tools + tracing out of the box. ([OpenAI Platform][2])
2. **Ecosystem coupling vs best-in-class tracing defaults**: We accept some coupling to the OpenAI Agents SDK conventions in exchange for strong built-in traceability that will accelerate debugging and iteration on recommendation quality. ([openai.github.io][3])

[1]: https://modelcontextprotocol.io/docs/sdk?utm_source=chatgpt.com "SDKs - Model Context Protocol"
[2]: https://platform.openai.com/docs/guides/agents-sdk?utm_source=chatgpt.com "Agents SDK | OpenAI API"
[3]: https://openai.github.io/openai-agents-js/?utm_source=chatgpt.com "OpenAI Agents SDK TypeScript"
[4]: https://docs.langchain.com/oss/javascript/langgraph/overview?utm_source=chatgpt.com "LangGraph overview - Docs by LangChain"
[5]: https://docs.langchain.com/oss/javascript/langgraph/use-graph-api?utm_source=chatgpt.com "Use the graph API - Docs by LangChain"
[6]: https://mastra.ai/?utm_source=chatgpt.com "The TypeScript AI Framework - Mastra"
[7]: https://mastra.ai/docs?utm_source=chatgpt.com "About Mastra | Mastra Docs"
