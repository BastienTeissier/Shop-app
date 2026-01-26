# Backend Architecture

## Overview

Express server exposing an MCP endpoint (`/mcp`) consumed by ChatGPT. Built with Skybridge framework for MCP server abstraction and widget registration.

## Project Structure

```
server/
├── src/
│   ├── index.ts      # Express app entry, middleware setup
│   ├── server.ts     # MCP server instance, widget/tool registration
│   ├── middleware.ts # MCP transport handler
│   └── db.ts         # Prisma client singleton, query functions
```

## MCP Server & Widget Registration

Widgets are registered on the `McpServer` instance using the fluent `.registerWidget()` API. Each widget defines:

- A unique name (must match the frontend file name exactly)
- Metadata (description)
- Input schema (Zod)
- Handler function returning `structuredContent` + `content`

```typescript
// server/src/server.ts
import { McpServer } from "skybridge/server";
import { z } from "zod";

const server = new McpServer(
  { name: "app-name", version: "0.0.1" },
  { capabilities: {} },
).registerWidget(
  "widget-name", // Must match web/src/widgets/<name>.tsx
  { description: "Widget description" },
  {
    description: "Tool description for the LLM",
    inputSchema: {
      query: z.string().describe("Parameter description"),
    },
  },
  async ({ query }) => {
    const data = await fetchData(query);
    return {
      structuredContent: { items: data }, // Typed data for widget
      content: [{ type: "text", text: JSON.stringify(data) }],
      isError: false,
    };
  },
);

export default server;
export type AppType = typeof server; // Export for frontend type inference
```

**Widget naming convention**: The widget name in `registerWidget()` must exactly match the filename in `web/src/widgets/`. For `"ecom-carousel"`, create `web/src/widgets/ecom-carousel.tsx`.

## Database Layer

Prisma with SQLite. Single client instance with global caching for development hot-reload.

```typescript
// server/src/db.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

Query functions are co-located in `db.ts`:

```typescript
export async function listProducts(
  query: string,
  limit = 10,
): Promise<Product[]> {
  // Validate inputs, return early for edge cases
  if (!query.trim() || limit <= 0) return [];

  return prisma.product.findMany({
    where: {
      OR: [
        { title: { contains: query } },
        { description: { contains: query } },
      ],
    },
    orderBy: { id: "desc" },
    take: limit,
  });
}
```

## Adding a New Tool/Widget

1. Define the Prisma model in `prisma/schema.prisma` if new data is needed
2. Run `pnpm db:migrate` to create migration
3. Add query function in `server/src/db.ts`
4. Register widget in `server/src/server.ts` with `.registerWidget()`
5. Create matching React component in `web/src/widgets/<widget-name>.tsx`

## Common Commands

| Command                 | Description                        |
| ----------------------- | ---------------------------------- |
| `pnpm dev`              | Start dev server with HMR          |
| `pnpm db:migrate`       | Create and apply new migration     |
| `pnpm db:seed`          | Seed database from `products.json` |
| `pnpm db:studio`        | Open Prisma Studio GUI             |
| `pnpm test:integration` | Run MCP tool tests                 |
| `pnpm check`            | Run lint + typecheck + audit       |
