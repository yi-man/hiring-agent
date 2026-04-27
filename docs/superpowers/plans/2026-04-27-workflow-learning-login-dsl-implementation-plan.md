# Workflow Learning Login Gate and DSL Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a BOSS-first workflow-learning loop that checks login before protected browser actions, resumes pending work after user login, generates DSL from a successful trace, and only exposes DSL after replay succeeds.

**Architecture:** Add deterministic workflow orchestration beside the existing LangGraph agent path. The new path uses a small intent router, in-memory workflow session store, BOSS rule config, browser session primitives, and a DSL runner; LLM usage is limited to ordinary chat and DSL drafting. SSE remains the API contract, with two new events for state-machine and replay progress.

**Tech Stack:** Next.js Route Handler, TypeScript strict mode, Jest, Playwright via the existing `BrowserSessionManager`, Zod DSL schema, LangChain/OpenAI for chat and DSL drafting.

---

## File Structure

- Create `src/lib/workflow-learning/intent-router.ts`: deterministic intent classifier for chat, BOSS tasks, login completion, and DSL generation.
- Create `src/lib/workflow-learning/intent-router.test.ts`: unit tests for the classifier.
- Create `src/lib/workflow-learning/boss-config.ts`: BOSS URLs, login detectors, and output keys.
- Create `src/lib/workflow-learning/workflow-session-store.ts`: in-memory session state keyed by `sessionId`.
- Create `src/lib/workflow-learning/workflow-session-store.test.ts`: state store tests.
- Create `src/lib/workflow-learning/dsl-runner.ts`: execute parsed `WorkflowDsl` against browser session primitives.
- Create `src/lib/workflow-learning/dsl-runner.test.ts`: runner tests with a fake browser manager.
- Create `src/lib/workflow-learning/boss-workflow.ts`: state-machine orchestration for BOSS home, first message, login resume, and DSL generation.
- Create `src/lib/workflow-learning/boss-workflow.test.ts`: orchestration tests with fake manager/model callbacks.
- Modify `src/lib/workflow-learning/types.ts`: add `workflow_state_changed` and `dsl_replay_step` SSE event variants.
- Modify `src/lib/workflow-learning/parse-sse.test.ts`: cover the new events.
- Modify `src/lib/workflow-learning/tools/browser-session.ts`: add reusable browser primitives: current page inspection, navigation, wait-for-text, and text extraction.
- Modify `src/lib/workflow-learning/tools/browser-session.test.ts`: cover those primitives.
- Modify `src/lib/workflow-learning/tools/browser-tools.ts`: expose enough manager methods for orchestration while keeping LangChain tools backward compatible.
- Modify `src/lib/workflow-learning/agent-runner.ts`: route deterministic workflow intents before falling back to the existing ReAct agent.
- Modify `src/lib/workflow-learning/agent-runner.test.ts`: cover deterministic path selection.
- Modify `src/components/workflow-learning/workflow-learning-chat.tsx`: render state-machine and DSL replay events.

---

### Task 1: Extend SSE Event Types

**Files:**

- Modify: `src/lib/workflow-learning/types.ts`
- Modify: `src/lib/workflow-learning/parse-sse.test.ts`

- [ ] **Step 1: Add failing parser coverage for new events**

Add this case to `src/lib/workflow-learning/parse-sse.test.ts`:

```ts
it('parses workflow state and DSL replay events', () => {
  const buffer = new WorkflowSseBuffer();
  const events = buffer.push(
    new TextEncoder().encode(
      'data: {"type":"workflow_state_changed","runId":"r1","timestamp":"t","state":"check_login","message":"Checking login"}\n\n' +
        'data: {"type":"dsl_replay_step","runId":"r1","timestamp":"t","stepId":"check-login","stepType":"check_login","status":"success","message":"Already logged in"}\n\n',
    ),
  );

  expect(events).toEqual([
    {
      type: 'workflow_state_changed',
      runId: 'r1',
      timestamp: 't',
      state: 'check_login',
      message: 'Checking login',
    },
    {
      type: 'dsl_replay_step',
      runId: 'r1',
      timestamp: 't',
      stepId: 'check-login',
      stepType: 'check_login',
      status: 'success',
      message: 'Already logged in',
    },
  ]);
});
```

- [ ] **Step 2: Run the focused parser test and confirm it fails**

Run: `pnpm exec jest src/lib/workflow-learning/parse-sse.test.ts --runInBand`

Expected: fail because `workflow_state_changed` and `dsl_replay_step` are not accepted by `isWorkflowSseEvent`.

- [ ] **Step 3: Extend `WorkflowSseEvent`**

In `src/lib/workflow-learning/types.ts`, add these variants to `WorkflowSseEvent`:

```ts
  | (WorkflowBaseFields & {
      type: 'workflow_state_changed';
      state:
        | 'check_login'
        | 'login_required'
        | 'resume_after_login'
        | 'explore_target_page'
        | 'extract_result'
        | 'generate_dsl'
        | 'replay_dsl'
        | 'success'
        | 'failed';
      message?: string;
    })
  | (WorkflowBaseFields & {
      type: 'dsl_replay_step';
      stepId: string;
      stepType: string;
      status: 'running' | 'skipped' | 'success' | 'failed';
      message?: string;
      outputPreview?: string;
      error?: string;
    })
```

Add matching Zod variants to `workflowSseEventSchema`:

```ts
  baseFieldsSchema.extend({
    type: z.literal('workflow_state_changed'),
    state: z.enum([
      'check_login',
      'login_required',
      'resume_after_login',
      'explore_target_page',
      'extract_result',
      'generate_dsl',
      'replay_dsl',
      'success',
      'failed',
    ]),
    message: z.string().optional(),
  }),
  baseFieldsSchema.extend({
    type: z.literal('dsl_replay_step'),
    stepId: z.string().min(1),
    stepType: z.string().min(1),
    status: z.enum(['running', 'skipped', 'success', 'failed']),
    message: z.string().optional(),
    outputPreview: z.string().optional(),
    error: z.string().optional(),
  }),
```

- [ ] **Step 4: Run the parser test and confirm it passes**

Run: `pnpm exec jest src/lib/workflow-learning/parse-sse.test.ts --runInBand`

Expected: pass.

- [ ] **Step 5: Commit this task if the user requested commits**

```bash
git add src/lib/workflow-learning/types.ts src/lib/workflow-learning/parse-sse.test.ts
git commit -m "feat(workflow-learning): add state and replay SSE events"
```

---

### Task 2: Add Intent Router and BOSS Config

