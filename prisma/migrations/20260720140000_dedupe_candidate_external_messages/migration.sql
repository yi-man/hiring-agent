BEGIN;

-- Candidate communication ingress/workers must be stopped and drained while this
-- migration runs because message, action-log, and decision writes are separate transactions.
LOCK TABLE "public"."candidate_conversation_messages" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "public"."candidate_conversation_decisions" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "public"."candidate_conversations" IN SHARE ROW EXCLUSIVE MODE;

-- rendered-row:<position> was a UI-list position rather than a message identity.
-- Preserve those rows but exclude the unsafe legacy value from global deduplication.
UPDATE "public"."candidate_conversation_messages"
SET "external_message_id" = NULL
WHERE "external_message_id" LIKE 'rendered-row:%';

-- Prefer a message that already owns a completed/running action so a replay keeps
-- using the action's existing idempotency key. Fall back to a referenced message,
-- then to the earliest persisted row.
CREATE TEMP TABLE "_candidate_conversation_message_dedup" AS
WITH "decision_references" AS (
    SELECT "input_message_id" AS "message_id"
    FROM "public"."candidate_conversation_decisions"
    UNION
    SELECT "output_message_id" AS "message_id"
    FROM "public"."candidate_conversation_decisions"
    WHERE "output_message_id" IS NOT NULL
),
"candidates" AS (
    SELECT
        "message"."id",
        "message"."conversation_id",
        "message"."user_id",
        "message"."platform",
        "message"."external_message_id",
        "message"."created_at",
        COALESCE((
            SELECT MAX(
                CASE "action_log"."status"
                    WHEN 'success' THEN 5
                    WHEN 'running' THEN 4
                    WHEN 'planned' THEN 3
                    WHEN 'failed' THEN 2
                    WHEN 'skipped' THEN 1
                    ELSE 0
                END
            )
            FROM "public"."candidate_action_logs" AS "action_log"
            WHERE "action_log"."user_id" = "message"."user_id"
              AND "action_log"."idempotency_key" = 'candidate-communication:' || "message"."id"
        ), 0) AS "action_priority",
        CASE WHEN "decision_reference"."message_id" IS NULL THEN 0 ELSE 1 END
            AS "decision_priority"
    FROM "public"."candidate_conversation_messages" AS "message"
    LEFT JOIN "decision_references" AS "decision_reference"
      ON "decision_reference"."message_id" = "message"."id"
    WHERE "message"."external_message_id" IS NOT NULL
),
"ranked" AS (
    SELECT
        "id" AS "message_id",
        "conversation_id",
        FIRST_VALUE("id") OVER (
            PARTITION BY "user_id", "platform", "external_message_id"
            ORDER BY "action_priority" DESC, "decision_priority" DESC, "created_at", "id"
        ) AS "canonical_id",
        ROW_NUMBER() OVER (
            PARTITION BY "user_id", "platform", "external_message_id"
            ORDER BY "action_priority" DESC, "decision_priority" DESC, "created_at", "id"
        ) AS "duplicate_rank"
    FROM "candidates"
)
SELECT
    "message_id" AS "duplicate_id",
    "canonical_id",
    "conversation_id" AS "duplicate_conversation_id"
FROM "ranked"
WHERE "duplicate_rank" > 1;

UPDATE "public"."candidate_conversation_decisions" AS "decision"
SET "input_message_id" = "dedup"."canonical_id"
FROM "_candidate_conversation_message_dedup" AS "dedup"
WHERE "decision"."input_message_id" = "dedup"."duplicate_id";

UPDATE "public"."candidate_conversation_decisions" AS "decision"
SET "output_message_id" = "dedup"."canonical_id"
FROM "_candidate_conversation_message_dedup" AS "dedup"
WHERE "decision"."output_message_id" = "dedup"."duplicate_id";

DELETE FROM "public"."candidate_conversation_messages" AS "message"
USING "_candidate_conversation_message_dedup" AS "dedup"
WHERE "message"."id" = "dedup"."duplicate_id";

UPDATE "public"."candidate_conversations" AS "conversation"
SET "message_count" = (
    SELECT COUNT(*)::INTEGER
    FROM "public"."candidate_conversation_messages" AS "message"
    WHERE "message"."conversation_id" = "conversation"."id"
)
WHERE "conversation"."id" IN (
    SELECT "duplicate_conversation_id"
    FROM "_candidate_conversation_message_dedup"
);

DROP TABLE "_candidate_conversation_message_dedup";

DROP INDEX "public"."idx_candidate_conversation_messages_external";
CREATE UNIQUE INDEX "candidate_conversation_messages_user_platform_external_key"
ON "public"."candidate_conversation_messages"("user_id", "platform", "external_message_id");

COMMIT;
