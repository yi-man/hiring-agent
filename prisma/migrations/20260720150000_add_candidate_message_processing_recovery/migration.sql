BEGIN;

-- Deployment requirement: stop and drain every candidate-communication worker before
-- applying this migration. Message claims, decisions, and outgoing replies are migrated
-- under table locks so no legacy write can appear between backfill and unique indexes.
LOCK TABLE "public"."candidate_conversation_messages" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "public"."candidate_conversation_decisions" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "public"."candidate_action_logs" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "public"."candidate_conversations" IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE "public"."candidate_conversation_messages"
    ADD COLUMN "processing_claim_id" TEXT,
    ADD COLUMN "processing_lease_expires_at" TIMESTAMP(3),
    ADD COLUMN "processing_outcome" TEXT,
    ADD COLUMN "processed_at" TIMESTAMP(3);

ALTER TABLE "public"."candidate_conversation_decisions"
    ADD COLUMN "finalized_at" TIMESTAMP(3);

-- Keep one deterministic decision per input message. Prefer a row linked to an outgoing
-- message, then the latest persisted decision.
WITH "ranked_decisions" AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "input_message_id"
            ORDER BY
                CASE WHEN "output_message_id" IS NULL THEN 0 ELSE 1 END DESC,
                "created_at" DESC,
                "id" DESC
        ) AS "duplicate_rank"
    FROM "public"."candidate_conversation_decisions"
)
DELETE FROM "public"."candidate_conversation_decisions" AS "decision"
USING "ranked_decisions" AS "ranked"
WHERE "decision"."id" = "ranked"."id"
  AND "ranked"."duplicate_rank" > 1;

DROP INDEX IF EXISTS "public"."idx_candidate_conversation_decisions_input_message";
CREATE UNIQUE INDEX "candidate_conversation_decisions_input_message_key"
ON "public"."candidate_conversation_decisions"("input_message_id");

-- Legacy outgoing rows had no link to their input. Workers were sequential per
-- conversation, so deterministically attach the first agent row after each candidate row
-- and before the next candidate row. Runtime recovery never performs this time-window guess.
WITH "candidate_turns" AS (
    SELECT
        "candidate_message"."id" AS "input_message_id",
        (
            SELECT "agent_message"."id"
            FROM "public"."candidate_conversation_messages" AS "agent_message"
            WHERE "agent_message"."conversation_id" = "candidate_message"."conversation_id"
              AND "agent_message"."user_id" = "candidate_message"."user_id"
              AND "agent_message"."role" = 'agent'
              AND (
                  "agent_message"."created_at",
                  "agent_message"."id"
              ) > (
                  "candidate_message"."created_at",
                  "candidate_message"."id"
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM "public"."candidate_conversation_messages" AS "next_candidate"
                  WHERE "next_candidate"."conversation_id" = "candidate_message"."conversation_id"
                    AND "next_candidate"."user_id" = "candidate_message"."user_id"
                    AND "next_candidate"."role" = 'candidate'
                    AND (
                        "next_candidate"."created_at",
                        "next_candidate"."id"
                    ) > (
                        "candidate_message"."created_at",
                        "candidate_message"."id"
                    )
                    AND (
                        "next_candidate"."created_at",
                        "next_candidate"."id"
                    ) < (
                        "agent_message"."created_at",
                        "agent_message"."id"
                    )
              )
            ORDER BY "agent_message"."created_at", "agent_message"."id"
            LIMIT 1
        ) AS "output_message_id"
    FROM "public"."candidate_conversation_messages" AS "candidate_message"
    WHERE "candidate_message"."role" = 'candidate'
),
"safe_backfill" AS (
    SELECT "turn"."input_message_id", "turn"."output_message_id"
    FROM "candidate_turns" AS "turn"
    WHERE "turn"."output_message_id" IS NOT NULL
)
UPDATE "public"."candidate_conversation_messages" AS "outgoing"
SET "external_message_id" = 'candidate-communication-reply:' || "backfill"."input_message_id"
FROM "safe_backfill" AS "backfill"
WHERE "outgoing"."id" = "backfill"."output_message_id"
  AND "outgoing"."external_message_id" IS NULL;

-- A legacy decision is finalized only when the conversation already reflects that exact
-- input occurrence and stage. Other decisions are resumed idempotently after deployment.
UPDATE "public"."candidate_conversation_decisions" AS "decision"
SET "finalized_at" = "decision"."created_at"
FROM "public"."candidate_conversation_messages" AS "input_message",
     "public"."candidate_conversations" AS "conversation"
WHERE "input_message"."id" = "decision"."input_message_id"
  AND "conversation"."id" = "decision"."conversation_id"
  AND "conversation"."stage" = "decision"."next_stage"
  AND "conversation"."last_candidate_message_at" = "input_message"."occurred_at";

