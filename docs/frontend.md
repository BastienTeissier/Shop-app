# Frontend Architecture

## Overview

React widgets rendered inside ChatGPT conversations via Skybridge. Vite for bundling with HMR support during development.

## Project Structure

```
web/
├── vite.config.ts
└── src/
    ├── index.css           # Global styles (injected in widgets)
    ├── helpers.ts          # Typed Skybridge hooks generator
    ├── components/         # Reusable React components
    │   └── ecom-carousel.tsx
    ├── widgets/            # Widget entry points (mounted by Skybridge)
    │   └── ecom-carousel.tsx
    └── test/
        └── setup.ts        # Vitest setup with Testing Library
```

## Widget vs Component

| Location                        | Purpose                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `web/src/widgets/<name>.tsx`    | Entry point mounted by Skybridge. Calls `mountWidget()`. Filename must match backend registration. |
| `web/src/components/<name>.tsx` | Actual React component with logic. Imported by widget entry.                                       |

```tsx
// web/src/widgets/ecom-carousel.tsx (entry point)
import { mountWidget } from "skybridge/web";
import { EcomCarousel } from "@/components/ecom-carousel";

mountWidget(<EcomCarousel />);
```

```tsx
// web/src/components/ecom-carousel.tsx (component)
export function EcomCarousel() {
  // Component logic here
}
```

## Typed Tool Data Access

Generate typed hooks from the server's `AppType` to access tool input/output with full type safety:

```typescript
// web/src/helpers.ts
import { generateHelpers } from "skybridge/web";
import type { AppType } from "../../server/src/server";

export const { useToolInfo } = generateHelpers<AppType>();
```

```tsx
// In component
import { useToolInfo } from "../helpers.js";

function MyWidget() {
  const { output, isPending } = useToolInfo<"widget-name">();
  // output is typed based on structuredContent from server
}
```

## Skybridge Hooks

| Hook                      | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `useToolInfo<"name">()`   | Access tool input, output, metadata. Typed per widget.            |
| `useLayout()`             | Get current theme (`"light"` \| `"dark"`)                         |
| `useUser()`               | Get user locale (e.g., `"en-US"`)                                 |
| `useWidgetState(initial)` | Persistent state across re-renders (survives conversation reload) |
| `useRequestModal()`       | Open confirmation modal dialog                                    |
| `useOpenExternal()`       | Open URL in new browser tab                                       |

## Component Pattern

```tsx
import "@/index.css";
import { useLayout, useWidgetState } from "skybridge/web";
import { useToolInfo } from "../helpers.js";

export function MyWidget() {
  const { theme } = useLayout();
  const { output, isPending } = useToolInfo<"my-widget">();
  const [state, setState] = useWidgetState({ items: [] });

  if (isPending) return <div className={theme}>Loading...</div>;
  if (!output) return <div className={theme}>No data</div>;

  return <div className={`${theme} container`}>{/* Render output.data */}</div>;
}
```

## Styling

- Import `@/index.css` at component top
- Apply `theme` class to root element for light/dark mode support
- CSS classes scoped per widget in `index.css`

## Common Commands

| Command          | Description                      |
| ---------------- | -------------------------------- |
| `pnpm dev`       | Start dev server with widget HMR |
| `pnpm test:unit` | Run component tests              |
| `pnpm typecheck` | TypeScript validation            |
