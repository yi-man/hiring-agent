# Candidate Communication Agent Design

Date: 2026-06-30

Status: Implementation-ready

## Summary

The communication stage turns candidate replies from the browser executor into a state-driven recruiting conversion flow. The first implementation focuses on the backend contract used by the executor: receive a candidate message, classify intent, use the recruiting context and LLM to decide the next reply, persist state/history/decision evidence, optionally send the reply through the existing browser adapter, and update conversion memory when the conversation reaches a terminal or high-value state.

This builds on the existing candidate screening system. Screening finds and contacts candidates; communication handles what happens after a candidate responds.

The platform side should also be runnable as a reusable communication skill. For fixed platforms such as `boss-like`, the skill opens the unread-message inbox, enumerates unread candidate messages, passes each message through the communication Agent, sends replies through the browser adapter, and repeats the inbox read until no unread messages remain. A run is successful only when the final inbox pass returns zero unread messages.

## Goals

- Track each JD-candidate communication as a durable state machine.
- Optimize the flow around resume acquisition and private-contact conversion.
- Accept candidate messages from a browser executor or API client.
- Use rules for fast intent pre-classification and LLM for reply/advancement decisions.
- Persist inbound messages, outbound replies, decisions, stage changes, and conversation memory.
- Execute outbound replies through the real `CandidateSourceAdapter` path when requested.
- Support a platform workflow skill that drains all unread messages before stopping.
- Run single-message communication as a LangGraph state graph.
- Reuse the existing candidate-screening resume evaluation flow when a resume exists but no screening score has been stored yet.
- Keep the core state machine testable without a browser or database.

## Non-Goals

- Building the browser extension itself.
- Replacing the existing candidate screening run or action execution flow.
- Adding a large UI dashboard in this iteration.
- Full automatic resume file download/parsing from arbitrary external sites.
- A/B testing and long-term active recall campaigns.

## State Machine

Stages are stored as lowercase strings:

- `new`: no meaningful candidate interaction yet.
- `screening`: early qualification or answering basic questions.
- `waiting_resume`: the agent has asked for a resume or more background.
- `resume_received`: the candidate indicates a resume was sent or available.
- `evaluating`: the system is evaluating fit from resume/profile context.
- `contact_requested`: the agent has asked for WeChat/phone/private contact.
- `contact_exchanged`: the candidate shared private contact information.
- `rejected`: candidate is not suitable or explicitly not interested.
- `closed`: conversation ended without further action.

Terminal stages are `contact_exchanged`, `rejected`, and `closed`.

## Intent Rules

The rule layer runs before LLM and emits an intent seed:

- `resume_shared`: mentions resume/CV/attachment/profile.
- `contact_shared`: includes WeChat/phone/email or says contact can be added.
- `not_interested`: explicitly declines or says not considering.
- `salary_question`: asks about salary/compensation.
- `job_question`: asks about job, company, location, tech stack, interview, or remote work.
- `greeting`: greeting or availability ping.
- `unknown`: fallback.

Rules should not fully decide the conversation when an LLM is available; they provide fast guardrails and structured context.

## Decision Contract

The decision output is:

```ts
type CandidateCommunicationDecision = {
  intent: CandidateMessageIntent;
  intentLevel: 'high' | 'medium' | 'low';
  nextStage: CandidateCommunicationStage;
  shouldReply: boolean;
  reply: string | null;
  actions: CandidateCommunicationAction[];
  rationale: string;
};
```

Supported actions:

- `reply`
- `request_resume`
- `request_contact`
- `capture_resume`
- `capture_contact`
- `answer_question`
- `mark_rejected`
- `close`
- `noop`

LLM output is validated with Zod. If LLM output is unavailable in non-strict contexts, deterministic rules can produce a conservative fallback. API and real-flow verification should run strict LLM mode.

## Data Model

### CandidateConversation

Table: `candidate_conversations`

Purpose: durable JD-candidate state.

Important fields:

- `user_id`
- `job_description_id`
- `candidate_id`
- `platform`
- `stage`
- `status`
- `intent_level`
- `message_count`
- `last_active_at`
- `last_candidate_message_at`
- `last_agent_message_at`
- `next_follow_up_at`
- `outcome_result`
- `outcome_reason`

Unique key: `(user_id, job_description_id, candidate_id)`.

### CandidateConversationMessage

Table: `candidate_conversation_messages`

Purpose: inbound and outbound message ledger.

Important fields:

- `conversation_id`
- `user_id`
- `job_description_id`
- `candidate_id`
- `role`: `candidate` or `agent`
- `content`
- `external_message_id`
- `delivery_status`: `received`, `planned`, `sent`, or `failed`
- `browser_trace`
- `error_message`
- `occurred_at`

### CandidateConversationDecision

Table: `candidate_conversation_decisions`

Purpose: auditable decision record per inbound message.

Important fields:

