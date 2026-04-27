# Workflow Learning Login Gate and DSL Replay Design

**Date:** 2026-04-27
**Status:** Approved design for implementation planning
**Scope:** Extend the existing `/workflow-learning` Phase 1 prototype with a rule-driven login gate, BOSS-first workflow execution, DSL generation, and DSL replay validation.

## 1. Goal

Workflow Learning should support an end-to-end browser workflow loop:

1. Decide whether the user's message needs browser tools or is ordinary chat.
2. Before protected page access, check login state.
3. If login is required, open or keep the BOSS login page and wait for the user to scan/login.
4. When the user replies that login is complete, verify login and resume the pending task.
5. Execute the target workflow, such as opening BOSS home or reading the first BOSS message.
6. Only after user confirmation, generate Workflow DSL from the observed execution.
7. Replay the DSL with the DSL runner. The DSL is considered generated successfully only if replay succeeds.

The implementation should use a generic engine shape while shipping the first rules for BOSS only.

## 2. Key Decisions

- Use **rule state machine + LLM assistance** rather than a fully LLM-driven ReAct loop.
- Keep the engine structure generic, but only include BOSS rules in the first version.
- On user reply such as "已登录", verify login and automatically continue the original pending task by default.
- During DSL replay, if `check_login` already proves the browser session is logged in, skip the `login` step and continue with protected actions.
- Keep browser pages open unless the user explicitly asks to close them.
- Keep state in memory by `sessionId` for this iteration. Do not add database persistence yet.

## 3. Architecture

### 3.1 Intent Router

The intent router classifies each user message into one of these categories:

- `chat`: ordinary chat, no browser tool call.
- `boss_open_home`: open BOSS home.
- `boss_read_first_message`: open BOSS messages and return the first message.
- `login_completed`: user says login is complete.
- `generate_dsl`: user asks to generate instructions or DSL.
- `unknown_workflow`: browser-like request that is not supported by first-version rules.

The router can start with deterministic keyword rules and later use LLM fallback. The first BOSS rules should be deterministic enough for the main Chinese prompts.

### 3.2 Workflow State Machine

The state machine owns control flow. It should not rely on the LLM to decide whether login is required, when to resume, or whether DSL replay succeeded.

Core states:

- `check_login`
- `login_required`
- `resume_after_login`
- `explore_target_page`
- `extract_result`
- `generate_dsl`
- `replay_dsl`
- `success`
- `failed`

For each `sessionId`, maintain an in-memory session record:

```json
{
  "pendingTask": "boss_read_first_message",
  "lastSuccessfulTrace": [],
  "lastWorkflow": null,
  "outputs": {},
  "loginStatus": "unknown"
}
```

### 3.3 LLM Assistant

The LLM is limited to supportive tasks:

- Ordinary chat responses.
- Turning a successful execution trace into a DSL draft.
- Helping produce selector hints or extraction descriptions when page structure is ambiguous.

The LLM must not be the source of truth for login gating, task resumption, or DSL replay success.

## 4. BOSS Built-in Rule Set

First-version BOSS config:

```ts
{
  homeUrl: 'https://www.zhipin.com/',
  loginUrl: 'https://www.zhipin.com/web/user/',
  messagesUrl: 'https://www.zhipin.com/web/geek/chat',
  loginRequiredDetector: {
    urlIncludes: ['/web/user'],
    textIncludes: ['扫码', '登录', '微信']
  },
  loggedInDetector: {
    urlNotIncludes: ['/web/user'],
    textIncludes: ['消息', '沟通', '职位']
  }
}
```

The implementation may adjust exact detector text after real BOSS page inspection, but it must preserve the invariant that protected BOSS actions pass through `check_login` first.

## 5. Login and Resume Flow

### 5.1 Opening BOSS Home

1. User asks to open BOSS home.
2. State machine executes `check_login`.
3. If logged in, navigate to `homeUrl`, return a short success message, and keep the page open.
4. If not logged in, navigate to `loginUrl` or keep the redirected login page open.
5. Emit `awaiting_login`, store `pendingTask = boss_open_home`, and tell the user to scan login and reply "已登录".

### 5.2 Reading First BOSS Message

1. User asks to open BOSS messages and return the first message.
2. State machine executes `check_login`.
3. If logged in, navigate to `messagesUrl`.
4. Locate the message list and extract the first message text.
5. Return that text to the user and store a successful execution trace.
6. If not logged in, follow the same login-required path and store `pendingTask = boss_read_first_message`.