**Files:**

- Create: `src/lib/workflow-learning/intent-router.ts`
- Create: `src/lib/workflow-learning/intent-router.test.ts`
- Create: `src/lib/workflow-learning/boss-config.ts`

- [ ] **Step 1: Write failing intent-router tests**

Create `src/lib/workflow-learning/intent-router.test.ts`:

```ts
import { routeWorkflowIntent } from './intent-router';

describe('routeWorkflowIntent', () => {
  it('routes ordinary chat without browser work', () => {
    expect(routeWorkflowIntent('你好，介绍一下你自己')).toEqual({ type: 'chat' });
  });

  it('routes BOSS home opening', () => {
    expect(routeWorkflowIntent('打开 BOSS 首页')).toEqual({ type: 'boss_open_home' });
    expect(routeWorkflowIntent('打开boss')).toEqual({ type: 'boss_open_home' });
  });

  it('routes BOSS first message extraction', () => {
    expect(routeWorkflowIntent('打开 BOSS 消息页并返回第一条信息')).toEqual({
      type: 'boss_read_first_message',
    });
  });

  it('routes login completion', () => {
    expect(routeWorkflowIntent('已登录')).toEqual({ type: 'login_completed' });
    expect(routeWorkflowIntent('我已经登录好了')).toEqual({ type: 'login_completed' });
  });

  it('routes DSL generation', () => {
    expect(routeWorkflowIntent('生成指令')).toEqual({ type: 'generate_dsl' });
    expect(routeWorkflowIntent('效果没问题，生成 DSL')).toEqual({ type: 'generate_dsl' });
  });

  it('routes unsupported browser workflow separately from chat', () => {
    expect(routeWorkflowIntent('打开淘宝首页')).toEqual({ type: 'unknown_workflow' });
  });
});
```

- [ ] **Step 2: Run the intent-router test and confirm it fails**

Run: `pnpm exec jest src/lib/workflow-learning/intent-router.test.ts --runInBand`

Expected: fail because the module does not exist.

- [ ] **Step 3: Implement BOSS config**

Create `src/lib/workflow-learning/boss-config.ts`:

```ts
import type { LoginSuccessCriteria } from '@/lib/workflow-learning/tools/browser-session';

export const BOSS_HOME_URL = 'https://www.zhipin.com/';
export const BOSS_LOGIN_URL = 'https://www.zhipin.com/web/user/';
export const BOSS_MESSAGES_URL = 'https://www.zhipin.com/web/geek/chat';
export const BOSS_FIRST_MESSAGE_OUTPUT_KEY = 'firstMessage';

export const BOSS_LOGIN_SUCCESS: LoginSuccessCriteria = {
  urlNotIncludes: ['/web/user'],
  textIncludes: ['消息', '沟通', '职位'],
};

export const BOSS_LOGIN_REQUIRED = {
  urlIncludes: ['/web/user'],
  textIncludes: ['扫码', '登录', '微信'],
};
```

- [ ] **Step 4: Implement intent router**

Create `src/lib/workflow-learning/intent-router.ts`:

```ts
export type WorkflowIntent =
  | { type: 'chat' }
  | { type: 'boss_open_home' }
  | { type: 'boss_read_first_message' }
  | { type: 'login_completed' }
  | { type: 'generate_dsl' }
  | { type: 'unknown_workflow' };

export function routeWorkflowIntent(input: string): WorkflowIntent {
  const text = input.trim();
  const lower = text.toLowerCase();

  if (/^(已登录|已经登录|我已登录|我已经登录|登录好了|已完成登录)/i.test(text)) {
    return { type: 'login_completed' };
  }

  if (/生成\s*(指令|dsl|工作流)|生成.*(指令|dsl|工作流)/i.test(text)) {
    return { type: 'generate_dsl' };
  }

  const mentionsBoss = /boss|zhipin|直聘/i.test(text);
  const mentionsMessage = /消息|沟通|聊天|第一条|首条/i.test(text);
  const openIntent = /打开|open|进入|查看|读取|返回/i.test(text);

  if (mentionsBoss && mentionsMessage && openIntent) {
    return { type: 'boss_read_first_message' };
  }

  if (mentionsBoss && (openIntent || lower === 'boss')) {
    return { type: 'boss_open_home' };
  }

  if (openIntent) {
    return { type: 'unknown_workflow' };
  }

  return { type: 'chat' };
}
```

- [ ] **Step 5: Run the intent-router test and confirm it passes**

Run: `pnpm exec jest src/lib/workflow-learning/intent-router.test.ts --runInBand`

Expected: pass.

- [ ] **Step 6: Commit this task if the user requested commits**

```bash
git add src/lib/workflow-learning/intent-router.ts src/lib/workflow-learning/intent-router.test.ts src/lib/workflow-learning/boss-config.ts
git commit -m "feat(workflow-learning): add workflow intent router"
```

---

### Task 3: Add Browser Session Primitives

**Files:**

- Modify: `src/lib/workflow-learning/tools/browser-session.ts`
- Modify: `src/lib/workflow-learning/tools/browser-session.test.ts`

- [ ] **Step 1: Write failing tests for inspect, navigate, wait, and extract**

Append these tests to `src/lib/workflow-learning/tools/browser-session.test.ts`:

```ts
it('checks login on the current page without navigating', async () => {
  const fake = createFakeChromium({
    url: 'https://example.com/messages',
    title: 'Messages',
    body: '消息列表 第一条消息',
  });
  const manager = new BrowserSessionManager({ chromium: fake.chromium });

  await manager.snapshot({ sessionId: 's1', url: 'https://example.com/messages' });
  const result = await manager.inspectLogin({
    sessionId: 's1',
    success: { textIncludes: ['消息'] },
  });

  expect(result.loggedIn).toBe(true);
  expect(fake.page.goto).toHaveBeenCalledTimes(1);
  await manager.close('s1');
});

it('navigates an existing session and extracts text', async () => {
  const fake = createFakeChromium({
    url: 'https://example.com',
    title: 'Example',
    body: '第一条消息：你好',
  });
  const manager = new BrowserSessionManager({ chromium: fake.chromium });

  await manager.snapshot({ sessionId: 's1', url: 'https://example.com' });
  await manager.navigate({ sessionId: 's1', url: 'https://example.com/messages' });
  const extracted = await manager.extractText({
    sessionId: 's1',
    selectorHint: 'first message item',
    maxChars: 20,
  });

  expect(extracted.text).toBe('第一条消息：你好');
  expect(fake.chromium.launch).toHaveBeenCalledTimes(1);
  await manager.close('s1');
});

it('waits for text on the current page', async () => {
  const pageState = {
    url: 'https://example.com/messages',
    title: 'Messages',
    body: '加载中',
  };
  const fake = createFakeChromium(pageState);
  const manager = new BrowserSessionManager({
    chromium: fake.chromium,
    loginPollIntervalMs: 1,
  });

  await manager.snapshot({ sessionId: 's1', url: 'https://example.com/messages' });
  setTimeout(() => {
    pageState.body = '消息列表';
  }, 5);

  const result = await manager.waitForText({
    sessionId: 's1',
    text: '消息',
    timeoutMs: 100,
  });

  expect(result.found).toBe(true);
  await manager.close('s1');
});
```

