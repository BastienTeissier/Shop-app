# Implementation Plan: Storybook + Playwright for Agent Design Verification

## Objective

Set up a pipeline where a coding agent (Claude Code, Cursor, etc.) can autonomously verify its own UI implementation by rendering components in Storybook and capturing screenshots via Playwright — without dealing with authentication, navigation, or app state.

---

## Phase 1: Storybook Setup

**Goal**: Get an isolated component rendering environment running locally.

### 1.1 Install Storybook

If the project doesn't already have Storybook:

```bash
npx storybook@latest init
```

This auto-detects your framework (React, Vue, Angular, Svelte, etc.) and installs the appropriate packages. It creates:
- `.storybook/main.ts` — Storybook config (addons, framework, story file globs)
- `.storybook/preview.ts` — Global decorators and parameters
- A few example stories in `src/stories/`

If the project already has Storybook, skip to 1.3.

### 1.2 Configure for Deterministic Rendering

This is critical for reliable agent verification. Non-deterministic rendering (animations, dynamic content, font loading delays) produces screenshots that vary between captures, making it impossible for the agent to know if a change is a bug or just timing.

**Disable animations globally** in `.storybook/preview.ts`:

```typescript
import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  decorators: [
    (Story) => (
      <>
        <style>{`
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
          }
        `}</style>
        <Story />
      </>
    ),
  ],
};
export default preview;
```

**Ensure fonts are loaded** — if you use custom web fonts, preload them in `.storybook/preview-head.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=block" rel="stylesheet" />
```

Note: use `display=block` (not `swap`) so rendering waits for the font.

### 1.3 Write Stories for Existing Components

Each component that the agent may implement or modify needs stories. The goal is to have every meaningful visual state represented.

**Story writing guidelines for agent verification:**

| Principle | Why |
|-----------|-----|
| One state per story | The agent can verify each state in isolation |
| Realistic content | Catches overflow, truncation, and wrapping issues |
| Fixed data (no randomness) | Screenshots are deterministic |
| No external API calls | Use Storybook args or MSW mocks |
| Explicit viewport stories for responsive components | The agent tests each breakpoint individually |

**Recommended story coverage per component:**

- `Default` — the component with typical props
- `Empty` — empty/zero state if applicable
- `Loading` — skeleton or spinner state
- `Error` — error state rendering
- `WithLongContent` — stress-test text overflow
- `Disabled` — disabled/read-only variant
- `Mobile` — if responsive behavior differs at small viewports

**Example pattern:**

```typescript
// src/components/Card/Card.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
};
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    title: 'Project Alpha',
    description: 'A cross-platform design system for enterprise applications.',
    status: 'active',
  },
};

export const WithLongContent: Story = {
  args: {
    title: 'This is an extremely long project title that should wrap or truncate gracefully across all breakpoints',
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    status: 'active',
  },
};

export const Loading: Story = {
  args: { loading: true },
};

export const Error: Story = {
  args: { error: 'Failed to load project data. Please try again.' },
};
```

### 1.4 Add a Storybook Script to package.json

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "storybook:build": "storybook build -o storybook-static",
    "storybook:serve": "npx serve storybook-static -p 6006"
  }
}
```

The `build` + `serve` approach is useful for CI — the static build is faster and more stable than the dev server.

---

## Phase 2: Playwright Setup

**Goal**: Give the agent the ability to capture screenshots of Storybook stories.

### 2.1 Install Playwright

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Only Chromium is needed for design verification (you're checking your own implementation, not cross-browser compatibility). This saves disk space and install time.

### 2.2 Add the Verification Script

Copy the `verify-design.mjs` script from the skill's `scripts/` directory into your project:

```bash
cp <skill-path>/scripts/verify-design.mjs ./scripts/verify-design.mjs
```

Or install Playwright as an MCP server for your coding agent:

```bash
# For Claude Code
claude mcp add playwright npx @playwright/mcp@latest

