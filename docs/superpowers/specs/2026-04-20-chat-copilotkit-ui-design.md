# Chat CopilotKit-Style UI Design (Frontend-Compatible)

## Context and Goal

The current `chat` page has two user-facing issues:

1. The blue user bubble/background is too heavy and visually tiring.
2. The message display is too plain compared to modern AI chat products.

The requested direction is to align the UI/UX with the CopilotKit-style chat experience referenced in LangChain frontend docs, while keeping backend behavior stable and reusing current conversation/message storage.

Scope and constraints confirmed:

- Keep existing backend APIs and conversation data model.
- Add a new page (`/chat-copilotkit`) and keep existing `/chat` unchanged.
- Reuse current conversation/message data for continuity between old and new pages.
- Prioritize visual improvements first, then complete message-rendering coverage.

## Non-Goals

- No migration to a Python runtime or separate service.
- No forced replacement of existing `/chat`.
- No backend protocol redesign in this phase.
- No unrelated refactor outside chat rendering and composition UX.

## Design Overview

### Architecture

Use a frontend compatibility architecture that emulates CopilotKit-style rendering without requiring server runtime changes:

1. **Data layer reuse**
   - Continue using current API client methods:
     - conversation listing/selection
     - message history fetch
     - streaming reply endpoint
     - document upload/refresh/delete
   - Preserve conversation IDs and message history across both pages.

2. **Presentation split**
   - Keep existing `ChatUI` as legacy.
   - Introduce a new `CopilotChatUI` for `/chat-copilotkit`.
   - Extract shared conversation/document behaviors into reusable hooks/utilities where practical.

3. **Render pipeline**
   - Convert raw assistant text into structured render blocks at the frontend.
   - Render blocks through a component registry (`blockType -> renderer`) to support incremental extension.
   - Keep user messages compact with a lighter DeepSeek-like blue tone and stronger visual hierarchy.

### Why this approach

- Matches user requirement to avoid backend changes.
- Delivers CopilotKit-like UI quality and rendering richness quickly.
- Preserves upgrade path: if a runtime endpoint is added later, only adapter boundaries need to change.

## UI and Interaction Design

### Visual System

Adopt a cleaner, softer chat visual language:

- **User bubble blue**: shift from strong `bg-primary` to a lighter semantic token (new custom token or Tailwind class composition), with dark-mode-safe contrast.
- **Assistant area**: neutral card/surface with subtle border and spacing rhythm.
- **Composer shell**: modern rounded container, clear top/bottom structure, less dense utility noise.
- **Typographic hierarchy**: tighter but more intentional scales for heading/text/code/caption.
- **State cues**: loading, streaming, retry, and document-context indicators become explicit visual modules.

### Message Structure

Assistant messages are rendered via content blocks:

- `markdown`
- `codeBlock`
- `inlineCode`
- `table`
- `taskList`
- `blockquote`
- `status` (thinking/streaming)
- `error` (failed message stream or render issue)
- `docRef` (document context reference)

Initial implementation can parse markdown first and map specialized blocks through markdown AST-derived node types.

### Composer and Document Context

Preserve existing document workflow, but present in cleaner modules:

- focused document pill/card above input
- processing status strip
- better empty-thread document management section
- more polished icon-only utility actions with clear disabled/loading states

## Data Flow and Rendering Flow

1. User selects/creates conversation.
2. Page loads messages/documents from existing APIs.
3. For assistant messages:
   - raw text -> markdown parse -> render block model
   - block model -> component registry render
4. On send:
   - append optimistic user message
   - append assistant streaming placeholder state
   - stream chunks into assistant raw text
   - re-parse/render incrementally (bounded frequency if needed)
5. On error:
   - preserve partial response if available
   - render retry/error block with actionable hint

## Error Handling

- Streaming failure: show inline assistant error block, not only top-level red text.
- Parse failure: fallback renderer outputs raw text safely.
- Empty assistant content after completion: show explicit "empty response" warning state.
- Document operations:
  - keep existing API error propagation
  - surface in localized module-level feedback as well as global feedback.

## Testing Strategy

### Unit

- Message block parser:
  - markdown headings/lists/code/table/task list
  - edge cases: empty, malformed markdown, very long lines
- Renderer fallback behavior for unknown block types

### Integration (React testing)

- Streaming message updates render progressively.
- User and assistant visual variants are applied correctly.
- Document focus/remove workflow unchanged functionally.
- Error states render expected retry/notification UI.

### Manual verification

- `/chat` remains unchanged.
- `/chat-copilotkit` reads same conversations/history.
- Light and dark themes remain legible.
- Blue bubble appears softer and closer to requested style.

## File-Level Implementation Plan (Design-Level)

Planned additions/changes:

- `src/app/chat-copilotkit/page.tsx` (new route page)
- `src/components/chat/copilot-chat-ui.tsx` (new UI root)
- `src/components/chat/message-renderers/*` (new render block components)
- `src/components/chat/message-parser/*` (frontend parser/adapter)
- `src/components/chat/shared/*` (optional shared conversation/document panels)
- `src/components/chat/chat-ui.tsx` (minimal extraction only if needed)
- related tests under `tests/unit` and/or component test locations

## Phasing

### Phase 1: Visual baseline and route

- Add `/chat-copilotkit`
- Implement main layout + softened blue style + improved composer shell
- Wire to existing conversation/message/document APIs

### Phase 2: Rich rendering coverage

- markdown + GFM rendering (table/task list/code/blockquote)
- streaming-specific visual states
- error and fallback render modules

### Phase 3: Hardening

- test coverage and regression checks
- style polish and accessibility pass
- confirm parity of data continuity with legacy chat

## Risks and Mitigations

- **Risk: parser/render overhead during streaming**
  - Mitigation: throttle parse frequency for large messages, keep fallback raw renderer.
- **Risk: visual regressions between themes**
  - Mitigation: test light/dark token contrast and use semantic classes.
- **Risk: duplication between old/new pages**
  - Mitigation: extract shared logic gradually, avoid broad upfront refactor.

## Acceptance Criteria

1. New route `/chat-copilotkit` is available and uses existing conversation data.
2. User bubble blue is visibly lighter and less saturated than current chat.
3. Assistant messages support markdown/GFM-rich rendering including code/table/task list.
4. Streaming and error states are visibly distinct and informative.
5. Existing `/chat` route remains functional without behavior regressions.

## Open Decision (Deferred)

Whether to later replace `/chat` with `/chat-copilotkit` can be decided after real usage validation. Current design intentionally supports dual-page rollout.