- [ ] **Step 2: Run browser session tests and confirm they fail**

Run: `pnpm exec jest src/lib/workflow-learning/tools/browser-session.test.ts --runInBand`

Expected: fail because `inspectLogin`, `navigate`, `extractText`, and `waitForText` do not exist.

- [ ] **Step 3: Extend `PageLike` and add public methods**

In `src/lib/workflow-learning/tools/browser-session.ts`, keep existing behavior and add these methods inside `BrowserSessionManager`:

```ts
  async inspectLogin(input: {
    sessionId: string;
    success: LoginSuccessCriteria;
  }): Promise<{ sessionId: string; loggedIn: boolean; url: string; excerpt: string }> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return {
        sessionId: input.sessionId,
        loggedIn: false,
        url: '',
        excerpt: 'Browser session not found',
      };
    }
    if (!hasPositiveSuccessCriteria(input.success)) {
      return {
        sessionId: input.sessionId,
        loggedIn: false,
        url: session.page.url(),
        excerpt: 'Login success criteria must include urlIncludes or textIncludes.',
      };
    }
    return this.checkLogin(input.sessionId, session, input.success);
  }

  async navigate(input: { sessionId: string; url: string }): Promise<{
    sessionId: string;
    requestedUrl: string;
    url: string;
    title: string;
    excerpt: string;
    urlMatchesRequested: boolean;
  }> {
    assertUrlAllowed(input.url);
    const session = await this.getOrCreateSession(input.sessionId, false);
    await session.page.goto(input.url, {
      timeout: WORKFLOW_PLAYWRIGHT_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    const title = await session.page.title();
    const body = await this.readBodyText(session.page);
    return {
      sessionId: input.sessionId,
      requestedUrl: input.url,
      url: session.page.url(),
      title,
      excerpt: body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS),
      urlMatchesRequested: urlsMatch(input.url, session.page.url()),
    };
  }

  async waitForText(input: {
    sessionId: string;
    text: string;
    timeoutMs?: number;
  }): Promise<{ sessionId: string; found: boolean; url: string; excerpt: string }> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return { sessionId: input.sessionId, found: false, url: '', excerpt: 'Browser session not found' };
    }
    const deadline = Date.now() + (input.timeoutMs ?? WORKFLOW_PLAYWRIGHT_TIMEOUT_MS);
    let body = await this.readBodyText(session.page);
    while (!body.includes(input.text) && Date.now() < deadline) {
      await sleep(this.options.loginPollIntervalMs ?? DEFAULT_LOGIN_POLL_INTERVAL_MS);
      body = await this.readBodyText(session.page);
    }
    return {
      sessionId: input.sessionId,
      found: body.includes(input.text),
      url: session.page.url(),
      excerpt: body.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS),
    };
  }

  async extractText(input: {
    sessionId: string;
    selectorHint?: string;
    maxChars?: number;
  }): Promise<{ sessionId: string; text: string; url: string }> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return { sessionId: input.sessionId, text: '', url: '' };
    }
    const body = await this.readBodyText(session.page);
    return {
      sessionId: input.sessionId,
      text: body.slice(0, input.maxChars ?? WORKFLOW_TOOL_RESULT_MAX_CHARS).trim(),
      url: session.page.url(),
    };
  }
```

- [ ] **Step 4: Run browser session tests and confirm they pass**

Run: `pnpm exec jest src/lib/workflow-learning/tools/browser-session.test.ts --runInBand`

Expected: pass.

- [ ] **Step 5: Commit this task if the user requested commits**

```bash
git add src/lib/workflow-learning/tools/browser-session.ts src/lib/workflow-learning/tools/browser-session.test.ts
git commit -m "feat(workflow-learning): add browser session primitives"
```

---

### Task 4: Add Workflow Session Store

**Files:**

- Create: `src/lib/workflow-learning/workflow-session-store.ts`
- Create: `src/lib/workflow-learning/workflow-session-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/workflow-learning/workflow-session-store.test.ts`:

```ts
import { WorkflowSessionStore } from './workflow-session-store';

describe('WorkflowSessionStore', () => {
  it('stores and resumes pending tasks by session id', () => {
    const store = new WorkflowSessionStore();

    store.setPendingTask('s1', 'boss_read_first_message');

    expect(store.get('s1')).toMatchObject({
      pendingTask: 'boss_read_first_message',
      loginStatus: 'unknown',
    });
  });

  it('records successful traces and clears pending tasks', () => {
    const store = new WorkflowSessionStore();
    store.setPendingTask('s1', 'boss_open_home');
    store.recordSuccess('s1', {
      task: 'boss_open_home',
      trace: [{ step: 'open', result: 'ok' }],
      outputs: { page: 'home' },
    });

    expect(store.get('s1')).toMatchObject({
      pendingTask: undefined,
      lastSuccessfulTrace: [{ step: 'open', result: 'ok' }],
      outputs: { page: 'home' },
    });
  });
});
```

- [ ] **Step 2: Run store tests and confirm they fail**

Run: `pnpm exec jest src/lib/workflow-learning/workflow-session-store.test.ts --runInBand`

Expected: fail because the module does not exist.

- [ ] **Step 3: Implement store**

Create `src/lib/workflow-learning/workflow-session-store.ts`:

