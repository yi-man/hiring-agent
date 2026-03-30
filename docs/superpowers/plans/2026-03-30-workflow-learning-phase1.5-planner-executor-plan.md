# Workflow Learning Phase 1.5: Planner-Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the workflow-learning agent from a single ReAct loop with per-call browser launch/close to a Planner-Executor architecture with persistent browser sessions, multi-tool support, login detection, replan capability, and plan Markdown persistence.

**Architecture:** Split agent into Planner (single structured-output LLM call producing TaskPlan JSON) and Executor (ReAct agent with 6 browser tools sharing a BrowserSessionManager singleton). Browser sessions persist across messages per user. Plans are displayed in chat UI and saved as Markdown files.

**Tech Stack:** Next.js App Router (Node runtime), TypeScript, Zod, `@langchain/openai` (`withStructuredOutput`), `@langchain/langgraph` (ReAct agent), `playwright` (headed Chromium), existing `@/components/ui`, Jest.

**Design spec:** `docs/superpowers/specs/2026-03-30-workflow-learning-phase1.5-planner-executor-design.md`

---

## File Structure

### Create

- `src/lib/workflow-learning/browser-session-manager.ts` — Process-level singleton managing Browser instances per userId
- `src/lib/workflow-learning/browser-session-manager.test.ts` — Unit tests with mocked Playwright
- `src/lib/workflow-learning/planner.ts` — Planner LLM call with structured output + Markdown persistence
- `src/lib/workflow-learning/planner.test.ts` — Unit tests with mocked LLM
- `src/lib/workflow-learning/plan-markdown.ts` — TaskPlan ↔ Markdown serialization
- `src/lib/workflow-learning/plan-markdown.test.ts` — Snapshot tests
- `src/lib/workflow-learning/tools/browser-navigate-tool.ts` — Navigate to URL
- `src/lib/workflow-learning/tools/browser-click-tool.ts` — Click element by selector
- `src/lib/workflow-learning/tools/browser-type-tool.ts` — Fill text input by selector
- `src/lib/workflow-learning/tools/browser-close-tool.ts` — Close browser session
- `src/lib/workflow-learning/tools/browser-wait-for-user-tool.ts` — Wait for user action with polling
- `src/lib/workflow-learning/tools/tool-context.ts` — Shared ToolContext type (emitEvent callback + BrowserSessionManager + userId)

### Modify

- `src/lib/workflow-learning/constants.ts` — Add 3 new constants
- `src/lib/workflow-learning/types.ts` — Add TaskPlan/TaskStep/BrowserSubStep types + 5 new SSE events
- `src/lib/workflow-learning/tools/browser-snapshot-tool.ts` — Rewrite to use BrowserSessionManager (remove per-call launch/close)
- `src/lib/workflow-learning/agent-runner.ts` — Rewrite as Planner → Executor pipeline
- `src/app/api/workflow-learning/chat/route.ts` — Pass userId to agent runner
- `src/components/workflow-learning/workflow-learning-chat.tsx` — Three-layer UI (plan + trace + answer)
- `.gitignore` — Add `data/workflow-plans/`

### Do not modify

- `src/app/api/chat/route.ts`, `src/components/chat/` — Recruitment chat untouched
- `src/lib/workflow-learning/url-allowlist.ts` — Logic unchanged
- `src/lib/workflow-learning/sse.ts`, `parse-sse.ts`, `client.ts` — Format unchanged

---

### Task 1: Constants and types

**Files:**

- Modify: `src/lib/workflow-learning/constants.ts`
- Modify: `src/lib/workflow-learning/types.ts`

- [ ] **Step 1: Add new constants**

In `src/lib/workflow-learning/constants.ts`, append:

```ts
export const BROWSER_SESSION_IDLE_TIMEOUT_MS = 300_000;
export const BROWSER_WAIT_POLL_INTERVAL_MS = 2_000;
export const BROWSER_WAIT_DEFAULT_TIMEOUT_MS = 120_000;
```

- [ ] **Step 2: Add TaskPlan types and new SSE events**

In `src/lib/workflow-learning/types.ts`, add before the `WorkflowSseEvent` type:

```ts
export interface BrowserSubStep {
  action: 'navigate' | 'snapshot' | 'click' | 'type' | 'close';
  params: Record<string, string>;
  description: string;
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting_user';

export interface TaskStep {
  id: string;
  description: string;
  type: 'browser_action' | 'analysis' | 'report';
  browserSubSteps?: BrowserSubStep[];
  onFailure: 'replan' | 'skip' | 'abort';
  status: StepStatus;
}

export interface TaskPlan {
  goal: string;
  steps: TaskStep[];
  fallbackStrategy: string;
}
```

Then extend `WorkflowSseEvent` union with 5 new variants:

