# Agent Guide

## Projects

An e-commerce carousel application built as a ChatGPT plugin. Users search for products via natural language, view results in an interactive widget carousel, add items to a cart, and proceed to checkout. Built on the Skybridge framework for seamless integration with OpenAI's MCP (Model Context Protocol).

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express.js, Skybridge (MCP abstraction), Prisma ORM |
| Database | SQLite (dev), Postgres (planned) |
| Frontend | React 19, Vite, TypeScript |
| Testing | Vitest, Testing Library, happy-dom |
| Validation | Zod |
| Linting/Format | Biome |

## Architecture

### Folder Structure

```
sport-shop/
├── server/
│   ├── src/
│   │   ├── index.ts          # Express app setup
│   │   ├── server.ts         # MCP server with widget registration
│   │   ├── middleware.ts     # MCP transport handler
│   │   └── db.ts             # Prisma client & query functions
│   └── tests/
│       └── *.integration.test.ts
├── web/
│   ├── vite.config.ts
│   └── src/
│       ├── widgets/          # Widget entry points (mounted by Skybridge)
│       ├── components/       # React components with logic
│       ├── helpers.ts        # Typed Skybridge hooks
│       ├── index.css         # Global styles
│       └── test/
├── prisma/
│   ├── schema.prisma         # Data models
│   └── migrations/
├── scripts/
│   └── load-products.ts      # Seed script
└── docs/
    ├── agent.md              # This file
    ├── backend.md            # Backend patterns
    ├── frontend.md           # Frontend patterns
    └── testing.md            # Testing patterns
```

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

| Command | Purpose | When to Use |
|---------|---------|-----------|
| `pnpm dev` | Start Express server + Vite HMR | Development; both backend and frontend hot-reload |
| `pnpm build` | Build for production (Skybridge) | Pre-deployment verification |
| `pnpm start` | Run production build | Production environment |
| `pnpm check` | Run lint + typecheck + audit | Before commit; CI/CD pipeline |
| `pnpm lint` | Run Biome linter | Check code style issues |
| `pnpm lint:fix` | Auto-fix Biome issues | Quick formatting |
| `pnpm typecheck` | TypeScript validation | Verify type safety |
| `pnpm test:unit` | Run component tests | After modifying React components |
| `pnpm test:integration` | Run MCP tool tests | After modifying server queries or endpoints |
| `pnpm db:migrate` | Create and apply migration | After changing `schema.prisma` |
| `pnpm db:seed` | Load products from `products.json` | First setup or reset data |
| `pnpm db:reset` | Wipe and recreate database | Clean slate for testing |
| `pnpm db:studio` | Open Prisma Studio GUI | Visual database inspection |
| `pnpm inspector` | Start MCP Inspector | Debug MCP protocol directly |

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