UPDATE "public"."candidate_conversation_messages" AS "input_message"
SET
    "processing_outcome" = CASE
        WHEN "outgoing"."delivery_status" = 'failed' THEN 'delivery_failed'
        ELSE 'processed_ackable'
    END,
    "processed_at" = COALESCE("decision"."finalized_at", "decision"."created_at")
FROM "public"."candidate_conversation_decisions" AS "decision"
LEFT JOIN "public"."candidate_conversation_messages" AS "outgoing"
  ON "outgoing"."id" = "decision"."output_message_id"
WHERE "input_message"."id" = "decision"."input_message_id"
  AND "decision"."finalized_at" IS NOT NULL;

-- Legacy external attempts without a decision cannot be reconstructed safely. Make them
-- observable and non-ackable instead of replaying a possibly already-sent message.
WITH "legacy_attempts" AS (
    SELECT
        "input_message"."id" AS "input_message_id",
        MAX(CASE WHEN "action_log"."status" = 'failed' THEN 1 ELSE 0 END) AS "action_failed",
        MAX(CASE WHEN "outgoing"."delivery_status" = 'failed' THEN 1 ELSE 0 END) AS "outgoing_failed"
    FROM "public"."candidate_conversation_messages" AS "input_message"
    LEFT JOIN "public"."candidate_action_logs" AS "action_log"
      ON "action_log"."user_id" = "input_message"."user_id"
     AND "action_log"."idempotency_key" = 'candidate-communication:' || "input_message"."id"
    LEFT JOIN "public"."candidate_conversation_messages" AS "outgoing"
      ON "outgoing"."user_id" = "input_message"."user_id"
     AND "outgoing"."platform" = "input_message"."platform"
     AND "outgoing"."external_message_id" = 'candidate-communication-reply:' || "input_message"."id"
    WHERE "input_message"."role" = 'candidate'
      AND NOT EXISTS (
          SELECT 1
          FROM "public"."candidate_conversation_decisions" AS "decision"
          WHERE "decision"."input_message_id" = "input_message"."id"
      )
      AND ("action_log"."id" IS NOT NULL OR "outgoing"."id" IS NOT NULL)
    GROUP BY "input_message"."id"
)
UPDATE "public"."candidate_conversation_messages" AS "input_message"
SET
    "processing_outcome" = CASE
        WHEN "attempt"."action_failed" = 1 OR "attempt"."outgoing_failed" = 1
            THEN 'delivery_failed'
        ELSE 'delivery_unknown'
    END,
    "processed_at" = NOW(),
    "error_message" = CASE
        WHEN "attempt"."action_failed" = 1 OR "attempt"."outgoing_failed" = 1
            THEN '候选人消息发送失败，请核对后手动重新沟通。'
        ELSE '候选人消息发送结果未知，未自动重发以避免重复，请在平台核对后手动重新沟通。'
    END
FROM "legacy_attempts" AS "attempt"
WHERE "input_message"."id" = "attempt"."input_message_id";

UPDATE "public"."candidate_action_logs" AS "action_log"
SET
    "status" = 'failed',
    "error_message" = '候选人消息发送结果未知，未自动重发以避免重复，请在平台核对后手动重新沟通。'
FROM "public"."candidate_conversation_messages" AS "input_message"
WHERE "action_log"."user_id" = "input_message"."user_id"
  AND "action_log"."idempotency_key" = 'candidate-communication:' || "input_message"."id"
  AND "input_message"."processing_outcome" = 'delivery_unknown'
  AND "action_log"."status" IN ('planned', 'running');

UPDATE "public"."candidate_conversation_messages" AS "outgoing"
SET
    "delivery_status" = 'failed',
    "error_message" = '候选人消息发送结果未知，未自动重发以避免重复，请在平台核对后手动重新沟通。'
FROM "public"."candidate_conversation_messages" AS "input_message"
WHERE "outgoing"."user_id" = "input_message"."user_id"
  AND "outgoing"."platform" = "input_message"."platform"
  AND "outgoing"."external_message_id" = 'candidate-communication-reply:' || "input_message"."id"
  AND "input_message"."processing_outcome" = 'delivery_unknown'
  AND "outgoing"."delivery_status" = 'planned';

ALTER TABLE "public"."candidate_conversation_messages"
    ADD CONSTRAINT "candidate_conversation_messages_processing_outcome_check"
    CHECK (
        "processing_outcome" IS NULL OR
        "processing_outcome" IN (
            'in_flight',
            'processed_ackable',
            'delivery_failed',
            'delivery_unknown'
        )
    );

CREATE INDEX "idx_candidate_conversation_messages_processing_lease"
ON "public"."candidate_conversation_messages"("processing_outcome", "processing_lease_expires_at");

COMMIT;