```ts
  | (WorkflowBaseFields & { type: 'plan'; plan: TaskPlan })
  | (WorkflowBaseFields & { type: 'plan_step_update'; stepId: string; status: StepStatus; summary?: string })
  | (WorkflowBaseFields & { type: 'plan_update'; plan: TaskPlan; reason: string })
  | (WorkflowBaseFields & { type: 'user_action_required'; reason: string })
  | (WorkflowBaseFields & { type: 'user_action_resolved' })
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm type-check`
Expected: PASS (no type errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/workflow-learning/constants.ts src/lib/workflow-learning/types.ts
git commit -m "feat(workflow-learning): add TaskPlan types and phase 1.5 SSE events"
```

---

### Task 2: Plan Markdown serialization (TDD)

**Files:**

- Create: `src/lib/workflow-learning/plan-markdown.ts`
- Create: `src/lib/workflow-learning/plan-markdown.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/workflow-learning/plan-markdown.test.ts`:

```ts
import { renderPlanToMarkdown, updateStepInMarkdown } from './plan-markdown';
import type { TaskPlan } from './types';

describe('renderPlanToMarkdown', () => {
  const plan: TaskPlan = {
    goal: '了解竞品XX的功能',
    steps: [
      {
        id: 'step-1',
        description: '打开竞品官网',
        type: 'browser_action',
        browserSubSteps: [
          { action: 'navigate', params: { url: 'https://xx.com' }, description: '打开首页' },
          { action: 'snapshot', params: {}, description: '读取内容' },
        ],
        onFailure: 'replan',
        status: 'pending',
      },
      {
        id: 'step-2',
        description: '总结分析',
        type: 'analysis',
        onFailure: 'abort',
        status: 'pending',
      },
    ],
    fallbackStrategy: '如果页面无法访问，尝试搜索引擎查找',
  };

  it('renders a complete markdown document', () => {
    const md = renderPlanToMarkdown({
      plan,
      runId: 'test-run-123',
      createdAt: '2026-03-30T14:00:00Z',
    });
    expect(md).toContain('# Workflow Plan: 了解竞品XX的功能');
    expect(md).toContain('**RunId:** test-run-123');
    expect(md).toContain('### Step 1: 打开竞品官网 [pending]');
    expect(md).toContain('### Step 2: 总结分析 [pending]');
    expect(md).toContain('navigate → {"url":"https://xx.com"}');
  });
});

describe('updateStepInMarkdown', () => {
  it('updates step status and appends summary', () => {
    const original = '### Step 1: 打开竞品官网 [pending]\n- 类型: browser_action\n';
    const updated = updateStepInMarkdown(original, 'step-1', 'completed', '成功打开页面');
    expect(updated).toContain('[completed]');
    expect(updated).toContain('- 结果: 成功打开页面');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest src/lib/workflow-learning/plan-markdown.test.ts --runInBand`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement plan-markdown.ts**

Create `src/lib/workflow-learning/plan-markdown.ts`:

```ts
import type { TaskPlan, TaskStep } from './types';

interface RenderOptions {
  plan: TaskPlan;
  runId: string;
  createdAt: string;
}

export function renderPlanToMarkdown({ plan, runId, createdAt }: RenderOptions): string {
  const lines: string[] = [
    `# Workflow Plan: ${plan.goal}`,
    '',
    `**RunId:** ${runId}`,
    `**Created:** ${createdAt}`,
    `**Goal:** ${plan.goal}`,
    `**Fallback:** ${plan.fallbackStrategy}`,
    '',
    '## Steps',
    '',
  ];

  plan.steps.forEach((step, i) => {
    lines.push(`### Step ${i + 1}: ${step.description} [${step.status}]`);
    lines.push(`- 类型: ${step.type}`);
    lines.push(`- 失败策略: ${step.onFailure}`);
    if (step.browserSubSteps?.length) {
      lines.push('- 子步骤:');
      step.browserSubSteps.forEach((sub, j) => {
        lines.push(
          `  ${j + 1}. ${sub.action} → ${JSON.stringify(sub.params)} — ${sub.description}`,
        );
      });
    }
    lines.push('');
  });

  return lines.join('\n');
}

export function updateStepInMarkdown(
  markdown: string,
  stepId: string,
  status: TaskStep['status'],
  summary?: string,
): string {
  const stepNum = stepId.replace('step-', '');
  const pattern = new RegExp(`(### Step ${stepNum}: .+?) \\[\\w+\\]`);
  let updated = markdown.replace(pattern, `$1 [${status}]`);
  if (summary) {
    const stepHeader = `### Step ${stepNum}:`;
    const idx = updated.indexOf(stepHeader);
    if (idx >= 0) {
      const nextStep = updated.indexOf('### Step', idx + stepHeader.length);
      const insertPos = nextStep >= 0 ? nextStep : updated.length;
      updated = updated.slice(0, insertPos) + `- 结果: ${summary}\n\n` + updated.slice(insertPos);
    }
  }
  return updated;
}

export function appendReplanToMarkdown(
  markdown: string,
  reason: string,
  newPlan: TaskPlan,
): string {
  const section = [
    '',
    '---',
    '',
    `## Replan (${new Date().toISOString()})`,
    '',
    `**原因:** ${reason}`,
    '',
    ...newPlan.steps.map((step, i) => `### Step ${i + 1}: ${step.description} [${step.status}]`),
    '',
  ];
  return markdown + section.join('\n');
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec jest src/lib/workflow-learning/plan-markdown.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow-learning/plan-markdown.ts src/lib/workflow-learning/plan-markdown.test.ts
git commit -m "feat(workflow-learning): plan Markdown serialization with TDD"
```

---

### Task 3: BrowserSessionManager (TDD)

**Files:**

- Create: `src/lib/workflow-learning/browser-session-manager.ts`
- Create: `src/lib/workflow-learning/browser-session-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/workflow-learning/browser-session-manager.test.ts`:

```ts
import { BrowserSessionManager } from './browser-session-manager';

const mockPage = {
  title: jest.fn().mockResolvedValue('Test Page'),
  url: jest.fn().mockReturnValue('https://example.com'),
  goto: jest.fn().mockResolvedValue(null),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockContext = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  newContext: jest.fn().mockResolvedValue(mockContext),
  close: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
};

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  },
}));

describe('BrowserSessionManager', () => {
  let manager: BrowserSessionManager;

  beforeEach(() => {
    manager = new BrowserSessionManager();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await manager.shutdownAll();
  });

  it('creates a new session for a new userId', async () => {
    const session = await manager.getOrCreate('user-1');
    expect(session.page).toBe(mockPage);
    expect(session.userId).toBe('user-1');
  });

  it('reuses existing session for same userId', async () => {
    const s1 = await manager.getOrCreate('user-1');
    const s2 = await manager.getOrCreate('user-1');
    expect(s1).toBe(s2);
    const { chromium } = await import('playwright');
    expect(chromium.launch).toHaveBeenCalledTimes(1);
  });

  it('creates separate sessions for different userIds', async () => {
    const s1 = await manager.getOrCreate('user-1');
    const s2 = await manager.getOrCreate('user-2');
    expect(s1).not.toBe(s2);
  });

  it('close removes session', async () => {
    await manager.getOrCreate('user-1');
    expect(manager.isActive('user-1')).toBe(true);
    await manager.close('user-1');
    expect(manager.isActive('user-1')).toBe(false);
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('shutdownAll closes all sessions', async () => {
    await manager.getOrCreate('user-1');
    await manager.getOrCreate('user-2');
    await manager.shutdownAll();
    expect(manager.isActive('user-1')).toBe(false);
    expect(manager.isActive('user-2')).toBe(false);
  });

  it('detects disconnected browser', async () => {
    await manager.getOrCreate('user-1');
    mockBrowser.isConnected.mockReturnValue(false);
    const status = manager.getStatus('user-1');
    expect(status).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec jest src/lib/workflow-learning/browser-session-manager.test.ts --runInBand`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement BrowserSessionManager**

Create `src/lib/workflow-learning/browser-session-manager.ts`:

```ts
import type { Browser, BrowserContext, Page } from 'playwright';
import { BROWSER_SESSION_IDLE_TIMEOUT_MS } from './constants';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  userId: string;
  createdAt: Date;
  lastActiveAt: Date;
}

export class BrowserSessionManager {
  private sessions = new Map<string, BrowserSession>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async getOrCreate(userId: string): Promise<BrowserSession> {
    const existing = this.sessions.get(userId);
    if (existing && existing.browser.isConnected()) {
      existing.lastActiveAt = new Date();
      this.resetIdleTimer(userId);
      return existing;
    }

    if (existing) {
      this.sessions.delete(userId);
      this.clearIdleTimer(userId);
    }

    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    const session: BrowserSession = {
      browser,
      context,
      page,
      userId,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.sessions.set(userId, session);
    this.resetIdleTimer(userId);
    return session;
  }

  async close(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) return;
    this.clearIdleTimer(userId);
    this.sessions.delete(userId);
    try {
      await session.browser.close();
    } catch {
      // browser may already be closed
    }
  }

  async shutdownAll(): Promise<void> {
    const userIds = [...this.sessions.keys()];
    await Promise.all(userIds.map((id) => this.close(id)));
  }

  isActive(userId: string): boolean {
    const session = this.sessions.get(userId);
    return !!session && session.browser.isConnected();
  }

  getStatus(userId: string): { url: string; title: string } | null {
    const session = this.sessions.get(userId);
    if (!session || !session.browser.isConnected()) return null;
    try {
      return { url: session.page.url(), title: '' };
    } catch {
      return null;
    }
  }

  touch(userId: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActiveAt = new Date();
      this.resetIdleTimer(userId);
    }
  }

  private resetIdleTimer(userId: string): void {
    this.clearIdleTimer(userId);
    this.idleTimers.set(
      userId,
      setTimeout(() => {
        void this.close(userId);
      }, BROWSER_SESSION_IDLE_TIMEOUT_MS),
    );
  }

  private clearIdleTimer(userId: string): void {
    const timer = this.idleTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(userId);
    }
  }
}

let _instance: BrowserSessionManager | null = null;

export function getBrowserSessionManager(): BrowserSessionManager {
  if (!_instance) {
    _instance = new BrowserSessionManager();

    const cleanup = () => {
      void _instance?.shutdownAll();
    };
    process.on('beforeExit', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }
  return _instance;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec jest src/lib/workflow-learning/browser-session-manager.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow-learning/browser-session-manager.ts src/lib/workflow-learning/browser-session-manager.test.ts
git commit -m "feat(workflow-learning): BrowserSessionManager with idle cleanup"
```

---

### Task 4: Tool context type + browser-navigate tool

**Files:**

- Create: `src/lib/workflow-learning/tools/tool-context.ts`
- Create: `src/lib/workflow-learning/tools/browser-navigate-tool.ts`

- [ ] **Step 1: Create shared ToolContext type**

Create `src/lib/workflow-learning/tools/tool-context.ts`:

```ts
import type { BrowserSessionManager } from '../browser-session-manager';
import type { WorkflowSseEvent } from '../types';

export interface ToolContext {
  sessionManager: BrowserSessionManager;
  userId: string;
  emitEvent: (event: WorkflowSseEvent) => void;
  runId: string;
}
```

- [ ] **Step 2: Implement browser-navigate tool**

Create `src/lib/workflow-learning/tools/browser-navigate-tool.ts`:

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { WORKFLOW_PLAYWRIGHT_TIMEOUT_MS } from '../constants';
import { assertUrlAllowed } from '../url-allowlist';
import type { ToolContext } from './tool-context';

const schema = z.object({
  url: z.string().url().describe('Full http(s) URL to navigate to.'),
});

export function createBrowserNavigateTool(ctx: ToolContext) {
  return tool(
    async (input: z.infer<typeof schema>) => {
      ctx.sessionManager.touch(ctx.userId);
      try {
        assertUrlAllowed(input.url);
        const session = await ctx.sessionManager.getOrCreate(ctx.userId);
        const response = await session.page.goto(input.url, {
          timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
          waitUntil: 'domcontentloaded',
        });
        const title = await session.page.title();
        const finalUrl = session.page.url();
        const status = response?.status() ?? 0;
        return JSON.stringify({ title, url: finalUrl, status });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: 'browser_navigate',
      description:
        'Navigate to a URL in the browser. Returns page title, final URL (after redirects), and HTTP status. URL must be http(s) and pass the allowlist.',
      schema,
    },
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/workflow-learning/tools/tool-context.ts src/lib/workflow-learning/tools/browser-navigate-tool.ts
git commit -m "feat(workflow-learning): ToolContext and browser_navigate tool"
```

---

### Task 5: Rewrite browser-snapshot tool

**Files:**

- Modify: `src/lib/workflow-learning/tools/browser-snapshot-tool.ts`

- [ ] **Step 1: Rewrite to use BrowserSessionManager**

Replace the entire content of `src/lib/workflow-learning/tools/browser-snapshot-tool.ts`:

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { WORKFLOW_TOOL_RESULT_MAX_CHARS } from '../constants';
import type { ToolContext } from './tool-context';

const schema = z.object({});

export function createBrowserSnapshotTool(ctx: ToolContext) {
  return tool(
    async () => {
      ctx.sessionManager.touch(ctx.userId);
      try {
        const session = await ctx.sessionManager.getOrCreate(ctx.userId);
        if (!session.browser.isConnected()) {
          return JSON.stringify({ error: 'Browser session is disconnected. Consider replanning.' });
        }
        const title = await session.page.title();
        const url = session.page.url();
        const body = await session.page
          .locator('body')
          .innerText()
          .catch(() => '');
        const excerpt = body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS);
        return JSON.stringify({ title, url, excerpt });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ error: message });
      }
    },
    {
      name: 'browser_snapshot',
      description:
        'Read the current page title, URL, and visible text excerpt. No input needed — reads from the active browser session.',
      schema,
    },
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/workflow-learning/tools/browser-snapshot-tool.ts
git commit -m "refactor(workflow-learning): browser_snapshot uses BrowserSessionManager"
```

---

### Task 6: browser-click, browser-type, browser-close tools

**Files:**

- Create: `src/lib/workflow-learning/tools/browser-click-tool.ts`
- Create: `src/lib/workflow-learning/tools/browser-type-tool.ts`
- Create: `src/lib/workflow-learning/tools/browser-close-tool.ts`

- [ ] **Step 1: Implement browser-click tool**

Create `src/lib/workflow-learning/tools/browser-click-tool.ts`:

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { WORKFLOW_PLAYWRIGHT_TIMEOUT_MS } from '../constants';
import type { ToolContext } from './tool-context';

const schema = z.object({
  selector: z.string().describe('CSS selector of the element to click.'),
});

export function createBrowserClickTool(ctx: ToolContext) {
  return tool(
    async (input: z.infer<typeof schema>) => {
      ctx.sessionManager.touch(ctx.userId);
      try {
        const session = await ctx.sessionManager.getOrCreate(ctx.userId);
        await session.page
          .locator(input.selector)
          .click({ timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS });
        await session.page.waitForLoadState('domcontentloaded').catch(() => {});
        const newUrl = session.page.url();
        const newTitle = await session.page.title();
        return JSON.stringify({ success: true, newUrl, newTitle });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ success: false, error: message });
      }
    },
    {
      name: 'browser_click',
      description:
        'Click an element on the current page by CSS selector. Returns the page state after clicking.',
      schema,
    },
  );
}
```

- [ ] **Step 2: Implement browser-type tool**

Create `src/lib/workflow-learning/tools/browser-type-tool.ts`:

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { WORKFLOW_PLAYWRIGHT_TIMEOUT_MS } from '../constants';
import type { ToolContext } from './tool-context';

const schema = z.object({
  selector: z.string().describe('CSS selector of the input element.'),
  text: z.string().describe('Text to fill into the input element.'),
});

export function createBrowserTypeTool(ctx: ToolContext) {
  return tool(
    async (input: z.infer<typeof schema>) => {
      ctx.sessionManager.touch(ctx.userId);
      try {
        const session = await ctx.sessionManager.getOrCreate(ctx.userId);
        await session.page
          .locator(input.selector)
          .fill(input.text, { timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS });
        return JSON.stringify({ success: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ success: false, error: message });
      }
    },
    {
      name: 'browser_type',
      description:
        'Fill text into an input element by CSS selector. Clears existing content first.',
      schema,
    },
  );
}
```

- [ ] **Step 3: Implement browser-close tool**

Create `src/lib/workflow-learning/tools/browser-close-tool.ts`:

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { ToolContext } from './tool-context';

const schema = z.object({});

export function createBrowserCloseTool(ctx: ToolContext) {
  return tool(
    async () => {
      await ctx.sessionManager.close(ctx.userId);
      return JSON.stringify({ closed: true });
    },
    {
      name: 'browser_close',
      description:
        'Close the browser session. Only call this when the plan explicitly requires closing, or when all browser tasks are done.',
      schema,
    },
  );
}
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow-learning/tools/browser-click-tool.ts src/lib/workflow-learning/tools/browser-type-tool.ts src/lib/workflow-learning/tools/browser-close-tool.ts
git commit -m "feat(workflow-learning): browser click, type, and close tools"
```

---

### Task 7: browser-wait-for-user tool

**Files:**

- Create: `src/lib/workflow-learning/tools/browser-wait-for-user-tool.ts`

- [ ] **Step 1: Implement the tool**

Create `src/lib/workflow-learning/tools/browser-wait-for-user-tool.ts`:

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  BROWSER_WAIT_DEFAULT_TIMEOUT_MS,
  BROWSER_WAIT_POLL_INTERVAL_MS,
  WORKFLOW_TOOL_RESULT_MAX_CHARS,
} from '../constants';
import type { ToolContext } from './tool-context';

const schema = z.object({
  reason: z.string().describe('Why the user needs to take action (shown in the chat UI).'),
  waitForUrlChange: z.boolean().optional().describe('Wait until the page URL changes.'),
  waitForSelector: z
    .string()
    .optional()
    .describe('Wait until this CSS selector appears on the page.'),
  timeoutMs: z.number().optional().describe('Max wait time in ms (default 120000).'),
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createBrowserWaitForUserTool(ctx: ToolContext) {
  return tool(
    async (input: z.infer<typeof schema>) => {
      ctx.sessionManager.touch(ctx.userId);
      const timeout = input.timeoutMs ?? BROWSER_WAIT_DEFAULT_TIMEOUT_MS;
      const ts = () => new Date().toISOString();

      try {
        const session = await ctx.sessionManager.getOrCreate(ctx.userId);
        const originalUrl = session.page.url();

        ctx.emitEvent({
          type: 'user_action_required',
          runId: ctx.runId,
          timestamp: ts(),
          reason: input.reason,
        });

        const deadline = Date.now() + timeout;
        let resolved = false;

        while (Date.now() < deadline) {
          await sleep(BROWSER_WAIT_POLL_INTERVAL_MS);
          ctx.sessionManager.touch(ctx.userId);

          if (!session.browser.isConnected()) {
            return JSON.stringify({ resolved: false, reason: 'Browser disconnected' });
          }

          if (input.waitForUrlChange && session.page.url() !== originalUrl) {
            resolved = true;
            break;
          }

          if (input.waitForSelector) {
            const found = await session.page
              .locator(input.waitForSelector)
              .count()
              .catch(() => 0);
            if (found > 0) {
              resolved = true;
              break;
            }
          }

          if (!input.waitForUrlChange && !input.waitForSelector) {
            const body = await session.page
              .locator('body')
              .innerText()
              .catch(() => '');
            const hasLoginKeywords = /登录|sign\s*in|log\s*in|password/i.test(body);
            if (!hasLoginKeywords) {
              resolved = true;
              break;
            }
          }
        }

        if (resolved) {
          ctx.emitEvent({ type: 'user_action_resolved', runId: ctx.runId, timestamp: ts() });
          const newUrl = session.page.url();
          const newTitle = await session.page.title();
          const body = await session.page
            .locator('body')
            .innerText()
            .catch(() => '');
          const excerpt = body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS);
          return JSON.stringify({ resolved: true, newUrl, newTitle, excerpt });
        }

        return JSON.stringify({ resolved: false, reason: 'timeout' });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ resolved: false, reason: message });
      }
    },
    {
      name: 'browser_wait_for_user',
      description:
        'Pause execution and notify the user that manual action is needed in the browser window (e.g. login). Polls for page changes and resumes automatically.',
      schema,
    },
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/workflow-learning/tools/browser-wait-for-user-tool.ts
git commit -m "feat(workflow-learning): browser_wait_for_user tool with SSE notify + polling"
```

---

### Task 8: Planner module (TDD)

**Files:**

- Create: `src/lib/workflow-learning/planner.ts`
- Create: `src/lib/workflow-learning/planner.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/workflow-learning/planner.test.ts`:

```ts
import type { TaskPlan } from './types';

const mockPlan: TaskPlan = {
  goal: '打开 localhost 健康检查页面并总结',
  steps: [
    {
      id: 'step-1',
      description: '打开健康检查页面',
      type: 'browser_action',
      browserSubSteps: [
        {
          action: 'navigate',
          params: { url: 'http://localhost:3000/api/health' },
          description: '访问 API',
        },
        { action: 'snapshot', params: {}, description: '读取页面' },
      ],
      onFailure: 'replan',
      status: 'pending',
    },
    {
      id: 'step-2',
      description: '总结健康检查结果',
      type: 'report',
      onFailure: 'abort',
      status: 'pending',
    },
  ],
  fallbackStrategy: '如果页面不可达，报告错误',
};

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue(mockPlan),
    }),
  })),
}));

