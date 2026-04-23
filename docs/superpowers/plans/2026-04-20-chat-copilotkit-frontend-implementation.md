# Chat CopilotKit-Style Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `/chat-copilotkit` page that reuses existing chat backend/data while delivering a CopilotKit-style UI with richer message rendering and lighter user-bubble blue.

**Architecture:** Keep backend APIs unchanged and add a new frontend route plus a dedicated `CopilotChatUI` component tree. Reuse current conversation/document operations via existing chat client functions, and introduce a markdown/GFM renderer pipeline for assistant messages. Preserve `/chat` as legacy and share the same conversation/message data.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, existing HeroUI/shadcn wrappers, `react-markdown`, `remark-gfm`.

---

## File Structure (Planned)

- Create: `src/app/chat-copilotkit/page.tsx` — new page route and auth gate parity with `/chat`.
- Create: `src/components/chat/copilot-chat-ui.tsx` — new CopilotKit-style chat UI implementation.
- Create: `src/components/chat/message-renderers/assistant-markdown.tsx` — markdown + GFM assistant renderer.
- Create: `src/components/chat/message-renderers/message-bubble.tsx` — user/assistant message shell variants.
- Create: `src/components/chat/styles.ts` — shared class presets/tokens for new chat styling.
- Modify: `src/app/chat/page.tsx` — optional cross-link to new route.
- Modify: `package.json` — add markdown rendering dependencies if missing.
- Create/Modify tests:
  - `tests/unit/components/chat/assistant-markdown.test.tsx`
  - `tests/unit/components/chat/copilot-chat-ui.test.tsx`

---

### Task 1: Add markdown/GFM renderer foundation

**Files:**

- Create: `src/components/chat/message-renderers/assistant-markdown.tsx`
- Modify: `package.json`
- Test: `tests/unit/components/chat/assistant-markdown.test.tsx`

- [ ] **Step 1: Write the failing test**

````tsx
import { render, screen } from '@testing-library/react';
import { AssistantMarkdown } from '@/components/chat/message-renderers/assistant-markdown';

describe('AssistantMarkdown', () => {
  it('renders heading, list, and code block', () => {
    render(
      <AssistantMarkdown>{'## Title\n\n- item\n\n```ts\nconst n = 1;\n```'}</AssistantMarkdown>,
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('item')).toBeInTheDocument();
    expect(screen.getByText('const n = 1;')).toBeInTheDocument();
  });
});
````

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/components/chat/assistant-markdown.test.tsx`  
Expected: FAIL due to missing `AssistantMarkdown` component/dependencies.

- [ ] **Step 3: Write minimal implementation**

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function AssistantMarkdown({ children }: { children: string }) {
  return (
    <div className="chat-markdown text-sm leading-7">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/components/chat/assistant-markdown.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json src/components/chat/message-renderers/assistant-markdown.tsx tests/unit/components/chat/assistant-markdown.test.tsx
git commit -m "feat(chat): add markdown gfm assistant renderer for copilot chat"
```

### Task 2: Build Copilot-style message bubble primitives

**Files:**

- Create: `src/components/chat/message-renderers/message-bubble.tsx`
- Create: `src/components/chat/styles.ts`
- Test: `tests/unit/components/chat/copilot-chat-ui.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '@/components/chat/message-renderers/message-bubble';

it('applies lighter user style variant', () => {
  render(<MessageBubble role="user">hello</MessageBubble>);
  expect(screen.getByText('hello').className).toContain('chat-user-bubble');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/components/chat/copilot-chat-ui.test.tsx`  
Expected: FAIL because `MessageBubble` does not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
type MessageBubbleProps = {
  role: 'user' | 'assistant';
  children: React.ReactNode;
};