- `input_message_id`
- `output_message_id`
- `intent`
- `intent_level`
- `next_stage`
- `actions`
- `rationale`
- `llm_meta`

### CandidateConversationMemory

Table: `candidate_conversation_memories`

Purpose: summarized conversion asset for later recall.

Important fields:

- `outcome_result`: `rejected`, `no_response`, `interested`, or `contact_exchanged`
- `outcome_reason`
- `intent`
- `profile_summary`
- `key_points`
- `drop_off_reason`
- `next_follow_up_at`

## API

### `POST /api/candidate-conversations/messages`

Receives one candidate message and optionally sends the agent reply.

Request:

```json
{
  "jobDescriptionId": "jd-id",
  "candidateId": "candidate-id",
  "platform": "boss-like",
  "message": {
    "content": "你好，薪资范围方便说一下吗？",
    "externalMessageId": "boss-msg-1",
    "receivedAt": "2026-06-30T12:00:00.000Z"
  },
  "executeReply": true
}
```

The first implementation requires `candidateId`. Browser-side identity-only upsert can be added later using the existing candidate identity helpers.

Response:

```json
{
  "conversation": { "id": "...", "stage": "contact_requested" },
  "incomingMessage": { "id": "..." },
  "outgoingMessage": { "id": "...", "deliveryStatus": "sent" },
  "decision": {
    "intent": "salary_question",
    "intentLevel": "high",
    "nextStage": "contact_requested",
    "shouldReply": true,
    "actions": ["answer_question", "request_contact"]
  }
}
```

### `POST /api/candidate-conversations/sync-unread`

Runs the platform communication skill for a JD.

Request:

```json
{
  "jobDescriptionId": "jd-id",
  "platform": "boss-like",
  "maxPasses": 10
}
```

Response:

```json
{
  "status": "success",
  "stoppedReason": "no_unread_messages",
  "processed": 3,
  "failed": 0,
  "passes": 2
}
```

The stop condition is strict: `success` means the runner performed one final inbox read and found no unread messages.

## LangGraph Flow

The API and platform unread skill call `handleCandidateMessage`; the service delegates to a LangGraph graph for the single-message business workflow.

1. `load_subject`: load JD, candidate, latest resume, latest screening result, and existing communication state inputs.
2. `record_incoming`: create or reuse the conversation, persist the inbound candidate message, mark the candidate as replied, and load recent history.
3. `evaluate_resume`: resolve the fit score for communication:
   - reuse `CandidateScreeningResult.finalScore` when it already exists;
   - otherwise, if a latest resume exists, build the same evaluation schema with `buildScreeningPlanFromJd` and call the shared `evaluateCandidateForJd` flow;
   - default this shared resume evaluation to non-strict mode: it tries the real LLM first and uses the existing candidate-screening fallback when that evaluator is unavailable;
   - continue with `matchScore: null` when there is no resume or no valid JD schema.
4. `decide_reply`: run rules and strict LLM decision with stage, history, JD context, resume availability, and match score.
5. `send_reply`: persist an outbound message and execute the real platform adapter when requested.
6. `persist_decision`: store intent, next stage, actions, rationale, and graph metadata.
7. `finalize_conversation`: update conversation state and create memory for terminal/high-value outcomes.

## Platform Skill Flow

The first platform skill is `boss-like-unread-communication`.

1. Log in through the platform adapter if needed.
2. Open `/employer/messages`.
3. Extract unread message cards from structured/raw DOM.
4. Resolve each unread message to an existing candidate by platform candidate id or profile URL.
5. Call `handleCandidateMessage` with `executeReply = true`.
6. Reuse the same browser session for outbound replies.
7. Re-open `/employer/messages`.
8. Stop only when the unread list is empty.
9. Fail if the inbox is still not empty after `maxPasses`.

## Testing Strategy

- Unit tests for intent classification and state transitions.
- Unit tests for payload validation and service orchestration with injected dependencies.
- Integration test with real PostgreSQL and a local boss-like HTTP site driven by Playwright.
- Integration test for the unread-message skill: the local platform starts with an unread message, the browser sends a reply, the inbox becomes empty, and the runner stops only after confirming no unread messages remain.
- Real-flow verification script/test should use the configured OpenAI-compatible endpoint when `OPENAI_API_KEY` is available.

## Acceptance Criteria

- Candidate message ingestion creates or reuses a JD-candidate conversation.
- Greeting/basic interest advances toward `waiting_resume` or `contact_requested`.
- Resume mentions advance to `resume_received` and persist `capture_resume`.
- Contact sharing advances to `contact_exchanged` and writes memory.
- Rejected candidates do not keep receiving automated replies.
- `executeReply = true` sends through the real browser adapter and records `sent` or `failed`.
- Real verification covers database writes, LLM decision, and browser reply execution.
- `sync-unread` processes all currently visible unread messages and returns success only after a no-unread pass.
