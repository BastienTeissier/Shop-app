# Agent Guide

## Projects

An e-commerce carousel application built as a ChatGPT plugin. Users search for products via natural language, view results in an interactive widget carousel, add items to a cart, and proceed to checkout. Built on the Skybridge framework for seamless integration with OpenAI's MCP (Model Context Protocol).

## Stack

| Layer          | Technology                                          |
| -------------- | --------------------------------------------------- |
| Backend        | Express.js, Skybridge (MCP abstraction), Prisma ORM |
| Database       | SQLite (dev), Postgres (planned)                    |
| Frontend       | React 19, Vite, TypeScript                          |
| Testing        | Vitest, Testing Library, happy-dom                  |
| Validation     | Zod                                                 |
| Linting/Format | Biome                                               |

## Architecture

### Folder Structure

```
sport-shop/
├── shared/
│   ├── types.ts              # Domain types (Product, CartSnapshot, etc.)
│   ├── format.ts             # Shared formatting utilities (formatPrice, etc.)
│   └── a2ui-types.ts         # A2UI protocol types + createInitialDataModel factory
├── server/
│   ├── src/
│   │   ├── index.ts          # Express app setup
│   │   ├── server.ts         # MCP server orchestration (no business logic)
│   │   ├── middleware.ts     # MCP transport handler
│   │   ├── db/               # Database layer
│   │   │   ├── client.ts     # Prisma singleton + lifecycle
│   │   │   ├── products.ts   # Product domain queries
│   │   │   ├── cart.ts       # Cart domain queries
│   │   │   └── index.ts      # Barrel re-exports
│   │   ├── api/              # REST API handlers (standalone storefront)
│   │   │   └── cart.ts       # Cart summary endpoint
│   │   ├── tools/            # Widget handlers (business logic)
│   │   │   ├── utils.ts      # Shared utilities
│   │   │   ├── ecom-carousel.ts
│   │   │   ├── cart.ts
│   │   │   ├── cart-summary.ts
│   │   │   └── product-recommendations.ts
│   │   ├── a2ui/             # A2UI streaming protocol (SSE + event handlers)
│   │   │   ├── event.ts      # POST endpoint for user actions
│   │   │   ├── stream.ts     # SSE endpoint for real-time updates
│   │   │   ├── session.ts    # In-memory session management
│   │   │   ├── surface.ts    # UI component tree definition
│   │   │   ├── handlers/     # Action handlers (cart, recommend)
│   │   │   └── index.ts      # Barrel re-exports
│   │   └── agent/            # LLM recommendation agent
│   │       ├── recommendation-agent.ts  # Agent orchestration
│   │       ├── openrouter-provider.ts   # LLM provider config
│   │       ├── tools/        # Agent tools (search, rank)
│   │       └── index.ts      # Barrel re-exports
│   └── tests/
│       ├── helpers/          # Shared test utilities
│       └── *.integration.test.ts
├── web/
│   ├── vite.config.ts
│   └── src/
│       ├── widgets/          # Widget entry points (mounted by Skybridge)
│       ├── components/       # React components with logic
│       │   └── a2ui/         # A2UI renderer and sub-components
│       ├── helpers.ts        # Typed Skybridge hooks
│       ├── index.css         # Global styles
│       └── test/
├── store/                    # Standalone storefront (Vite + React)
│   ├── src/
│   │   ├── App.tsx           # Route definitions
│   │   ├── api.ts            # REST API client
│   │   ├── main.tsx          # Entry point
│   │   ├── pages/            # Page components
│   │   └── test/
│   ├── vite.config.ts
│   └── tsconfig.json
├── prisma/
│   ├── schema.prisma         # Data models
│   └── migrations/
├── scripts/
│   └── load-products.ts      # Seed script
└── docs/
    ├── backend.md            # Backend patterns
    ├── frontend.md           # Frontend patterns
    └── testing.md            # Testing patterns
```

### Architecture Patterns

**Folder Organization**

