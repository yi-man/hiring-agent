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
