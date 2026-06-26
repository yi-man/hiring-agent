# JD Publishing LangGraph Explore Design

**Goal:** Bring JD publishing back in line with `发布.md`: Explore creates a structured Skill DSL, LangGraph executes it step by step, Trace is persisted, fallback_agent is represented in the flow, and the executor only operates the target site through browser UI.

## Requirements

- Use Playwright as the browser executor for now, with the same `BrowserExecutor` interface shape that a Chrome extension or `agent-browser` executor can implement later.
- Do not call the boss-like backend API from hiring-agent. The only target entrypoint is the boss-like frontend page URL.
- Keep the default Playwright browser headed unless a test injects `headless: true`.
- If no active boss-like skill exists in DB, run Explore before publishing.
- Store Explore-created skills in `publish_skills` with `meta.created_from = "explore"`.
- Execute skills step by step through LangGraph, not by one opaque loop hidden inside the service.
- Persist every task Trace in DB, including fallback_agent steps when a failed step asks for fallback.
- On fallback repair, create a new skill version and mark it active without overwriting older versions.

## Architecture

The publishing API continues to call `publishJobDescriptionToBossLike`, but the service delegates to a new LangGraph publishing agent. The graph owns orchestration:

```text
prepare
  -> explore_or_load_skill
  -> create_task
  -> execute_step
  -> route_after_step
  -> fallback_agent
  -> maybe_upgrade_skill
  -> finalize
```

`BrowserExecutor` remains the execution boundary. It can navigate, fill, click, wait, check DOM/text/URL, add keywords, and optionally return a snapshot for Explore/fallback diagnostics. Playwright implements that boundary through UI operations only.

## Explore

Explore opens the boss-like new job page, follows the login branch if the form is not visible, verifies the expected labels and success screen through the page, then emits a `PublishSkill` DSL. The generated skill uses the same Step DSL as execution and records metadata:

```json
{
  "created_from": "explore",
  "success_rate": 0,
  "usage_count": 0
}
```

For this MVP the generated boss-like skill is deterministic after page verification. That keeps the flow testable while still making Explore a browser-confirmed authoring step.

## Execution And Fallback

`execute_step` executes exactly one DSL step, appends one trace item, and updates `currentStep` in graph state. Routing decides whether to continue, finish, fail, or enter `fallback_agent`.

`fallback_agent` records an agent step with the failed step id, error, and DOM snapshot if available. The repair implementation is deterministic for this local boss-like MVP: it can produce a new version when a fallback step carries repaired steps in metadata. If no repair is available, the task fails with the fallback trace preserved.

## Storage

Repository helpers expose:

- latest active skill lookup
- create Explore skill
- create next skill version and deactivate older active versions
- task creation
- task completion with trace persistence

Existing Prisma tables are sufficient because `PublishSkill.meta`, `JobPublishTask.currentStep`, and `JobPublishTrace.steps` already exist.

## Testing

Tests must cover:

- no active DB skill triggers Explore, then task creation uses the Explore skill
- graph executes skill steps one at a time and persists trace
- action/condition failure with `fallback_agent` records fallback trace
- skill upgrade creates version N+1 and does not overwrite version N
- default service no longer passes `BOSS_LIKE_API_BASE_URL` or any backend API URL into Playwright
- Playwright remains headed by default, while unit tests can opt into headless mode

## Post-MVP Design: Executor Transport, DOM Uniqueness, And Re-Explore

The current MVP validates the architecture with an in-process Playwright executor. The next three upgrades must keep the same high-level agent graph while replacing the fragile parts underneath: executor transport, DOM target resolution, and fallback re-exploration.

### 1. Executor Transport For Chrome Extension And agent-browser

`BrowserExecutor` remains the stable boundary, but only Playwright can use direct in-process method calls. Chrome extension and agent-browser executors need adapters that translate the same method calls into command/result messages.

```text
LangGraph execute_step
  -> BrowserExecutor method call
  -> executor adapter
  -> command transport
  -> real browser/runtime
  -> BrowserStepResult
  -> trace + next route
```

#### Playwright Executor

Playwright keeps direct calls:

```ts
await executor.fill(target, value);
```

The adapter owns the Chromium `Page`, catches Playwright errors, captures snapshots, and returns `BrowserStepResult`.