### 5.3 User Replies "已登录"

1. Intent router classifies the message as `login_completed`.
2. State machine looks up the current `sessionId` pending task.
3. Run login verification on the existing browser session.
4. If verification succeeds, emit `login_verified` and continue the pending task automatically.
5. If verification fails, keep the page open and tell the user login was not detected yet.
6. If there is no pending task, report login status only.

## 6. DSL Generation

DSL is generated only after the user explicitly asks for it, such as "生成指令" or "生成 DSL".

Generation flow:

1. Load the latest successful execution trace for the `sessionId`.
2. Ask the LLM to produce a Workflow DSL JSON object using the existing schema.
3. Validate it with `workflowDslSchema`.
4. If validation fails, return `dsl_validation_result(ok: false)` with the schema error.
5. If validation passes, immediately replay it through the DSL runner.
6. Emit `workflow_dsl` only after replay succeeds.

For "open BOSS messages and return the first message", the DSL must include:

- `check_login`
- `login`
- `browser_action.navigate` to BOSS messages
- `browser_action.extract_text` with `outputKey: "firstMessage"`
- `assertion` against `outputKey: "firstMessage"`

## 7. DSL Runner

The DSL runner executes parsed `WorkflowDsl` step by step in dependency order.

Step behavior:

- `check_login`: inspect current browser session using the detector. Store a boolean login result in runner context.
- `login`: if the prior `check_login` result is logged in, skip this step. Otherwise open the login page and return an awaiting-login outcome.
- `browser_action.navigate`: navigate to `target.url`.
- `browser_action.wait_for_text`: wait until the target text appears or timeout.
- `browser_action.extract_text`: extract visible text using `selectorHint` or text-based heuristics, then write it to `outputs[outputKey]`.
- `assertion`: validate URL, visible text, or `outputs[outputKey]`.

Replay is successful only when every required step succeeds or is intentionally skipped due to an already verified login state.

## 8. SSE Events and UI

Extend current SSE events without breaking existing ones.

New events:

- `workflow_state_changed`: current state machine phase and optional description.
- `dsl_replay_step`: step id, step type, status (`running`, `skipped`, `success`, `failed`), and optional output/error preview.

Existing events remain:

- `awaiting_login`
- `login_verified`
- `workflow_dsl`
- `dsl_validation_result`
- `tool_call_start`
- `tool_call_result`
- `assistant_final`
- `run_end`

UI additions:

- Login recovery card showing waiting, verified, or failed detection state.
- DSL replay card showing each replayed step. The Workflow DSL JSON appears only after replay succeeds.

## 9. Error Handling

- If BOSS login is required, do not close the page. Ask the user to complete login.
- If the user says "已登录" but detection fails, keep the pending task and ask them to try again.
- If DSL schema validation fails, show the schema error and do not replay.
- If DSL replay fails, show the failed step and error. Do not emit a successful DSL artifact.
- If no previous successful trace exists when the user asks to generate DSL, ask the user to first complete a workflow.

## 10. Testing and Acceptance

Unit tests:

- Intent router classifies ordinary chat, BOSS home, BOSS first message, login completion, and DSL generation.
- State machine enters awaiting login when not logged in.
- State machine resumes the pending task after "已登录" and successful verification.
- DSL runner skips `login` when `check_login` proves the session is already logged in.
- DSL runner writes `extract_text` output and validates `assertion` steps.
- SSE parser accepts new events.

Manual local acceptance:

1. "打开 BOSS 首页" when logged out opens or keeps the login page, asks for QR login, then resumes after "已登录".
2. "打开 BOSS 消息页并返回第一条信息" checks login first, opens messages after login, extracts the first message, and returns it.
3. "生成指令" generates DSL from the successful trace, replays it, and shows DSL only when replay succeeds.
4. The BOSS browser page remains open until the user explicitly requests closure.

## 11. Out of Scope

- Persisting workflow state or DSL to the database.
- General site configuration UI.
- Automatic DSL repair loop after replay failure.
- Production browser infrastructure.
- Closing long-lived browser sessions automatically beyond existing process lifetime behavior.

## 12. Self-Review

- No placeholder requirements remain.
- The design preserves the existing `/workflow-learning` SSE and browser-session architecture.
- The BOSS first implementation is explicit while the engine boundaries remain reusable.
- Login gating is an invariant before protected BOSS actions.
- DSL success requires real replay success, not only schema validation.
