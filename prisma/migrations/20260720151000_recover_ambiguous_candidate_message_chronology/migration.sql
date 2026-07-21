BEGIN;

-- Deployment requirement: stop and drain every candidate-communication worker before
-- correcting legacy completion markers. Runtime finalization uses the full stable tuple
-- (occurred_at, created_at, id); equal platform timestamps are intentionally resumed.
LOCK TABLE "public"."candidate_conversation_messages" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "public"."candidate_conversation_decisions" IN SHARE ROW EXCLUSIVE MODE;

WITH "ambiguous_decisions" AS (
    SELECT "decision"."id", "decision"."input_message_id"
    FROM "public"."candidate_conversation_decisions" AS "decision"
    INNER JOIN "public"."candidate_conversation_messages" AS "input_message"
      ON "input_message"."id" = "decision"."input_message_id"
    WHERE "decision"."finalized_at" IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM "public"."candidate_conversation_messages" AS "ambiguous_input"
          WHERE "ambiguous_input"."conversation_id" = "input_message"."conversation_id"
            AND "ambiguous_input"."user_id" = "input_message"."user_id"
            AND "ambiguous_input"."role" = 'candidate'
            AND "ambiguous_input"."occurred_at" = "input_message"."occurred_at"
            AND "ambiguous_input"."id" <> "input_message"."id"
      )
)
UPDATE "public"."candidate_conversation_messages" AS "input_message"
SET
    "processing_claim_id" = NULL,
    "processing_lease_expires_at" = NULL,
    "processing_outcome" = NULL,
    "processed_at" = NULL,
    "error_message" = NULL
FROM "ambiguous_decisions" AS "ambiguous"
WHERE "input_message"."id" = "ambiguous"."input_message_id";

WITH "ambiguous_decisions" AS (
    SELECT "decision"."id"
    FROM "public"."candidate_conversation_decisions" AS "decision"
    INNER JOIN "public"."candidate_conversation_messages" AS "input_message"
      ON "input_message"."id" = "decision"."input_message_id"
    WHERE "decision"."finalized_at" IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM "public"."candidate_conversation_messages" AS "ambiguous_input"
          WHERE "ambiguous_input"."conversation_id" = "input_message"."conversation_id"
            AND "ambiguous_input"."user_id" = "input_message"."user_id"
            AND "ambiguous_input"."role" = 'candidate'
            AND "ambiguous_input"."occurred_at" = "input_message"."occurred_at"
            AND "ambiguous_input"."id" <> "input_message"."id"
      )
)
UPDATE "public"."candidate_conversation_decisions" AS "decision"
SET "finalized_at" = NULL
FROM "ambiguous_decisions" AS "ambiguous"
WHERE "decision"."id" = "ambiguous"."id";

COMMIT;