import { generatePlan } from './planner';

describe('generatePlan', () => {
  it('returns a valid TaskPlan from LLM', async () => {
    const plan = await generatePlan({
      userMessage: '打开 http://localhost:3000/api/health 并总结',
      browserStatus: null,
      runId: 'test-123',
    });
    expect(plan.goal).toBe('打开 localhost 健康检查页面并总结');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].id).toBe('step-1');
    expect(plan.steps[0].type).toBe('browser_action');
    expect(plan.steps[1].type).toBe('report');
  });

  it('passes browser status context when available', async () => {
    const plan = await generatePlan({
      userMessage: '继续分析页面',
      browserStatus: { url: 'https://example.com', title: 'Example' },
      runId: 'test-456',
    });
    expect(plan).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec jest src/lib/workflow-learning/planner.test.ts --runInBand`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement planner.ts**

Create `src/lib/workflow-learning/planner.ts`:

```ts
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import type { TaskPlan } from './types';
import {
  renderPlanToMarkdown,
  updateStepInMarkdown,
  appendReplanToMarkdown,
} from './plan-markdown';

const BrowserSubStepSchema = z.object({
  action: z.enum(['navigate', 'snapshot', 'click', 'type', 'close']),
  params: z.record(z.string()),
  description: z.string(),
});

const TaskStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  type: z.enum(['browser_action', 'analysis', 'report']),
  browserSubSteps: z.array(BrowserSubStepSchema).optional(),
  onFailure: z.enum(['replan', 'skip', 'abort']),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'waiting_user']).default('pending'),
});

