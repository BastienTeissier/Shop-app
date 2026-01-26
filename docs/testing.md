# Testing

## Overview

Vitest for both unit and integration tests. Two test suites with different configurations:

| Suite       | Command                 | Target           | Environment       |
| ----------- | ----------------------- | ---------------- | ----------------- |
| Unit        | `pnpm test:unit`        | React components | happy-dom         |
| Integration | `pnpm test:integration` | MCP tools        | Node.js + test DB |

## Component Tests (Unit)

Test widgets as standard React components. Mock Skybridge hooks to control inputs.

**Location**: `web/src/components/<name>.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyComponent } from "./my-component";

// Hoist mocks for Skybridge hooks
const mocks = vi.hoisted(() => ({
  theme: "light",
  useToolInfo: vi.fn(),
  widgetState: undefined as { items: number[] } | undefined,
}));

vi.mock("skybridge/web", async () => {
  const React = await import("react");
  return {
    useLayout: vi.fn(() => ({ theme: mocks.theme })),
    useUser: vi.fn(() => ({ locale: "en-US" })),
    useRequestModal: vi.fn(() => ({ open: vi.fn(), isOpen: false })),
    useOpenExternal: vi.fn(() => vi.fn()),
    useWidgetState: vi.fn((initial) => {
      const [state, setState] = React.useState(mocks.widgetState ?? initial);
      return [state, setState] as const;
    }),
  };
});

vi.mock("../helpers.js", () => ({
  useToolInfo: mocks.useToolInfo,
}));

describe("MyComponent", () => {
  beforeEach(() => {
    mocks.theme = "light";
    mocks.widgetState = undefined;
    mocks.useToolInfo.mockReset();
  });

  it("renders loading state", () => {
    mocks.useToolInfo.mockReturnValue({ output: undefined, isPending: true });
    render(<MyComponent />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders data", () => {
    mocks.useToolInfo.mockReturnValue({
      output: { items: [{ id: 1, name: "Test" }] },
      isPending: false,
    });
    render(<MyComponent />);
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});
```

**Key patterns**:

- Use `vi.hoisted()` to define mocks that can be modified per test
- Reset mocks in `beforeEach`
- Test loading, empty, and data states
- Use `userEvent` for interactions

## MCP Tool Tests (Integration)

Test MCP tools end-to-end using the MCP SDK client with in-memory transport. Uses a separate test database.

**Location**: `server/tests/<name>.integration.test.ts`

**Environment**: Requires `.env.test` with `DATABASE_URL` pointing to test database.

```typescript
import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("MCP tools/call", () => {
  let client: Client | undefined;
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    // Setup test database
    prisma = new PrismaClient();
    await prisma.product.deleteMany();
    await prisma.product.create({
      data: {
        title: "Test Item",
        description: "Description",
        imageUrl: "https://example.com/img.png",
        price: 1999,
      },
    });

    // Connect MCP client to server via in-memory transport
    const { default: server } = await import("../src/server.js");
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
    await prisma?.product.deleteMany();
    await prisma?.$disconnect();
  });

  it("returns matching products", async () => {
    const result = await client!.callTool({
      name: "widget-name",
      arguments: { query: "Test" },
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Test Item" })]),
    );
  });
});
```

**Key patterns**:

- Use `InMemoryTransport.createLinkedPair()` for fast, isolated tests
- Clean database state in `beforeAll` and `afterAll`
- Assert on both `isError` and `structuredContent`
- Dynamic import of server to ensure fresh instance

## Running Tests

```bash
# Unit tests (components)
pnpm test:unit

# Integration tests (MCP tools) - resets test DB first
pnpm test:integration

# Watch mode for unit tests
pnpm test:unit --watch
```

## Test Database Setup

Integration tests use `.env.test`:

```env
DATABASE_URL=file:../test.db
```

The `test:integration` script automatically resets the test database before running.