# Or use the more token-efficient CLI
# (see https://github.com/microsoft/playwright-mcp for CLI setup)
```

### 2.3 Add Verification Scripts to package.json

```json
{
  "scripts": {
    "verify:list": "node scripts/verify-design.mjs --list",
    "verify:story": "node scripts/verify-design.mjs",
    "verify:all": "node scripts/verify-design.mjs --all",
    "verify:responsive": "node scripts/verify-design.mjs --viewports mobile,tablet,desktop,wide"
  }
}
```

### 2.4 Create a Screenshots Directory

```bash
mkdir -p screenshots
echo "screenshots/" >> .gitignore
```

Screenshots are ephemeral verification artifacts — they don't belong in version control (unless you're doing visual regression, covered in Phase 4).

### 2.5 Test the Pipeline

Start Storybook and run a capture:

```bash
# Terminal 1
npm run storybook

# Terminal 2
node scripts/verify-design.mjs --list
# Should output all available story IDs

node scripts/verify-design.mjs components-card--default
# Should produce screenshots/components-card--default--desktop.png
```

Verify the screenshot shows the component rendered correctly.

---

## Phase 3: Agent Integration

**Goal**: Wire the verification pipeline into your coding agent's workflow so it uses it automatically.

### 3.1 Install the Skill

Copy the `design-verification` skill folder to your project's skill directory.

**For Claude Code:**
```bash
# Copy the skill
cp -r <skill-path>/design-verification-skill .claude/skills/design-verification

# Or reference it in CLAUDE.md
```

**Add to CLAUDE.md:**

```markdown
### Design Verification

After implementing or modifying any UI component, ALWAYS verify the visual output:

1. Ensure a Storybook story exists for the component and state you changed
2. Start Storybook if not already running: `npm run storybook`
3. Capture a screenshot: `node scripts/verify-design.mjs <story-id>`
4. Inspect the screenshot to verify correctness
5. If something looks wrong, fix and re-verify (max 3 cycles)

Story ID format: `category-componentname--storyname` (all lowercase, kebab-case)
Example: `components-button--primary`

Use `node scripts/verify-design.mjs --list` to find available story IDs.
Use `--viewports mobile,tablet,desktop` for responsive verification.
```

**For Cursor (`.cursorrules`):**

```markdown
## UI Verification Rule

After any CSS, layout, or component change:
1. Verify a Storybook story covers the changed state
2. Run `node scripts/verify-design.mjs <story-id>` to capture a screenshot
3. Inspect the result before marking the task as done
```

### 3.2 Optional: Storybook MCP Server

For agents that support MCP, the Storybook MCP server gives the agent structured component metadata — props, variants, documentation — so it generates better code in the first place.

```bash
# Install the Storybook MCP addon
npx storybook@latest add @storybook/addon-mcp

# For Claude Code
claude mcp add storybook-mcp -- npx @storybook/addon-mcp
```

This lets the agent query which components exist, what props they accept, and what stories are available — all without reading source files.

### 3.3 Optional: Figma MCP for Design Reference

If your team uses Figma, connecting a Figma MCP gives the agent access to the original design specs:

```bash
# Claude Code
claude mcp add figma -- npx @anthropic-ai/figma-mcp
```

The agent can then compare its Storybook screenshots against the Figma source of truth.

---

## Phase 4: Visual Regression in CI/CD

**Goal**: Automatically catch unintended visual changes on every pull request.

### 4.1 Choose a Regression Strategy

| Approach | Pros | Cons |
|----------|------|------|
| **Playwright `toHaveScreenshot()`** | Free, built-in, no external service | Baseline management is manual, pixel-level flakiness |
| **Chromatic** | Made by Storybook team, cloud-hosted, AI diffing | Paid beyond free tier |
| **Percy (BrowserStack)** | Cross-browser, CI-native, smart diffing | Paid |
| **Self-hosted with `reg-suit`** | Free, stores baselines in S3/GCS | More setup and maintenance |

For most teams starting out, **Playwright's built-in screenshot assertions** are the simplest:

### 4.2 Playwright Visual Regression Test

Create `tests/visual-regression.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const STORYBOOK_URL = process.env.STORYBOOK_URL || 'http://localhost:6006';

// Auto-discover stories or list them explicitly
const STORIES_TO_TEST = [
  'components-button--primary',
  'components-button--disabled',
  'components-card--default',
  'components-card--loading',
  'components-card--error',
  'components-card--with-long-content',
];

