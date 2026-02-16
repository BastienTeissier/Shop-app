# Backend Architecture

## Overview

Express server exposing an MCP endpoint (`/mcp`) consumed by ChatGPT. Built with Skybridge framework for MCP server abstraction and widget registration.

## Project Structure

```
server/
├── src/
│   ├── index.ts        # Express app entry, middleware setup
│   ├── server.ts       # MCP server instance, widget registration (orchestration only)
│   ├── middleware.ts   # MCP transport handler
│   ├── api/            # REST API handlers (standalone storefront)
│   │   └── cart.ts     # Cart summary endpoint
│   ├── db/             # Database layer
│   │   ├── client.ts   # Prisma client singleton + lifecycle
│   │   ├── products.ts # Product domain queries
│   │   ├── cart.ts     # Cart domain queries + types re-export
│   │   └── index.ts    # Barrel re-exports
│   └── tools/          # Widget handlers (business logic)
│       ├── utils.ts    # Shared utilities (textContent, validation)
│       ├── ecom-carousel.ts
│       ├── cart.ts
│       └── cart-summary.ts
shared/
├── types.ts            # Domain types (Product, CartSnapshot, etc.)
└── format.ts           # Shared formatting utilities (formatPrice, etc.)
```

## MCP Server & Widget Registration

Widgets are registered on the `McpServer` instance using the fluent `.registerWidget()` API. Each widget defines:

- A unique name (must match the frontend file name exactly)
- Metadata (description)
- Input schema (Zod)
- Handler function returning `structuredContent` + `content`

```typescript
// server/src/server.ts (orchestration only - no business logic)
import { McpServer } from "skybridge/server";
import {
  myWidgetHandler,
  myWidgetOptions,
  myWidgetToolOptions,
} from "./tools/my-widget.js";

const server = new McpServer(
  { name: "app-name", version: "0.0.1" },
  { capabilities: {} },
).registerWidget(
  "my-widget", // Must match web/src/widgets/<name>.tsx
  myWidgetOptions,
  myWidgetToolOptions,
  myWidgetHandler,
);

export default server;
export type AppType = typeof server; // Export for frontend type inference
```

```typescript
// server/src/tools/my-widget.ts (handler + metadata)
import { z } from "zod";
import { productList } from "../db/products.js";
import { textContent } from "./utils.js";

export const myWidgetOptions = {
  description: "Widget description",
};

export const myWidgetToolOptions = {
  description: "Tool description for the LLM",
  inputSchema: {
    query: z.string().describe("Parameter description"),
  },
};

export async function myWidgetHandler({ query }: { query: string }) {
  const data = await productList(query);
  return {
    structuredContent: { items: data },
    content: textContent(JSON.stringify(data)),
    isError: false,
  };
}
```

**Widget naming convention**: The widget name in `registerWidget()` must exactly match the filename in `web/src/widgets/`. For `"ecom-carousel"`, create `web/src/widgets/ecom-carousel.tsx`.

## Database Layer

Prisma with SQLite. Modular structure with separate files per domain.

```typescript
// server/src/db/client.ts - Prisma singleton + lifecycle
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

Query functions are organized by domain with prefixed names:

```typescript
// server/src/db/products.ts
import type { Product } from "@shared/types.js";
import { prisma } from "./client.js";

export async function productList(
  query: string,
  limit = 10,
): Promise<Product[]> {
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

```typescript
// server/src/db/cart.ts
import type { CartSnapshot, CartSummary } from "@shared/types.js";
import { prisma } from "./client.js";

export async function cartGetBySessionId(sessionId: string) { ... }
export async function cartCreate(sessionId: string) { ... }
export async function cartAddItem(cartId: number, productId: number) { ... }
export async function cartRemoveItem(cartId: number, productId: number) { ... }
export async function cartGetSummary(sessionId: string) { ... }
```

## Shared Types

Domain types are defined in `shared/types.ts` and imported across server and web:

```typescript
// shared/types.ts
export type Product = {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  price: number;
};

export type CartSnapshot = {
  items: CartSnapshotItem[];
  totalQuantity: number;
  totalPrice: number;
};

// ... other types
```

Import with the `@shared/*` path alias:

```typescript
import type { Product, CartSnapshot } from "@shared/types.js";
```

## Adding a New Tool/Widget

1. Define types in `shared/types.ts` if new domain types are needed
2. Define the Prisma model in `prisma/schema.prisma` if new data is needed
3. Run `pnpm db:migrate` to create migration
4. Add query functions in `server/src/db/<domain>.ts` (prefixed names, e.g., `cartAddItem`)
5. Create handler file in `server/src/tools/<widget-name>.ts` with:
   - `<name>Options` - widget metadata
   - `<name>ToolOptions` - tool schema (Zod)
   - `<name>Handler` - async handler function
6. Register widget in `server/src/server.ts` (import and wire up)
7. Create matching React component in `web/src/widgets/<widget-name>.tsx`

## Common Commands

| Command                 | Description                        |
| ----------------------- | ---------------------------------- |
| `pnpm dev`              | Start dev server with HMR          |
| `pnpm db:migrate`       | Create and apply new migration     |
| `pnpm db:seed`          | Seed database from `products.json` |
| `pnpm db:studio`        | Open Prisma Studio GUI             |
| `pnpm test:integration` | Run MCP tool tests                 |
| `pnpm check`            | Run lint + typecheck + audit       |