```ts
export type BossWorkflowTask = 'boss_open_home' | 'boss_read_first_message';

export type WorkflowTraceEntry = {
  step: string;
  result?: unknown;
  error?: string;
};

export type WorkflowSessionRecord = {
  pendingTask?: BossWorkflowTask;
  lastSuccessfulTask?: BossWorkflowTask;
  lastSuccessfulTrace: WorkflowTraceEntry[];
  outputs: Record<string, string>;
  loginStatus: 'unknown' | 'logged_in' | 'logged_out';
};

export class WorkflowSessionStore {
  private readonly records = new Map<string, WorkflowSessionRecord>();

  get(sessionId: string): WorkflowSessionRecord {
    const existing = this.records.get(sessionId);
    if (existing) return existing;
    const created: WorkflowSessionRecord = {
      lastSuccessfulTrace: [],
      outputs: {},
      loginStatus: 'unknown',
    };
    this.records.set(sessionId, created);
    return created;
  }

  setPendingTask(sessionId: string, task: BossWorkflowTask): void {
    const record = this.get(sessionId);
    record.pendingTask = task;
  }

  setLoginStatus(sessionId: string, status: WorkflowSessionRecord['loginStatus']): void {
    this.get(sessionId).loginStatus = status;
  }

  recordSuccess(
    sessionId: string,
    input: {
      task: BossWorkflowTask;
      trace: WorkflowTraceEntry[];
      outputs?: Record<string, string>;
    },
  ): void {
    const record = this.get(sessionId);
    record.pendingTask = undefined;
    record.lastSuccessfulTask = input.task;
    record.lastSuccessfulTrace = input.trace;
    record.outputs = input.outputs ?? {};
    record.loginStatus = 'logged_in';
  }
}

export const workflowSessionStore = new WorkflowSessionStore();
```

- [ ] **Step 4: Run store tests and confirm they pass**

Run: `pnpm exec jest src/lib/workflow-learning/workflow-session-store.test.ts --runInBand`

Expected: pass.

- [ ] **Step 5: Commit this task if the user requested commits**

```bash
git add src/lib/workflow-learning/workflow-session-store.ts src/lib/workflow-learning/workflow-session-store.test.ts
git commit -m "feat(workflow-learning): add workflow session store"
```

---

### Task 5: Add DSL Runner

**Files:**

- Create: `src/lib/workflow-learning/dsl-runner.ts`
- Create: `src/lib/workflow-learning/dsl-runner.test.ts`

- [ ] **Step 1: Write failing DSL runner tests**

Create `src/lib/workflow-learning/dsl-runner.test.ts`:

```ts
import type { WorkflowDsl } from './dsl';
import { runWorkflowDsl } from './dsl-runner';

function createManager(loggedIn: boolean) {
  return {
    inspectLogin: jest.fn(async () => ({
      sessionId: 's1',
      loggedIn,
      url: 'https://www.zhipin.com/web/geek/chat',
      excerpt: loggedIn ? '消息列表' : '扫码登录',
    })),
    openLogin: jest.fn(async () => ({
      sessionId: 's1',
      loginUrl: 'https://www.zhipin.com/web/user/',
    })),
    navigate: jest.fn(async () => ({
      sessionId: 's1',
      requestedUrl: 'https://www.zhipin.com/web/geek/chat',
      url: 'https://www.zhipin.com/web/geek/chat',
      title: 'BOSS',
      excerpt: '消息列表 第一条消息',
      urlMatchesRequested: true,
    })),
    waitForText: jest.fn(async () => ({
      sessionId: 's1',
      found: true,
      url: 'https://www.zhipin.com/web/geek/chat',
      excerpt: '消息列表',
    })),
    extractText: jest.fn(async () => ({
      sessionId: 's1',
      text: '第一条消息',
      url: 'https://www.zhipin.com/web/geek/chat',
    })),
  };
}

const workflow: WorkflowDsl = {
  schemaVersion: '1.0',
  metadata: {
    name: 'Read first Boss message',
    description: 'Read the first visible BOSS message.',
    domain: 'recruiting',
  },
  steps: [
    {
      id: 'check-login',
      type: 'check_login',
      target: {
        url: 'https://www.zhipin.com/web/geek/chat',
        detector: { loggedInTextIncludes: ['消息'] },
      },
    },
    {
      id: 'login',
      type: 'login',
      dependsOn: ['check-login'],
      method: 'qr_code',
      targetUrl: 'https://www.zhipin.com/web/user/',
      success: { textIncludes: ['消息'] },
    },
    {
      id: 'open-messages',
      type: 'browser_action',
      dependsOn: ['login'],
      action: 'navigate',
      target: { url: 'https://www.zhipin.com/web/geek/chat' },
    },
    {
      id: 'extract-first-message',
      type: 'browser_action',
      dependsOn: ['open-messages'],
      action: 'extract_text',
      target: { selectorHint: 'first message item' },
      outputKey: 'firstMessage',
    },
    {
      id: 'assert-first-message',
      type: 'assertion',
      dependsOn: ['extract-first-message'],
      expect: { outputKey: 'firstMessage' },
    },
  ],
};

describe('runWorkflowDsl', () => {
  it('skips login when check_login is already successful', async () => {
    const manager = createManager(true);
    const events = [];

    const result = await runWorkflowDsl({
      workflow,
      sessionId: 's1',
      manager: manager as never,
      emit: (event) => events.push(event),
    });

    expect(result.ok).toBe(true);
    expect(result.outputs.firstMessage).toBe('第一条消息');
    expect(manager.openLogin).not.toHaveBeenCalled();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'dsl_replay_step', stepId: 'login', status: 'skipped' }),
      ]),
    );
  });

  it('returns awaiting_login when login is required during replay', async () => {
    const manager = createManager(false);

    const result = await runWorkflowDsl({
      workflow,
      sessionId: 's1',
      manager: manager as never,
      emit: jest.fn(),
    });

    expect(result.ok).toBe(false);
    expect(result.awaitingLogin).toEqual({
      loginUrl: 'https://www.zhipin.com/web/user/',
    });
    expect(manager.openLogin).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run DSL runner tests and confirm they fail**

Run: `pnpm exec jest src/lib/workflow-learning/dsl-runner.test.ts --runInBand`

Expected: fail because the module does not exist.

- [ ] **Step 3: Implement DSL runner**

Create `src/lib/workflow-learning/dsl-runner.ts`:

```ts
import type { WorkflowDsl, WorkflowStep } from '@/lib/workflow-learning/dsl';
import type { WorkflowSseEvent } from '@/lib/workflow-learning/types';
import type { BrowserSessionManager } from '@/lib/workflow-learning/tools/browser-session';

type ReplayEvent = Omit<WorkflowSseEvent, 'runId' | 'timestamp'>;

type RunnerManager = Pick<
  BrowserSessionManager,
  'inspectLogin' | 'openLogin' | 'navigate' | 'waitForText' | 'extractText'
>;