for (const storyId of STORIES_TO_TEST) {
  test(`visual: ${storyId}`, async ({ page }) => {
    await page.goto(`${STORYBOOK_URL}/iframe.html?id=${storyId}&viewMode=story`);
    await page.waitForSelector('#storybook-root');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot(`${storyId}.png`, {
      maxDiffPixelRatio: 0.01,  // Allow 1% pixel difference (anti-aliasing)
      animations: 'disabled',
    });
  });
}
```

### 4.3 Configure Playwright for CI

`playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: process.env.STORYBOOK_URL || 'http://localhost:6006',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Build and serve Storybook before running tests
  webServer: {
    command: 'npm run storybook:build && npm run storybook:serve',
    port: 6006,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

### 4.4 CI Pipeline

**GitHub Actions example (`.github/workflows/visual-regression.yml`):**

```yaml
name: Visual Regression Tests

on: [pull_request]

jobs:
  visual-test:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v1.52.0-noble
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run visual regression tests
        run: npx playwright test tests/visual-regression.spec.ts

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: visual-regression-report
          path: playwright-report/
```

### 4.5 Update Baselines

When visual changes are intentional:

```bash
npx playwright test tests/visual-regression.spec.ts --update-snapshots
git add tests/__screenshots__/
git commit -m "chore: update visual regression baselines"
```

---

## Phase 5: Team Workflow

### 5.1 Story-Driven Development Convention

Establish this as a team norm:

1. **Before implementing** a component, write the story first (or at minimum, at the same time)
2. **During implementation**, use the verification pipeline to check your work
3. **Before opening a PR**, run `npm run verify:all` and check for regressions
4. **In code review**, reviewers can look at the Storybook deployment to see the visual output

### 5.2 CLAUDE.md / Agent Instructions Template

Add the following block to your project's agent configuration file:

```markdown
## UI Development Workflow

When working on frontend components:

1. READ existing stories for the component in `src/components/<ComponentName>/<ComponentName>.stories.tsx`
2. If no story exists for the state you're modifying, WRITE one first
3. IMPLEMENT the component changes
4. VERIFY by running `node scripts/verify-design.mjs <story-id>` and inspecting the screenshot
5. For responsive work, verify at multiple viewports: `--viewports mobile,tablet,desktop`
6. If a design reference exists in `./design-refs/`, compare your screenshot against it

Available tools:
- `node scripts/verify-design.mjs --list` → list all story IDs
- `node scripts/verify-design.mjs <story-id>` → capture a single story
- `node scripts/verify-design.mjs <story-id> --viewports mobile,desktop` → responsive check
- `node scripts/verify-design.mjs --all` → capture everything

Never mark a UI task as complete without verifying the visual output.
```

---

## Summary Checklist

| Phase | Task | Status |
|-------|------|--------|
| **1. Storybook** | Install and configure Storybook | ☐ |
| | Disable animations for deterministic rendering | ☐ |
| | Write stories for all existing components | ☐ |
| | Add npm scripts | ☐ |
| **2. Playwright** | Install Playwright + Chromium | ☐ |
| | Add verification script | ☐ |
| | Test the pipeline end-to-end | ☐ |
| **3. Agent** | Install the design-verification skill | ☐ |
| | Add instructions to CLAUDE.md / .cursorrules | ☐ |
| | Optional: Storybook MCP server | ☐ |
| | Optional: Figma MCP for design reference | ☐ |
| **4. CI/CD** | Add visual regression test suite | ☐ |
| | Configure Playwright for CI | ☐ |
| | Add GitHub Actions workflow | ☐ |
| **5. Team** | Establish story-driven development convention | ☐ |
| | Document the workflow for the team | ☐ |

---

## Estimated Effort

| Phase | If starting from scratch | If Storybook already exists |
|-------|--------------------------|----------------------------|
| Phase 1: Storybook | 2–4 hours (init + stories) | 30 min (config tweaks) |
| Phase 2: Playwright | 30 min | 30 min |
| Phase 3: Agent integration | 30 min | 30 min |
| Phase 4: CI/CD | 1–2 hours | 1–2 hours |
| Phase 5: Team workflow | Ongoing | Ongoing |