- **Modular by domain**: Split large files into folders (`db/`, `tools/`)
- **Barrel exports**: Each folder has `index.ts` re-exporting public API
- **Shared code**: `shared/` at root for cross-boundary types

**Naming Conventions**

- **Functions**: Domain prefix + action (e.g., `cartAddItem`, `productList`)
- **Handler files**: Match widget name exactly (`ecom-carousel.ts`)
- **Types**: PascalCase, suffixed by role (`CartSnapshot`, `CartSummaryItem`)
- **Handler exports**: `<name>Options`, `<name>ToolOptions`, `<name>Handler`

**Type Sharing**

- Domain types live in `shared/types.ts`
- Import via `@shared/types.js` alias
- Server re-exports types from `db/*.ts` for backwards compatibility

**Import Style**

- Prefer granular imports over barrel imports for clarity
- Group order: external → shared → relative

### Key Boundaries

**Backend (Express/MCP Server)**

- Exposes `/mcp` endpoint for ChatGPT
- Registers widgets and their input schemas
- Handles database queries
- Returns structured data (`structuredContent`) and text content

**Frontend (React Widgets)**

- Renders in ChatGPT conversation context
- Accesses structured data via `useToolInfo()` hook
- Manages local state with `useWidgetState()`
- Theme-aware via `useLayout()`, locale-aware via `useUser()`

**Database (Prisma/SQLite)**

- Single schema with `Product` model
- Query functions in `db.ts` handle filtering and limiting
- Singleton client with dev-mode global caching for HMR

### Patterns

**Request Flow**

1. User queries in ChatGPT
2. ChatGPT invokes MCP tool (registered widget)
3. Backend handler fetches data from Prisma
4. Returns `{ structuredContent, content, isError }`
5. Frontend receives `structuredContent` via `useToolInfo()`
6. Widget renders with Skybridge hooks

**Widget Registration**

- One widget = one MCP tool + one React component
- Zod schema defines inputs for the LLM
- Widget name must match component filename exactly
- Output typed via `export type AppType` on server

**Testing Strategy**

- Components tested in isolation with mocked Skybridge hooks
- MCP tools tested with in-memory transport (no network)
- Both use Vitest with happy-dom for components, Node for tools

## Commands

| Command                 | Purpose                            | When to Use                                       |
| ----------------------- | ---------------------------------- | ------------------------------------------------- |
| `pnpm dev`              | Start Express server + Vite HMR    | Development; both backend and frontend hot-reload |
| `pnpm build`            | Build for production (Skybridge)   | Pre-deployment verification                       |
| `pnpm start`            | Run production build               | Production environment                            |
| `pnpm check`            | Run lint + typecheck + audit       | Before commit; CI/CD pipeline                     |
| `pnpm lint`             | Run Biome linter                   | Check code style issues                           |
| `pnpm lint:fix`         | Auto-fix Biome issues              | Quick formatting                                  |
| `pnpm typecheck`        | TypeScript validation              | Verify type safety                                |
| `pnpm test:unit`        | Run component tests                | After modifying React components                  |
| `pnpm test:store`       | Run store app tests                | After modifying store/ components or context       |
| `pnpm test:integration` | Run MCP tool tests                 | After modifying server queries or endpoints       |
| `pnpm db:migrate`       | Create and apply migration         | After changing `schema.prisma`                    |
| `pnpm db:seed`          | Load products from `products.json` | First setup or reset data                         |
| `pnpm db:reset`         | Wipe and recreate database         | Clean slate for testing                           |
| `pnpm db:studio`        | Open Prisma Studio GUI             | Visual database inspection                        |
| `pnpm inspector`        | Start MCP Inspector                | Debug MCP protocol directly                       |

### Development Workflow

```bash
# 1. Initial setup
pnpm install
pnpm db:migrate
pnpm db:seed

# 2. Development with HMR
pnpm dev

# 3. During development - backend query change
pnpm db:migrate
pnpm db:seed

# 4. Testing before commit
pnpm test:unit
pnpm test:integration
pnpm check

# 5. Production deployment
pnpm build
# Deploy via Alpic
```