export type DslRunnerResult =
  | { ok: true; outputs: Record<string, string> }
  | {
      ok: false;
      outputs: Record<string, string>;
      error?: string;
      awaitingLogin?: { loginUrl: string };
    };

export async function runWorkflowDsl(input: {
  workflow: WorkflowDsl;
  sessionId: string;
  manager: RunnerManager;
  emit: (event: ReplayEvent) => void;
}): Promise<DslRunnerResult> {
  const outputs: Record<string, string> = {};
  let loggedIn = false;

  for (const step of sortSteps(input.workflow.steps)) {
    input.emit({
      type: 'dsl_replay_step',
      stepId: step.id,
      stepType: step.type,
      status: 'running',
    });

    try {
      if (step.type === 'check_login') {
        const result = await input.manager.inspectLogin({
          sessionId: input.sessionId,
          success: {
            urlIncludes: step.target.detector.loggedInUrlIncludes,
            textIncludes: step.target.detector.loggedInTextIncludes,
            urlNotIncludes: step.target.detector.loginUrlIncludes,
          },
        });
        loggedIn = result.loggedIn;
        input.emit({
          type: 'dsl_replay_step',
          stepId: step.id,
          stepType: step.type,
          status: result.loggedIn ? 'success' : 'failed',
          message: result.loggedIn ? 'Login already verified' : 'Login required',
          outputPreview: result.excerpt,
        });
        continue;
      }

      if (step.type === 'login') {
        if (loggedIn) {
          input.emit({
            type: 'dsl_replay_step',
            stepId: step.id,
            stepType: step.type,
            status: 'skipped',
            message: 'Skipped because check_login succeeded',
          });
          continue;
        }
        await input.manager.openLogin({
          sessionId: input.sessionId,
          loginUrl: step.targetUrl,
        });
        input.emit({
          type: 'dsl_replay_step',
          stepId: step.id,
          stepType: step.type,
          status: 'failed',
          message: 'Login required before replay can continue',
        });
        return { ok: false, outputs, awaitingLogin: { loginUrl: step.targetUrl } };
      }

      if (step.type === 'browser_action') {
        await runBrowserAction(step, input.sessionId, input.manager, outputs);
        input.emit({
          type: 'dsl_replay_step',
          stepId: step.id,
          stepType: step.type,
          status: 'success',
          outputPreview: step.outputKey ? outputs[step.outputKey] : undefined,
        });
        continue;
      }

      if (step.type === 'assertion') {
        const outputOk = step.expect.outputKey
          ? Boolean(outputs[step.expect.outputKey]?.trim())
          : true;
        if (!outputOk) {
          throw new Error(`Missing output for ${step.expect.outputKey}`);
        }
        input.emit({
          type: 'dsl_replay_step',
          stepId: step.id,
          stepType: step.type,
          status: 'success',
          outputPreview: step.expect.outputKey ? outputs[step.expect.outputKey] : undefined,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown DSL replay error';
      input.emit({
        type: 'dsl_replay_step',
        stepId: step.id,
        stepType: step.type,
        status: 'failed',
        error: message,
      });
      return { ok: false, outputs, error: message };
    }
  }

  return { ok: true, outputs };
}

async function runBrowserAction(
  step: Extract<WorkflowStep, { type: 'browser_action' }>,
  sessionId: string,
  manager: RunnerManager,
  outputs: Record<string, string>,
): Promise<void> {
  if (step.action === 'navigate') {
    await manager.navigate({ sessionId, url: step.target.url ?? '' });
    return;
  }
  if (step.action === 'wait_for_text') {
    const result = await manager.waitForText({ sessionId, text: step.target.text ?? '' });
    if (!result.found) throw new Error(`Text not found: ${step.target.text}`);
    return;
  }
  if (step.action === 'extract_text') {
    const result = await manager.extractText({
      sessionId,
      selectorHint: step.target.selectorHint,
    });
    outputs[step.outputKey ?? 'output'] = result.text;
    return;
  }
  throw new Error(`Unsupported browser action: ${step.action}`);
}

function sortSteps(steps: WorkflowDsl['steps']): WorkflowDsl['steps'] {
  return [...steps].sort((a, b) => {
    if (b.dependsOn?.includes(a.id)) return -1;
    if (a.dependsOn?.includes(b.id)) return 1;
    return 0;
  });
}
```

- [ ] **Step 4: Run DSL runner tests and confirm they pass**

Run: `pnpm exec jest src/lib/workflow-learning/dsl-runner.test.ts --runInBand`

Expected: pass.

- [ ] **Step 5: Commit this task if the user requested commits**

```bash
git add src/lib/workflow-learning/dsl-runner.ts src/lib/workflow-learning/dsl-runner.test.ts
git commit -m "feat(workflow-learning): add DSL replay runner"
```

---

### Task 6: Add BOSS Workflow State Machine

**Files:**

- Create: `src/lib/workflow-learning/boss-workflow.ts`
- Create: `src/lib/workflow-learning/boss-workflow.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

Create `src/lib/workflow-learning/boss-workflow.test.ts`:

```ts
import { runBossWorkflowIntent } from './boss-workflow';
import { WorkflowSessionStore } from './workflow-session-store';

function createManager(loggedIn: boolean, extractedText = '第一条消息') {
  return {
    inspectLogin: jest.fn(async () => ({
      sessionId: 's1',
      loggedIn,
      url: loggedIn ? 'https://www.zhipin.com/web/geek/chat' : 'https://www.zhipin.com/web/user/',
      excerpt: loggedIn ? '消息列表' : '扫码登录',
    })),
    openLogin: jest.fn(async () => ({
      sessionId: 's1',
      loginUrl: 'https://www.zhipin.com/web/user/',
    })),
    navigate: jest.fn(async ({ url }: { url: string }) => ({
      sessionId: 's1',
      requestedUrl: url,
      url,
      title: 'BOSS',
      excerpt: '消息列表',
      urlMatchesRequested: true,
    })),
    extractText: jest.fn(async () => ({
      sessionId: 's1',
      text: extractedText,
      url: 'https://www.zhipin.com/web/geek/chat',
    })),
    waitForText: jest.fn(),
  };
}

describe('runBossWorkflowIntent', () => {
  it('stores pending task and emits awaiting_login when logged out', async () => {
    const store = new WorkflowSessionStore();
    const manager = createManager(false);
    const events = [];

    await runBossWorkflowIntent({
      intent: { type: 'boss_read_first_message' },
      runId: 'r1',
      sessionId: 's1',
      manager: manager as never,
      store,
      emit: (event) => events.push(event),
      generateDsl: jest.fn(),
    });

    expect(store.get('s1').pendingTask).toBe('boss_read_first_message');
    expect(manager.openLogin).toHaveBeenCalled();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'awaiting_login' }),
        expect.objectContaining({ type: 'workflow_state_changed', state: 'login_required' }),
      ]),
    );
  });

  it('resumes pending task after login completion', async () => {
    const store = new WorkflowSessionStore();
    store.setPendingTask('s1', 'boss_read_first_message');
    const manager = createManager(true, '候选人：你好');
    const events = [];

    await runBossWorkflowIntent({
      intent: { type: 'login_completed' },
      runId: 'r1',
      sessionId: 's1',
      manager: manager as never,
      store,
      emit: (event) => events.push(event),
      generateDsl: jest.fn(),
    });

    expect(store.get('s1').pendingTask).toBeUndefined();
    expect(store.get('s1').outputs.firstMessage).toBe('候选人：你好');
    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'login_verified' })]),
    );
  });
});
```

- [ ] **Step 2: Run BOSS workflow tests and confirm they fail**

Run: `pnpm exec jest src/lib/workflow-learning/boss-workflow.test.ts --runInBand`

Expected: fail because the module does not exist.

- [ ] **Step 3: Implement BOSS workflow state machine**

Create `src/lib/workflow-learning/boss-workflow.ts` with this public shape:

```ts
import {
  BOSS_FIRST_MESSAGE_OUTPUT_KEY,
  BOSS_HOME_URL,
  BOSS_LOGIN_SUCCESS,
  BOSS_LOGIN_URL,
  BOSS_MESSAGES_URL,
} from '@/lib/workflow-learning/boss-config';
import type { WorkflowDsl } from '@/lib/workflow-learning/dsl';
import { runWorkflowDsl } from '@/lib/workflow-learning/dsl-runner';
import type { WorkflowIntent } from '@/lib/workflow-learning/intent-router';
import type { BrowserSessionManager } from '@/lib/workflow-learning/tools/browser-session';
import type { WorkflowSseEvent } from '@/lib/workflow-learning/types';
import { type BossWorkflowTask, type WorkflowSessionStore } from './workflow-session-store';

type EventInput = Omit<WorkflowSseEvent, 'runId' | 'timestamp'>;
type BossManager = Pick<
  BrowserSessionManager,
  'inspectLogin' | 'openLogin' | 'navigate' | 'extractText' | 'waitForText'
>;

export async function runBossWorkflowIntent(input: {
  intent: Exclude<WorkflowIntent, { type: 'chat' | 'unknown_workflow' }>;
  runId: string;
  sessionId: string;
  manager: BossManager;
  store: WorkflowSessionStore;
  emit: (event: EventInput) => void;
  generateDsl: (trace: unknown[]) => Promise<WorkflowDsl | null>;
}): Promise<void> {
  const emit = (event: EventInput) => input.emit(event);

  if (input.intent.type === 'boss_open_home') {
    await runProtectedBossTask({ ...input, task: 'boss_open_home', emit });
    return;
  }

  if (input.intent.type === 'boss_read_first_message') {
    await runProtectedBossTask({ ...input, task: 'boss_read_first_message', emit });
    return;
  }

  if (input.intent.type === 'login_completed') {
    await resumeAfterLogin(input);
    return;
  }

  if (input.intent.type === 'generate_dsl') {
    await generateAndReplayDsl(input);
  }
}
```

Add helper functions in the same file:

```ts
async function runProtectedBossTask(input: {
  task: BossWorkflowTask;
  sessionId: string;
  manager: BossManager;
  store: WorkflowSessionStore;
  emit: (event: EventInput) => void;
}): Promise<void> {
  input.emit({
    type: 'workflow_state_changed',
    state: 'check_login',
    message: 'Checking BOSS login',
  });
  const login = await input.manager.inspectLogin({
    sessionId: input.sessionId,
    success: BOSS_LOGIN_SUCCESS,
  });

  if (!login.loggedIn) {
    input.store.setPendingTask(input.sessionId, input.task);
    input.store.setLoginStatus(input.sessionId, 'logged_out');
    input.emit({
      type: 'workflow_state_changed',
      state: 'login_required',
      message: 'BOSS login required',
    });
    await input.manager.openLogin({ sessionId: input.sessionId, loginUrl: BOSS_LOGIN_URL });
    input.emit({
      type: 'awaiting_login',
      sessionId: input.sessionId,
      loginUrl: BOSS_LOGIN_URL,
      message: '请在已打开的浏览器窗口中扫码登录 BOSS 直聘，完成后回复“已登录”。',
    });
    input.emit({
      type: 'assistant_final',
      text: '需要先登录 BOSS 直聘。我已经打开登录页，请扫码登录，完成后回复“已登录”。',
    });
    return;
  }

  input.store.setLoginStatus(input.sessionId, 'logged_in');
  if (input.task === 'boss_open_home') {
    await openBossHome(input);
    return;
  }
  await readFirstBossMessage(input);
}

async function openBossHome(input: {
  sessionId: string;
  manager: BossManager;
  store: WorkflowSessionStore;
  emit: (event: EventInput) => void;
}): Promise<void> {
  input.emit({
    type: 'workflow_state_changed',
    state: 'explore_target_page',
    message: 'Opening BOSS home',
  });
  const nav = await input.manager.navigate({ sessionId: input.sessionId, url: BOSS_HOME_URL });
  input.store.recordSuccess(input.sessionId, {
    task: 'boss_open_home',
    trace: [
      { step: 'check_login', result: 'logged_in' },
      { step: 'navigate', result: nav.url },
    ],
    outputs: { pageUrl: nav.url },
  });
  input.emit({ type: 'workflow_state_changed', state: 'success', message: 'BOSS home opened' });
  input.emit({ type: 'assistant_final', text: `已打开 BOSS 首页：${nav.url}。页面会保持打开。` });
}

async function readFirstBossMessage(input: {
  sessionId: string;
  manager: BossManager;
  store: WorkflowSessionStore;
  emit: (event: EventInput) => void;
}): Promise<void> {
  input.emit({
    type: 'workflow_state_changed',
    state: 'explore_target_page',
    message: 'Opening BOSS messages',
  });
  const nav = await input.manager.navigate({ sessionId: input.sessionId, url: BOSS_MESSAGES_URL });
  input.emit({
    type: 'workflow_state_changed',
    state: 'extract_result',
    message: 'Extracting first message',
  });
  const extracted = await input.manager.extractText({
    sessionId: input.sessionId,
    selectorHint: 'first message item in BOSS message list',
  });
  input.store.recordSuccess(input.sessionId, {
    task: 'boss_read_first_message',
    trace: [
      { step: 'check_login', result: 'logged_in' },
      { step: 'navigate', result: nav.url },
      { step: 'extract_text', result: extracted.text },
    ],
    outputs: { [BOSS_FIRST_MESSAGE_OUTPUT_KEY]: extracted.text },
  });
  input.emit({
    type: 'workflow_state_changed',
    state: 'success',
    message: 'First BOSS message extracted',
  });
  input.emit({ type: 'assistant_final', text: extracted.text || '未读取到第一条消息内容。' });
}
```

Add resume and DSL helpers:

```ts
async function resumeAfterLogin(input: {
  sessionId: string;
  manager: BossManager;
  store: WorkflowSessionStore;
  emit: (event: EventInput) => void;
  generateDsl: (trace: unknown[]) => Promise<WorkflowDsl | null>;
}): Promise<void> {
  input.emit({
    type: 'workflow_state_changed',
    state: 'resume_after_login',
    message: 'Verifying login',
  });
  const login = await input.manager.inspectLogin({
    sessionId: input.sessionId,
    success: BOSS_LOGIN_SUCCESS,
  });
  if (!login.loggedIn) {
    input.store.setLoginStatus(input.sessionId, 'logged_out');
    input.emit({
      type: 'assistant_final',
      text: '还没有检测到 BOSS 登录成功，请继续完成扫码登录后再回复“已登录”。',
    });
    return;
  }
  input.store.setLoginStatus(input.sessionId, 'logged_in');
  input.emit({ type: 'login_verified', sessionId: input.sessionId });
  const pendingTask = input.store.get(input.sessionId).pendingTask;
  if (!pendingTask) {
    input.emit({ type: 'assistant_final', text: '已检测到 BOSS 登录成功。' });
    return;
  }
  await runProtectedBossTask({ ...input, task: pendingTask });
}

async function generateAndReplayDsl(input: {
  sessionId: string;
  manager: BossManager;
  store: WorkflowSessionStore;
  emit: (event: EventInput) => void;
  generateDsl: (trace: unknown[]) => Promise<WorkflowDsl | null>;
}): Promise<void> {
  const record = input.store.get(input.sessionId);
  if (!record.lastSuccessfulTrace.length) {
    input.emit({ type: 'assistant_final', text: '请先完成一次可执行的 workflow，再生成指令。' });
    return;
  }
  input.emit({ type: 'workflow_state_changed', state: 'generate_dsl', message: 'Generating DSL' });
  const workflow = await input.generateDsl(record.lastSuccessfulTrace);
  if (!workflow) {
    input.emit({
      type: 'dsl_validation_result',
      ok: false,
      error: 'Unable to generate valid Workflow DSL',
    });
    input.emit({ type: 'assistant_final', text: 'DSL 生成失败：没有得到符合 schema 的指令。' });
    return;
  }
  input.emit({ type: 'workflow_state_changed', state: 'replay_dsl', message: 'Replaying DSL' });
  const replay = await runWorkflowDsl({
    workflow,
    sessionId: input.sessionId,
    manager: input.manager,
    emit: input.emit,
  });
  if (!replay.ok) {
    input.emit({
      type: 'dsl_validation_result',
      ok: false,
      error: replay.error ?? 'DSL replay did not complete',
    });
    input.emit({
      type: 'assistant_final',
      text: `DSL 回放失败：${replay.error ?? '需要登录或步骤未完成'}`,
    });
    return;
  }
  input.emit({ type: 'dsl_validation_result', ok: true });
  input.emit({ type: 'workflow_dsl', workflow });
  input.emit({ type: 'assistant_final', text: 'DSL 已生成并回放成功。' });
}
```

- [ ] **Step 4: Run BOSS workflow tests and confirm they pass**

Run: `pnpm exec jest src/lib/workflow-learning/boss-workflow.test.ts --runInBand`

Expected: pass.

- [ ] **Step 5: Commit this task if the user requested commits**

```bash
git add src/lib/workflow-learning/boss-workflow.ts src/lib/workflow-learning/boss-workflow.test.ts
git commit -m "feat(workflow-learning): add BOSS workflow state machine"
```

---

### Task 7: Integrate Deterministic Workflow Path in Agent Runner

**Files:**

- Modify: `src/lib/workflow-learning/agent-runner.ts`
- Modify: `src/lib/workflow-learning/agent-runner.test.ts`

- [ ] **Step 1: Add unit tests for routing helpers**

Extend `src/lib/workflow-learning/agent-runner.test.ts` with focused helper-level coverage:

```ts
import { routeWorkflowIntent } from './intent-router';

describe('workflow deterministic routing', () => {
  it('routes BOSS workflow prompts before ReAct fallback', () => {
    expect(routeWorkflowIntent('打开 BOSS 消息页并返回第一条信息')).toEqual({
      type: 'boss_read_first_message',
    });
  });
});
```

- [ ] **Step 2: Run agent runner tests and confirm existing imports still pass**

Run: `pnpm exec jest src/lib/workflow-learning/agent-runner.test.ts --runInBand`

Expected: pass after Task 2 exists. If it fails due to import ordering, fix the import order without changing behavior.

- [ ] **Step 3: Add deterministic branch in `runWorkflowAgentWithEvents`**

In `src/lib/workflow-learning/agent-runner.ts`, import:

```ts
import { runBossWorkflowIntent } from '@/lib/workflow-learning/boss-workflow';
import { routeWorkflowIntent } from '@/lib/workflow-learning/intent-router';
import { workflowSessionStore } from '@/lib/workflow-learning/workflow-session-store';
```

Inside `runWorkflowAgentWithEvents`, after `yield { type: 'run_start', ... }` and before the existing `openOnly` branch, add:

```ts
  const routedIntent = routeWorkflowIntent(userText);
  if (
    routedIntent.type === 'boss_open_home' ||
    routedIntent.type === 'boss_read_first_message' ||
    routedIntent.type === 'login_completed' ||
    routedIntent.type === 'generate_dsl'
  ) {
    const emit = (event: Omit<WorkflowSseEvent, 'runId' | 'timestamp'>): WorkflowSseEvent => ({
      ...event,
      runId,
      timestamp: ts(),
    } as WorkflowSseEvent);

    try {
      const model = buildModel();
      await runBossWorkflowIntent({
        intent: routedIntent,
        runId,
        sessionId,
        manager: workflowBrowserSessionManager,
        store: workflowSessionStore,
        emit: (event) => {
          pendingEvents.push(emit(event));
        },
        generateDsl: async (trace) =>
          generateWorkflowDslFromTrace(model, userText, trace),
      });
      for (const event of pendingEvents) {
        yield event;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown workflow error';
      yield { type: 'error', runId, timestamp: ts(), message };
    } finally {
      yield { type: 'run_end', runId, timestamp: ts() };
    }
    return;
  }
```

Declare the queue before this block:

```ts
const pendingEvents: WorkflowSseEvent[] = [];
```

Add a helper near `repairWorkflowDsl`:

```ts
async function generateWorkflowDslFromTrace(
  model: ChatOpenAI,
  userText: string,
  trace: unknown[],
): Promise<WorkflowDsl | null> {
  const response = await model.invoke([
    new HumanMessage(`Generate Workflow DSL JSON for this completed workflow.

User request:
${userText}

Execution trace:
${JSON.stringify(trace, null, 2)}

Return only a valid JSON object using schemaVersion "1.0", metadata.domain "recruiting", and steps built from check_login, login, browser_action, and assertion.`),
  ]);
  return extractWorkflowDslFromText(extractTextFromMessageContent(response));
}
```

If TypeScript rejects yielding queued events because `runBossWorkflowIntent` is async instead of streaming, keep the queue. A later refinement can convert the orchestrator into an async generator; first-version correctness is more important than sub-event latency inside this branch.

- [ ] **Step 4: Run agent runner tests**

Run: `pnpm exec jest src/lib/workflow-learning/agent-runner.test.ts --runInBand`

Expected: pass.

- [ ] **Step 5: Commit this task if the user requested commits**

```bash
git add src/lib/workflow-learning/agent-runner.ts src/lib/workflow-learning/agent-runner.test.ts
git commit -m "feat(workflow-learning): route BOSS workflows through state machine"
```

---

### Task 8: Render New Events in Workflow UI

**Files:**

- Modify: `src/components/workflow-learning/workflow-learning-chat.tsx`

- [ ] **Step 1: Add rendering for state and replay events**

In `ExecutionTrace`, add branches before the final `return null`:

```tsx
if (ev.type === 'workflow_state_changed') {
  return (
    <li key={`${ev.runId}-state-${i}`} className="bg-muted/40 rounded-md px-3 py-2 text-xs">
      <div className="font-medium">状态 · {ev.state}</div>
      {ev.message ? <div className="mt-1 opacity-90">{ev.message}</div> : null}
    </li>
  );
}
if (ev.type === 'dsl_replay_step') {
  return (
    <li
      key={`${ev.runId}-replay-${ev.stepId}-${i}`}
      className={`rounded-md px-3 py-2 text-xs ${
        ev.status === 'failed'
          ? 'bg-destructive/10 text-destructive'
          : ev.status === 'success'
            ? 'bg-emerald-500/10'
            : ev.status === 'skipped'
              ? 'bg-sky-500/10'
              : 'bg-muted/40'
      }`}
    >
      <div className="font-medium">
        DSL 回放 · {ev.stepId} · {ev.status}
      </div>
      {ev.message ? <div className="mt-1 opacity-90">{ev.message}</div> : null}
      {ev.outputPreview ? (
        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap">{ev.outputPreview}</pre>
      ) : null}
      {ev.error ? <div className="mt-1">{ev.error}</div> : null}
    </li>
  );
}
```

- [ ] **Step 2: Check lints for the edited UI file**

Use IDE diagnostics or run: `pnpm exec eslint src/components/workflow-learning/workflow-learning-chat.tsx`

Expected: no errors. If `eslint` command is not available for a single file in this repo, run `pnpm lint` and inspect the component diagnostics.

- [ ] **Step 3: Commit this task if the user requested commits**

```bash
git add src/components/workflow-learning/workflow-learning-chat.tsx
git commit -m "feat(ui): show workflow state and DSL replay events"
```

---

### Task 9: Verification Pass

**Files:**

- Review all files touched in Tasks 1-8.

- [ ] **Step 1: Run focused workflow-learning tests**

Run:

```bash
pnpm exec jest src/lib/workflow-learning/parse-sse.test.ts src/lib/workflow-learning/intent-router.test.ts src/lib/workflow-learning/workflow-session-store.test.ts src/lib/workflow-learning/tools/browser-session.test.ts src/lib/workflow-learning/dsl-runner.test.ts src/lib/workflow-learning/boss-workflow.test.ts src/lib/workflow-learning/agent-runner.test.ts --runInBand
```

Expected: all listed suites pass.

- [ ] **Step 2: Run type-check**

Run: `pnpm type-check`

Expected: TypeScript exits successfully. If failures are unrelated pre-existing errors, record the exact unrelated files and continue only after confirming workflow-learning files are type-safe.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

Expected: no new lint errors in workflow-learning files.

- [ ] **Step 4: Manual local smoke test**

With `pnpm dev` running, open `/workflow-learning` and run:

1. `打开 BOSS 首页`
2. Complete QR login if prompted.
3. `已登录`
4. `打开 BOSS 消息页并返回第一条信息`
5. `生成指令`

Expected:

- Login is checked before BOSS protected page access.
- When logged out, the browser stays on the login page and the chat asks for QR login.
- After `已登录`, the pending task resumes automatically.
- First-message extraction returns visible text or a clear extraction failure.
- DSL replay emits replay-step events.
- DSL JSON is shown only after replay success.

- [ ] **Step 5: Final commit if the user requested commits**

```bash
git add src/lib/workflow-learning src/components/workflow-learning/workflow-learning-chat.tsx docs/superpowers/specs/2026-04-27-workflow-learning-login-dsl-design.md docs/superpowers/plans/2026-04-27-workflow-learning-login-dsl-implementation-plan.md
git commit -m "feat(workflow-learning): add BOSS login-gated DSL replay"
```

---

## Self-Review

- Spec coverage: the plan covers intent routing, BOSS-only first rules, login check, login resume, browser state retention, DSL generation, DSL replay, SSE events, UI rendering, and tests.
- Placeholder scan: no placeholder tasks remain. Each implementation task names exact files, expected tests, and concrete code shapes.
- Type consistency: event names match `workflow_state_changed` and `dsl_replay_step`; session store task names match intent names; DSL runner output key uses `firstMessage`.
- Scope control: persistence, generic site UI, automatic DSL repair, and production browser infrastructure stay out of scope.