export function MessageBubble({ role, children }: MessageBubbleProps) {
  return (
    <div className={role === 'user' ? 'chat-user-wrap' : 'chat-assistant-wrap'}>
      <div className={role === 'user' ? 'chat-user-bubble' : 'chat-assistant-bubble'}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/components/chat/copilot-chat-ui.test.tsx`  
Expected: PASS for bubble variant assertion.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/message-renderers/message-bubble.tsx src/components/chat/styles.ts tests/unit/components/chat/copilot-chat-ui.test.tsx
git commit -m "feat(chat): add copilot style message bubble primitives"
```

### Task 3: Implement `/chat-copilotkit` page with shared data continuity

**Files:**

- Create: `src/app/chat-copilotkit/page.tsx`
- Create: `src/components/chat/copilot-chat-ui.tsx`
- Modify: `src/app/chat/page.tsx`
- Test: `tests/unit/components/chat/copilot-chat-ui.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { CopilotChatUI } from '@/components/chat/copilot-chat-ui';

it('renders conversation shell with composer', () => {
  render(<CopilotChatUI />);
  expect(screen.getByPlaceholderText('发消息…')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/components/chat/copilot-chat-ui.test.tsx`  
Expected: FAIL due to missing CopilotChatUI.

- [ ] **Step 3: Write minimal implementation**

```tsx
// page.tsx: follow existing auth gate from /chat and render <CopilotChatUI />
// copilot-chat-ui.tsx: reuse existing client functions for conversations/messages/documents
// and render assistant via <AssistantMarkdown />, user via <MessageBubble role="user" />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/components/chat/copilot-chat-ui.test.tsx`  
Expected: PASS with chat shell/composer rendered.

- [ ] **Step 5: Commit**

```bash
git add src/app/chat-copilotkit/page.tsx src/components/chat/copilot-chat-ui.tsx src/app/chat/page.tsx tests/unit/components/chat/copilot-chat-ui.test.tsx
git commit -m "feat(chat): add copilotkit style chat route with shared data flow"
```

### Task 4: Add streaming, error, and document-context UX polish

**Files:**

- Modify: `src/components/chat/copilot-chat-ui.tsx`
- Modify: `src/components/chat/message-renderers/assistant-markdown.tsx`
- Test: `tests/unit/components/chat/copilot-chat-ui.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('shows inline assistant error module on stream failure', async () => {
  // mock streamConversationMessage to reject
  // trigger send
  // assert localized assistant-side error block appears
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/components/chat/copilot-chat-ui.test.tsx`  
Expected: FAIL because inline error module is not present.

- [ ] **Step 3: Write minimal implementation**

```tsx
// In copilot-chat-ui.tsx:
// - keep partial assistant text on failure
// - append small inline retry/error block in message list
// - keep processing-document status and focused doc pill modules visible above composer
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/components/chat/copilot-chat-ui.test.tsx`  
Expected: PASS for inline error and document-context assertions.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/copilot-chat-ui.tsx src/components/chat/message-renderers/assistant-markdown.tsx tests/unit/components/chat/copilot-chat-ui.test.tsx
git commit -m "feat(chat): improve copilot chat streaming and error experience"
```

### Task 5: Verify, lint, and regression guard

**Files:**

- Modify (if needed): changed files from Tasks 1-4
- Test: relevant test files and chat integration subset

- [ ] **Step 1: Run focused unit tests**

Run: `pnpm test tests/unit/components/chat/assistant-markdown.test.tsx tests/unit/components/chat/copilot-chat-ui.test.tsx`  
Expected: PASS.

- [ ] **Step 2: Run lint and type checks**

Run: `pnpm lint && pnpm type-check`  
Expected: PASS with no new issues.

- [ ] **Step 3: Run chat integration sanity tests**

Run: `pnpm test:integration:chat`  
Expected: PASS or known pre-existing failures only.

- [ ] **Step 4: Manual UI sanity**

Run: `pnpm dev` then verify `/chat` and `/chat-copilotkit`:

- old page unchanged
- new page shares conversation history and renders richer assistant content

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test(chat): verify copilot style chat route and regressions"
```

---

## Self-Review Checklist

- Spec coverage mapped:
  - New route: Task 3
  - Lighter blue and richer visual hierarchy: Task 2 + Task 3
  - Markdown/GFM rendering: Task 1 + Task 4
  - Streaming/error states: Task 4
  - Legacy route stability: Task 5 manual + regression checks
- Placeholder scan completed: no TBD/TODO placeholders in execution-critical steps.
- Type consistency check: `AssistantMarkdown`, `MessageBubble`, `CopilotChatUI` names are stable across tasks.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-20-chat-copilotkit-frontend-implementation.md`.

Execution mode selected: **Inline Execution** (per user preference to continue directly without extra confirmation).