const TaskPlanSchema = z.object({
  goal: z.string(),
  steps: z.array(TaskStepSchema),
  fallbackStrategy: z.string(),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function buildPlannerModel(): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: requireEnv('OPENAI_API_KEY'),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    configuration: { baseURL: process.env.OPENAI_BASE_URL },
    temperature: 0.2,
  });
}

const PLANNER_SYSTEM_PROMPT = `You are a task planner for a browser automation system. Given a user request, produce a structured plan with clear steps.

Rules:
- Each step has an id like "step-1", "step-2", etc.
- Steps of type "browser_action" must include browserSubSteps detailing each browser operation.
- Available browser actions: navigate, snapshot, click, type, close.
- Set onFailure to "replan" for steps that might fail due to page structure, "skip" for optional steps, "abort" for critical steps.
- All steps should have status "pending".
- Provide a fallbackStrategy describing what to do if the overall task cannot be completed.
- Keep plans concise — typically 2-5 steps.`;

interface GeneratePlanOptions {
  userMessage: string;
  browserStatus: { url: string; title: string } | null;
  runId: string;
  replanContext?: { previousPlan: TaskPlan; error: string; completedStepIds: string[] };
}

export async function generatePlan(options: GeneratePlanOptions): Promise<TaskPlan> {
  const model = buildPlannerModel();
  const structured = model.withStructuredOutput(TaskPlanSchema);

  let userPrompt = options.userMessage;
  if (options.browserStatus) {
    userPrompt += `\n\n[Current browser state: URL=${options.browserStatus.url}, Title="${options.browserStatus.title}"]`;
  }
  if (options.replanContext) {
    const { previousPlan, error, completedStepIds } = options.replanContext;
    userPrompt += `\n\n[REPLAN NEEDED]\nPrevious goal: ${previousPlan.goal}\nCompleted steps: ${completedStepIds.join(', ')}\nError: ${error}\nPlease create a revised plan for the remaining work.`;
  }

  const plan = await structured.invoke([
    { role: 'system', content: PLANNER_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]);

  return plan;
}

const PLANS_DIR = join(process.cwd(), 'data', 'workflow-plans');

export async function savePlanMarkdown(plan: TaskPlan, runId: string): Promise<string> {
  await mkdir(PLANS_DIR, { recursive: true });
  const filePath = join(PLANS_DIR, `${runId}.md`);
  const md = renderPlanToMarkdown({ plan, runId, createdAt: new Date().toISOString() });
  await writeFile(filePath, md, 'utf-8');
  return filePath;
}

export async function updatePlanStepMarkdown(
  runId: string,
  stepId: string,
  status: string,
  summary?: string,
): Promise<void> {
  const filePath = join(PLANS_DIR, `${runId}.md`);
  try {
    const content = await readFile(filePath, 'utf-8');
    const updated = updateStepInMarkdown(
      content,
      stepId,
      status as TaskPlan['steps'][0]['status'],
      summary,
    );
    await writeFile(filePath, updated, 'utf-8');
  } catch {
    // file may not exist in test environments
  }
}

export async function appendReplanMarkdown(
  runId: string,
  reason: string,
  newPlan: TaskPlan,
): Promise<void> {
  const filePath = join(PLANS_DIR, `${runId}.md`);
  try {
    const content = await readFile(filePath, 'utf-8');
    const updated = appendReplanToMarkdown(content, reason, newPlan);
    await writeFile(filePath, updated, 'utf-8');
  } catch {
    // file may not exist
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec jest src/lib/workflow-learning/planner.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow-learning/planner.ts src/lib/workflow-learning/planner.test.ts
git commit -m "feat(workflow-learning): Planner with structured output and Markdown persistence"
```

---

### Task 9: Rewrite agent-runner as Planner-Executor pipeline

**Files:**

- Modify: `src/lib/workflow-learning/agent-runner.ts`
- Modify: `src/lib/workflow-learning/agent-runner.test.ts`

- [ ] **Step 1: Rewrite agent-runner.ts**

Replace the entire content of `src/lib/workflow-learning/agent-runner.ts` with the Planner → Executor pipeline. Key changes:

1. Import all 6 tool factories and `BrowserSessionManager`
2. Import `generatePlan`, `savePlanMarkdown`, `updatePlanStepMarkdown`, `appendReplanMarkdown` from `planner.ts`
3. `runWorkflowAgentWithEvents` now accepts `{ runId, userText, userId }`
4. Phase 1: call `generatePlan`, yield `plan` event, save Markdown
5. Phase 2: build ReAct agent with all 6 tools created via `ToolContext`, inject plan into system prompt
6. Map `streamEvents` to SSE events (same as before, but add `plan_step_update` emissions)
7. On tool failure with `onFailure: 'replan'`: call `generatePlan` with replan context, yield `plan_update`, continue
8. Keep `extractTextFromMessageContent` exported for existing test compatibility

The new `runWorkflowAgentWithEvents` signature:

```ts
export async function* runWorkflowAgentWithEvents(options: {
  runId: string;
  userText: string;
  userId: string;
}): AsyncGenerator<WorkflowSseEvent>
```

The system prompt for the Executor should include the plan steps serialized as text, plus guidance about login detection and `browser_wait_for_user`.

Implementation note: the `emitEvent` callback collects events into an array that the outer generator yields between `streamEvents` iterations. This avoids async generator nesting complexity.

- [ ] **Step 2: Update agent-runner.test.ts**

Update the existing test to account for the new `userId` parameter. Add a test verifying `extractTextFromMessageContent` still works (existing behavior).

Run: `pnpm exec jest src/lib/workflow-learning/agent-runner.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 3: Verify types compile**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/workflow-learning/agent-runner.ts src/lib/workflow-learning/agent-runner.test.ts
git commit -m "feat(workflow-learning): Planner-Executor pipeline in agent runner"
```

---

### Task 10: Update API route to pass userId

**Files:**

- Modify: `src/app/api/workflow-learning/chat/route.ts`

- [ ] **Step 1: Extract userId from requireAuth and pass to runner**

In `src/app/api/workflow-learning/chat/route.ts`, change:

```ts
await requireAuth();
```

to:

```ts
const { user } = await requireAuth();
```

And pass `userId: user.id` to `runWorkflowAgentWithEvents`:

```ts
for await (const event of runWorkflowAgentWithEvents({ runId, userText: message, userId: user.id })) {
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/workflow-learning/chat/route.ts
git commit -m "feat(api): pass userId to workflow-learning agent runner"
```

---

### Task 11: Update .gitignore

**Files:**

- Modify: `.gitignore`

- [ ] **Step 1: Add data/workflow-plans/ to .gitignore**

Append to `.gitignore`:

```
# Workflow Learning plan files (local only)
data/workflow-plans/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore workflow plan files"
```

---

### Task 12: Refactor WorkflowLearningChat UI — three-layer display

**Files:**

- Modify: `src/components/workflow-learning/workflow-learning-chat.tsx`

- [ ] **Step 1: Extend AssistantRow type**

Add `plan` field to `AssistantRow`:

```ts
type AssistantRow = {
  id: string;
  role: 'assistant';
  plan?: TaskPlan;
  trace: WorkflowSseEvent[];
  finalText?: string;
  error?: string;
};
```

- [ ] **Step 2: Handle new events in applyEvents**

In the `applyEvents` function, add cases:

- `ev.type === 'plan'` → set `plan = ev.plan`
- `ev.type === 'plan_step_update'` → update the matching step's status in the plan object
- `ev.type === 'plan_update'` → replace plan with `ev.plan`
- `ev.type === 'user_action_required'` → push to trace (renders as yellow card)
- `ev.type === 'user_action_resolved'` → push to trace

- [ ] **Step 3: Create PlanDisplay component**

Add a `PlanDisplay` component that renders the plan steps with status icons:

- `pending` → gray circle
- `running` → spinning loader
- `completed` → green check
- `failed` → red X
- `waiting_user` → yellow warning

- [ ] **Step 4: Create collapsible ExecutionTrace**

Update `ExecutionTrace` to be collapsible (default collapsed), showing a summary like "N 个工具调用" when collapsed.

- [ ] **Step 5: Handle user_action_required in trace**

Render `user_action_required` events as a yellow warning card with the reason text. Render `user_action_resolved` as a green confirmation.

- [ ] **Step 6: Assemble three-layer layout**

In the assistant message rendering, stack: `PlanDisplay` → `ExecutionTrace` (collapsible) → final answer.

- [ ] **Step 7: Verify types compile**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/workflow-learning/workflow-learning-chat.tsx
git commit -m "feat(ui): three-layer workflow chat with plan display and collapsible trace"
```

---

### Task 13: Lint, typecheck, and unit tests

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: clean (fix any issues).

- [ ] **Step 2: Type check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Unit tests**

Run: `pnpm test:ci`
Expected: PASS.

- [ ] **Step 4: Fix any issues found**

If lint/type/test failures, fix them and re-run.

- [ ] **Step 5: Commit fixes if any**

```bash
git add -A
git commit -m "fix(workflow-learning): resolve lint and type issues"
```

---

### Task 14: Manual smoke test

- [ ] **Step 1: Start dev server**

Run: `pnpm dev`

- [ ] **Step 2: Open browser and log in**

Navigate to `http://localhost:3000/workflow-learning`, log in if not already.

- [ ] **Step 3: Test basic flow**

Send: `请打开 http://127.0.0.1:3000/api/health 并总结内容`

Verify:

1. Plan appears in chat with steps listed
2. Steps update from pending → running → completed
3. Execution trace is visible (expandable)
4. Final answer appears with page summary
5. Browser window opens (headed mode) during execution

- [ ] **Step 4: Test browser session persistence**

Send a follow-up message: `请告诉我当前页面的标题`

Verify: browser_snapshot tool reads from existing session without relaunching browser.

- [ ] **Step 5: Test browser close**

Send: `关闭浏览器`

Verify: browser window closes, browser_close tool result shown in trace.

---

## Acceptance Checklist

- [ ] Planner generates structured TaskPlan before any browser action
- [ ] Plan is displayed in chat UI with real-time step status updates
- [ ] Plan is persisted as Markdown in `data/workflow-plans/`
- [ ] Browser sessions persist across messages for the same user (headed mode)
- [ ] 6 browser tools work: navigate, snapshot, click, type, close, wait_for_user
- [ ] Login detection → SSE notification → poll → auto-resume works
- [ ] Replan triggers when step fails with `onFailure: 'replan'`
- [ ] Browser idle timeout (5 min) auto-closes session
- [ ] No changes to recruitment `/api/chat` or `/chat` UI
- [ ] `pnpm test:ci` passes without requiring Chromium
- [ ] `pnpm type-check` and `pnpm lint` pass clean

---

## Risk Notes

- **Structured output compatibility:** `withStructuredOutput` requires the LLM to support function calling / JSON mode. Verify the configured `OPENAI_MODEL` supports this. `gpt-4o-mini` does.
- **Headed browser in CI:** CI runs headless; tests that exercise real browser should skip or use headless fallback. Unit tests mock Playwright entirely.
- **Long-running SSE:** `browser_wait_for_user` can block the SSE stream for up to 2 minutes. HTTP proxies or load balancers may timeout — acceptable for local dev (Phase 1.5 scope).
- **Process singleton:** `BrowserSessionManager` is process-scoped. Hot module reload in dev may create orphan instances. The `shutdownAll` on `SIGTERM` mitigates this.
