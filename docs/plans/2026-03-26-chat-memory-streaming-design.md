# Chat Memory Streaming Design

## Goal

Optimize current chat implementation to support:

- no hard-coded expert identity (keep only personality-style system prompt)
- streaming assistant responses
- explicit `conversation` and `message` domain model
- memory across turns
- MySQL persistence for conversations and messages
- Redis-backed conversation message history with 24h inactivity expiration
- standard LangChain implementation style

## Scope

In scope:

- backend chat architecture and API contract
- data model design for MySQL and Redis
- LangChain chain and memory integration
- frontend chat behavior for multi-conversation and streaming
- test strategy with real LLM, real MySQL, and real Redis in integration tests

Out of scope:

- authentication and multi-tenant permission model (can be added later)
- embedding/RAG knowledge base
- production observability stack expansion beyond required logs

## Product Behavior

### Conversation Model

- user can create multiple conversations
- user can switch between conversations
- each conversation contains ordered messages
- each new message updates conversation `lastActiveAt`

### Assistant Behavior

Keep a `system prompt`, but only define personality/interaction style:

- lively and positive
- smart and sharp
- proactive in asking clarifying questions
- empathetic and considerate

Do not state expert identity labels (for example, "I am an X expert").

### Streaming

- assistant answer is returned as stream chunks
- frontend renders chunks incrementally
- assistant final content is persisted after stream completion

## Architecture

### High-Level Flow

1. client creates or selects a conversation
2. client sends user message to stream endpoint with `conversationId`
3. server writes user message to MySQL and Redis history
4. LangChain chain runs with `RunnableWithMessageHistory`
5. stream chunks are sent back to client
6. final assistant message is assembled and written to MySQL + Redis
7. Redis key TTL is refreshed to 24h on activity

### LangChain Design (Standard Style)

- model: `ChatOpenAI`
- chain: `RunnableSequence` (or prompt + model composition)
- memory wrapper: `RunnableWithMessageHistory`
- history provider: custom Redis-backed `BaseChatMessageHistory` implementation keyed by `conversationId`

The chain includes:

- system personality prompt
- prior conversation messages from message history
- current user message

No fixed "expert role" instruction is added.

## API Design

### `POST /api/conversations`

Create conversation.

Response:

- `conversationId`
- timestamps

### `GET /api/conversations`

List conversations ordered by `lastActiveAt desc`.

### `GET /api/conversations/:id/messages`

List messages for one conversation (paged and ordered by sequence/time).

### `POST /api/conversations/:id/messages/stream`

Request body:

- `content`: user message

Response:

- streaming text chunks (SSE or web stream)
- final completion marker

## Data Model

### MySQL

Table `conversations`:

- `id` uuid pk
- `user_id` nullable
- `title` nullable
- `status` enum (`active`, `archived`)
- `last_active_at` datetime
- `created_at` datetime
- `updated_at` datetime

Table `messages`:

- `id` uuid pk
- `conversation_id` fk -> conversations.id
- `role` enum (`system`, `user`, `assistant`)
- `content` longtext
- `seq` int (per-conversation incremental)
- `token_count` nullable int
- `created_at` datetime

Indexes:

- `messages(conversation_id, seq)`
- `conversations(last_active_at desc)`

### Redis

Key patterns:

- `chat:history:{conversationId}`
- optional: `chat:meta:{conversationId}`

TTL policy:

- every user or assistant activity refreshes key TTL to `86400` seconds
- if no activity for 24h, history expires automatically

Miss recovery:

- on Redis miss, load recent N messages from MySQL
- rehydrate Redis history and reset TTL

## Error Handling

- input validation errors -> 400
- missing conversation -> 404
- upstream LLM/runtime errors -> 5xx with structured error code
- if assistant stream fails mid-way:
  - return error event/termination marker to client
  - do not persist partial assistant message as final complete message

## Test Strategy

## Environments and Real Dependencies

Integration tests must use real dependencies:

- real LLM endpoint (`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`)
- real MySQL test database
- real Redis test instance

No mocks in integration tests.

Safety isolation:

- MySQL dedicated test database (for example `*_test`)
- Redis test key prefix `chat:test:*`
- cleanup before/after test suites

### Scenario Coverage Matrix

S1. Create conversation and first streamed reply

- unit:
  - conversation service defaults
  - stream chunk accumulator
- integration (real deps):
  - create conversation then stream first message
  - assert stream received
  - assert MySQL stored user + assistant messages
  - assert Redis history exists with TTL > 0

S2. Conversation isolation

- unit:
  - redis key builder isolation by `conversationId`
- integration:
  - send distinct context in A and B conversations
  - assert response behavior/history source isolation

S3. Memory continuity in one conversation

- unit:
  - history provider resolves by `conversationId`
- integration:
  - turn 1 includes factual anchor
  - turn 2 asks follow-up
  - assert model uses prior context
  - assert MySQL sequence ordering

S4. 24h inactivity expiration and rehydration

- unit:
  - TTL refresh function uses configured expiration
- integration:
  - test TTL override to short duration
  - wait key expiration
  - send next message and assert MySQL rehydration path works
  - assert Redis key recreated

S5. System personality constraints

- unit:
  - prompt builder contains style constraints
  - prompt builder excludes expert identity wording
- integration:
  - real responses do not contain prohibited identity phrases under normal prompts

S6. Failure-path behavior

- unit:
  - error mapping and status code shaping
- integration (real infra where possible):
  - invalid conversation id
  - empty input
  - transient LLM failure handling
  - assert no invalid half-state persistence

## Implementation Slices (Execution Order)

1. Define data schema and repositories (`conversations`, `messages`)
2. Build Redis message history abstraction with TTL refresh
3. Build LangChain chain using `RunnableWithMessageHistory`
4. Implement conversation APIs and streaming message API
5. Update frontend to support conversation list + streaming rendering
6. Add scenario-driven unit tests
7. Add scenario-driven integration tests with real LLM/MySQL/Redis
8. Run full tests, fix until all required scenarios pass

## Definition of Done

- multi-conversation chat works in UI
- response is streamed token/chunk-by-chunk
- message memory works per conversation
- MySQL stores conversations/messages reliably
- Redis stores hot history with 24h inactivity expiration
- Redis miss rehydrates from MySQL
- personality system prompt is active without expert identity claim
- all required scenario unit tests pass
- all required scenario integration tests pass with real LLM + real MySQL + real Redis