#### Chrome Extension Executor

Chrome extension should use asynchronous command transport instead of direct DOM access from the server:

```text
server creates command
  -> extension receives command by WebSocket, SSE+POST, or polling
  -> content script resolves target in the active tab
  -> content script executes action
  -> extension posts result back
  -> server resumes graph routing
```

The command envelope should be:

```ts
type BrowserCommand = {
  id: string;
  taskId: string;
  stepId: string;
  action: 'navigate' | 'fill' | 'click' | 'check' | 'wait_for_url' | 'add_keywords';
  target?: TargetDescriptor;
  params: Record<string, unknown>;
  timeoutMs: number;
};
```

The result envelope should be:

```ts
type BrowserCommandResult = {
  commandId: string;
  success: boolean;
  error?: string;
  domSnapshot?: StructuredDomSnapshot;
  match?: LocatorMatchReport;
};
```

The server must treat Chrome extension execution as asynchronous. A graph node can issue one command and wait for the command result, or the graph can be resumed after the extension posts the result. In both models, `BrowserStepResult` remains the normalized result that is persisted into trace.

#### agent-browser Executor

agent-browser should follow the same adapter shape. Its adapter may invoke a CLI, local server, or SDK, but it must return the same `BrowserCommandResult` fields. The agent-browser adapter must not invent its own selector semantics; it must call the shared target resolver rules below or return an equivalent `LocatorMatchReport`.

### 2. Shared DOM Target Model And Uniqueness Rules

Explore and execution must use the same DOM model. Explore should not merely discover arbitrary selectors; it should produce `TargetDescriptor` objects that the execution resolver can later resolve with the same rules.

```ts
type TargetDescriptor = {
  kind: 'field' | 'button' | 'link' | 'text' | 'container';
  role?: 'textbox' | 'button' | 'link' | 'form' | 'combobox';
  name: string;
  exact?: boolean;
  valueHint?: 'title' | 'company' | 'salary' | 'location' | 'description' | 'keyword';
  stableAttrs?: {
    testId?: string;
    id?: string;
    name?: string;
    ariaLabel?: string;
    autocomplete?: string;
  };
  scope?: {
    kind: 'form' | 'section' | 'dialog' | 'page';
    name?: string;
  };
};
```

The Skill DSL should store targets as structured descriptors:

```json
{
  "id": "fill_title",
  "type": "action",
  "action": "fill",
  "params": {
    "target": {
      "kind": "field",
      "role": "textbox",
      "name": "职位名称",
      "exact": true,
      "valueHint": "title",
      "scope": { "kind": "form", "name": "发布职位" }
    },
    "value": "{{input.title}}"
  },
  "next": "fill_company"
}
```

#### Resolver Strategy Order

The resolver must use deterministic, explainable candidate collection. It should record every strategy it tried.

1. Stable attributes: `data-testid`, `data-e2e`, `id`, `name`, `aria-label`, `autocomplete`.
2. ARIA role and accessible name: `getByRole(role, { name, exact })`.
3. Label association: `label[for]`, wrapped labels, `aria-labelledby`.
4. Placeholder: `getByPlaceholder(name, { exact })`.
5. Scoped semantic proximity: inside a form/section/dialog, find the closest editable/control element near matching label text.
6. Safe CSS selector from stable attributes only.
7. XPath only as a diagnostic fallback. XPath must not be the primary persisted selector for generated skills.

#### Candidate Filtering

Each strategy returns candidates. Candidates are filtered before execution:

- visible
- enabled
- editable for `fill`
- attached to the current document
- inside the requested scope when scope is present
- matching expected control type for the action

#### Uniqueness Decision

The resolver must not blindly use `.first()`.

```text
0 candidates -> not_found
1 candidate -> unique, execute
2+ candidates with clear score margin -> execute, record chosen candidate and confidence
2+ candidates without clear margin -> ambiguous, do not execute
```

Scoring should favor:

- exact accessible name match over fuzzy text match
- stable attribute match over label proximity
- scoped match over page-level match
- editable/visible field over hidden or disabled field
- expected role match over generic element match

The result must include a match report:

```ts
type LocatorMatchReport = {
  target: TargetDescriptor;
  status: 'unique' | 'not_found' | 'ambiguous' | 'low_confidence';
  strategy: string;
  candidateCount: number;
  confidence: number;
  chosen?: DomCandidate;
  candidates: DomCandidate[];
  reason?: string;
};
```

`BrowserStepResult` should be extended to persist this report:

```ts
type BrowserStepResult = {
  success: boolean;
  error?: string;
  domSnapshot?: string | StructuredDomSnapshot;
  match?: LocatorMatchReport;
};
```

### 3. Explore And Failure Re-Explore

Explore should become a structured DOM authoring flow rather than a fixed boss-like page check. The important design rule: Explore uses the same `TargetDescriptor` and resolver strategy that execution uses.

```text
open page
  -> capture StructuredDomSnapshot
  -> classify page state
  -> discover form fields/buttons
  -> generate TargetDescriptor per required input
  -> run resolver dry-run for each descriptor
  -> require uniqueness before skill creation
  -> generate Skill DSL
  -> user or system confirmation
  -> store active skill version
```

#### Structured DOM Snapshot

Explore should request a compact, semantic snapshot instead of raw HTML as the primary input:

```ts
type StructuredDomSnapshot = {
  url: string;
  title: string;
  pageState: 'login' | 'publish_form' | 'list' | 'unknown';
  headings: DomCandidate[];
  forms: Array<{
    name?: string;
    fields: DomCandidate[];
    buttons: DomCandidate[];
  }>;
  links: DomCandidate[];
  textBlocks: DomCandidate[];
};
```

`DomCandidate` should include enough evidence for both Explore and execution:

```ts
type DomCandidate = {
  tag: string;
  role?: string;
  accessibleName?: string;
  label?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  testId?: string;
  text?: string;
  visible: boolean;
  enabled: boolean;
  editable: boolean;
  cssPath?: string;
};
```

#### Page State Decision Rules

Explore should classify pages with deterministic rules first:

- Login page: username/password fields and a login button are visible.
- Publish form page: job title/company/salary/location/description fields and a publish button are visible.
- Job list page: published title or jobs list navigation is visible.
- Unknown page: none of the above has enough evidence.

If deterministic classification is ambiguous, fallback_agent can ask an LLM to classify using `StructuredDomSnapshot`, not raw browser state.

#### Skill Generation Rules

For each required business input, Explore maps a field to a `TargetDescriptor`:

- `input.title` -> field target with `valueHint: "title"`
- `input.company` -> field target with `valueHint: "company"`
- `input.salary` -> field target with `valueHint: "salary"`
- `input.location` -> field target with `valueHint: "location"`
- `input.description` -> field target with `valueHint: "description"`
- `input.keywords` -> field target plus add/confirm button targets
- submit -> button target with role/name and form scope

Before persisting the skill, Explore must run a dry-run resolve for every target. If any target is `not_found` or `ambiguous`, Explore must not silently persist the skill. It should return a diagnostic that can be shown to the user or passed to fallback_agent.

#### Failure Re-Explore

When execution fails:

```text
failed step
  -> persist trace with error + match report + snapshot
  -> fallback_agent
  -> capture current StructuredDomSnapshot
  -> run resolver against the failed TargetDescriptor
  -> if unique repaired target exists, patch only affected steps
  -> create Skill version N+1
  -> resume or ask user to retry
```

Re-explore must preserve version history. It must create a new skill version with metadata:

```json
{
  "created_from": "agent",
  "repaired_from_skill_id": "...",
  "repaired_from_version": 3,
  "failed_step_id": "fill_title",
  "repair_reason": "ambiguous target resolved by scoped role+name"
}
```

The graph should resume execution only when the repaired target has a unique match. If the target remains ambiguous, execution should fail with a clear `ambiguous_target` diagnostic instead of clicking or filling the first candidate.

### Acceptance Criteria For The Next Phase

- Chrome extension and agent-browser can implement `BrowserExecutor` through command/result transport without changing graph logic.
- Explore outputs `TargetDescriptor` objects and the execution resolver consumes the same objects.
- Every action trace contains a `LocatorMatchReport`.
- No execution path uses `.first()` without uniqueness analysis.
- XPath is not persisted as the primary selector for generated skills.
- Failing steps can trigger re-explore, create a new skill version, and either resume safely or fail with a precise diagnostic.
