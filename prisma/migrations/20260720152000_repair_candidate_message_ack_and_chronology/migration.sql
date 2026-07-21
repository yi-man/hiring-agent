BEGIN;

-- Deployment requirement: stop and drain every candidate-communication worker before
-- applying this repair. The previous chronology migration intentionally reopened rows,
-- but the application has no durable database backlog worker. Recover directly from the
-- persisted decision and delivery checkpoints without rerunning LLM/browser side effects.
LOCK TABLE "public"."candidate_conversation_messages" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "public"."candidate_conversation_decisions" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "public"."candidate_action_logs" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "public"."candidate_conversations" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "public"."candidate_screening_results" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "_candidate_ambiguous_chronology_decisions" ON COMMIT DROP AS
SELECT
    "decision"."id" AS "decision_id",
    "decision"."conversation_id",
    "decision"."user_id",
    "decision"."job_description_id",
    "decision"."candidate_id",
    "decision"."input_message_id",
    "input_message"."occurred_at",
    "input_message"."created_at" AS "input_created_at"
FROM "public"."candidate_conversation_decisions" AS "decision"
INNER JOIN "public"."candidate_conversation_messages" AS "input_message"
  ON "input_message"."id" = "decision"."input_message_id"
 AND "input_message"."user_id" = "decision"."user_id"
WHERE "input_message"."role" = 'candidate'
  AND EXISTS (
      SELECT 1
      FROM "public"."candidate_conversation_messages" AS "same_occurrence"
      WHERE "same_occurrence"."conversation_id" = "input_message"."conversation_id"
        AND "same_occurrence"."user_id" = "input_message"."user_id"
        AND "same_occurrence"."role" = 'candidate'
        AND "same_occurrence"."occurred_at" = "input_message"."occurred_at"
        AND "same_occurrence"."id" <> "input_message"."id"
  );

CREATE UNIQUE INDEX "_candidate_ambiguous_chronology_decisions_id_key"
ON "_candidate_ambiguous_chronology_decisions"("decision_id");

-- Capture the pre-repair state. It is used later to distinguish a legacy communication
-- rejection from a genuine user withdrawal that happened after a corrected decision.
CREATE TEMP TABLE "_candidate_chronology_latest" ON COMMIT DROP AS
WITH "affected_conversations" AS (
    SELECT DISTINCT "user_id", "conversation_id"
    FROM "_candidate_ambiguous_chronology_decisions"
),
"ranked_decisions" AS (
    SELECT
        "decision"."id" AS "decision_id",
        "decision"."conversation_id",
        "decision"."user_id",
        "decision"."job_description_id",
        "decision"."candidate_id",
        "decision"."input_message_id",
        "decision"."output_message_id",
        "decision"."next_stage",
        "decision"."intent_level",
        "decision"."rationale",
        "decision"."finalized_at" AS "original_finalized_at",
        ("decision"."finalized_at" IS NOT NULL) AS "was_finalized",
        "input_message"."occurred_at",
        "input_message"."created_at" AS "input_created_at",
        "conversation"."stage" AS "original_conversation_stage",
        "conversation"."status" AS "original_conversation_status",
        "conversation"."outcome_result" AS "original_conversation_outcome",
        ROW_NUMBER() OVER (
            PARTITION BY "decision"."user_id", "decision"."conversation_id"
            ORDER BY
                "input_message"."occurred_at" DESC,
                "input_message"."created_at" DESC,
                "input_message"."id" DESC
        ) AS "decision_rank"
    FROM "affected_conversations" AS "affected"
    INNER JOIN "public"."candidate_conversation_decisions" AS "decision"
      ON "decision"."user_id" = "affected"."user_id"
     AND "decision"."conversation_id" = "affected"."conversation_id"
    INNER JOIN "public"."candidate_conversation_messages" AS "input_message"
      ON "input_message"."id" = "decision"."input_message_id"
     AND "input_message"."user_id" = "decision"."user_id"
     AND "input_message"."role" = 'candidate'
    INNER JOIN "public"."candidate_conversations" AS "conversation"
      ON "conversation"."id" = "decision"."conversation_id"
     AND "conversation"."user_id" = "decision"."user_id"
)
SELECT *
FROM "ranked_decisions"
WHERE "decision_rank" = 1;

CREATE UNIQUE INDEX "_candidate_chronology_latest_conversation_key"
ON "_candidate_chronology_latest"("user_id", "conversation_id");

-- Runtime gives decision.output_message_id priority. Only when it is null may the stable
-- synthetic external id be used as the outgoing checkpoint.
CREATE TEMP TABLE "_candidate_message_recovery" ON COMMIT DROP AS
WITH "checkpoint_evidence" AS (
    SELECT
        "decision"."id" AS "decision_id",
        "decision"."input_message_id",
        "decision"."finalized_at",
        "decision"."should_reply",
        "input_message"."processing_outcome",
        "input_message"."processed_at",
        "action_log"."id" AS "action_id",
        "action_log"."status" AS "action_status",
        "action_log"."error_message" AS "action_error_message",
        CASE
            WHEN "decision"."output_message_id" IS NOT NULL THEN "linked_output"."id"
            ELSE "stable_output"."id"
        END AS "outgoing_message_id",
        CASE
            WHEN "decision"."output_message_id" IS NOT NULL
                THEN "linked_output"."delivery_status"
            ELSE "stable_output"."delivery_status"
        END AS "outgoing_status",
        CASE
            WHEN "decision"."output_message_id" IS NOT NULL
                THEN "linked_output"."error_message"
            ELSE "stable_output"."error_message"
        END AS "outgoing_error_message",
        (
            "decision"."output_message_id" IS NOT NULL
            AND "linked_output"."id" IS NULL
        ) AS "decision_output_missing",
        ("ambiguous"."decision_id" IS NOT NULL) AS "was_reopened_by_chronology"
    FROM "public"."candidate_conversation_decisions" AS "decision"
    INNER JOIN "public"."candidate_conversation_messages" AS "input_message"
      ON "input_message"."id" = "decision"."input_message_id"
     AND "input_message"."user_id" = "decision"."user_id"
     AND "input_message"."role" = 'candidate'
    LEFT JOIN "_candidate_ambiguous_chronology_decisions" AS "ambiguous"
      ON "ambiguous"."decision_id" = "decision"."id"
    LEFT JOIN "public"."candidate_action_logs" AS "action_log"
      ON "action_log"."user_id" = "input_message"."user_id"
     AND "action_log"."idempotency_key" =
         'candidate-communication:' || "input_message"."id"
    LEFT JOIN "public"."candidate_conversation_messages" AS "linked_output"
      ON "decision"."output_message_id" IS NOT NULL
     AND "linked_output"."id" = "decision"."output_message_id"
     AND "linked_output"."user_id" = "decision"."user_id"
     AND "linked_output"."conversation_id" = "decision"."conversation_id"
     AND "linked_output"."role" = 'agent'
    LEFT JOIN "public"."candidate_conversation_messages" AS "stable_output"
      ON "decision"."output_message_id" IS NULL
     AND "stable_output"."user_id" = "input_message"."user_id"
     AND "stable_output"."conversation_id" = "input_message"."conversation_id"
     AND "stable_output"."platform" = "input_message"."platform"
     AND "stable_output"."role" = 'agent'
     AND "stable_output"."external_message_id" =
         'candidate-communication-reply:' || "input_message"."id"
),
"classified_evidence" AS (
    SELECT
        "evidence".*,
        CASE
            WHEN "decision_output_missing"
              OR "action_error_message" =
                 '候选人消息发送结果未知，未自动重发以避免重复，请在平台核对后手动重新沟通。'
              OR "outgoing_error_message" =
                 '候选人消息发送结果未知，未自动重发以避免重复，请在平台核对后手动重新沟通。'
              OR "action_status" IN ('planned', 'running')
              OR "outgoing_status" = 'planned'
                THEN 'delivery_unknown'
            WHEN "action_status" = 'failed' OR "outgoing_status" = 'failed'
                THEN 'delivery_failed'
            WHEN "should_reply"
              AND NOT (
                  "action_status" = 'success'
                  OR "outgoing_status" = 'sent'
              )
                THEN 'delivery_unknown'
            ELSE 'processed_ackable'
        END AS "recovered_outcome"
    FROM "checkpoint_evidence" AS "evidence"
)
SELECT *
FROM "classified_evidence" AS "classified"
WHERE (
    "was_reopened_by_chronology"
    AND (
        "finalized_at" IS NULL
        OR "processed_at" IS NULL
        OR "processing_outcome" IS NULL
    )
  )
  OR (
    "finalized_at" IS NOT NULL
    AND "processing_outcome" = 'processed_ackable'
    AND "recovered_outcome" <> 'processed_ackable'
  );

CREATE UNIQUE INDEX "_candidate_message_recovery_decision_key"
ON "_candidate_message_recovery"("decision_id");

UPDATE "public"."candidate_action_logs" AS "action_log"
SET
    "status" = 'failed',
    "error_message" =
        '候选人消息发送结果未知，未自动重发以避免重复，请在平台核对后手动重新沟通。'
FROM "_candidate_message_recovery" AS "recovery"
WHERE "action_log"."id" = "recovery"."action_id"
  AND "recovery"."recovered_outcome" = 'delivery_unknown'
  AND "action_log"."status" IN ('planned', 'running');

UPDATE "public"."candidate_conversation_messages" AS "outgoing"
SET
    "delivery_status" = 'failed',
    "error_message" =
        '候选人消息发送结果未知，未自动重发以避免重复，请在平台核对后手动重新沟通。'
FROM "_candidate_message_recovery" AS "recovery"
WHERE "outgoing"."id" = "recovery"."outgoing_message_id"
  AND "recovery"."recovered_outcome" = 'delivery_unknown'
  AND "outgoing"."delivery_status" = 'planned';

UPDATE "public"."candidate_conversation_messages" AS "input_message"
SET
    "processing_claim_id" = NULL,
    "processing_lease_expires_at" = NULL,
    "processing_outcome" = "recovery"."recovered_outcome",
    "processed_at" = COALESCE(
        "input_message"."processed_at",
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    ),
    "error_message" = CASE "recovery"."recovered_outcome"
        WHEN 'delivery_unknown' THEN
            '候选人消息发送结果未知，未自动重发以避免重复，请在平台核对后手动重新沟通。'
        WHEN 'delivery_failed' THEN
            COALESCE(
                "input_message"."error_message",
                '候选人消息发送失败，请核对后手动重新沟通。'
            )
        ELSE NULL
    END
FROM "_candidate_message_recovery" AS "recovery"
WHERE "input_message"."id" = "recovery"."input_message_id";

UPDATE "public"."candidate_conversation_decisions" AS "decision"
SET "finalized_at" = COALESCE(
    "decision"."finalized_at",
    (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
)
FROM "_candidate_message_recovery" AS "recovery"
WHERE "decision"."id" = "recovery"."decision_id";

-- Rebuild only affected conversations from the globally latest persisted decision. Do not
-- increment message_count and do not recreate memory: both effects may already have been
-- written before 151000 reopened the decision.
WITH "canonical_latest" AS (
    SELECT
        "latest".*,
        CASE
            WHEN "latest"."output_message_id" IS NOT NULL THEN "linked_output"."occurred_at"
            ELSE "stable_output"."occurred_at"
        END AS "last_agent_message_at",
        (
            SELECT COUNT(*)::INTEGER
            FROM "public"."candidate_conversation_messages" AS "message"
            WHERE "message"."conversation_id" = "latest"."conversation_id"
              AND "message"."user_id" = "latest"."user_id"
        ) AS "message_count"
    FROM "_candidate_chronology_latest" AS "latest"
    INNER JOIN "public"."candidate_conversation_decisions" AS "decision"
      ON "decision"."id" = "latest"."decision_id"
     AND "decision"."finalized_at" IS NOT NULL
    LEFT JOIN "public"."candidate_conversation_messages" AS "linked_output"
      ON "latest"."output_message_id" IS NOT NULL
     AND "linked_output"."id" = "latest"."output_message_id"
     AND "linked_output"."user_id" = "latest"."user_id"
     AND "linked_output"."conversation_id" = "latest"."conversation_id"
     AND "linked_output"."role" = 'agent'
    LEFT JOIN "public"."candidate_conversation_messages" AS "stable_output"
      ON "latest"."output_message_id" IS NULL
     AND "stable_output"."user_id" = "latest"."user_id"
     AND "stable_output"."conversation_id" = "latest"."conversation_id"
     AND "stable_output"."role" = 'agent'
     AND "stable_output"."external_message_id" =
         'candidate-communication-reply:' || "latest"."input_message_id"
    WHERE "latest"."next_stage" IN (
        'new',
        'screening',
        'waiting_resume',
        'resume_received',
        'evaluating',
        'contact_requested',
        'contact_exchanged',
        'rejected',
        'closed'
    )
      AND NOT EXISTS (
          SELECT 1
          FROM "public"."candidate_conversation_messages" AS "later_input"
          WHERE "later_input"."conversation_id" = "latest"."conversation_id"
            AND "later_input"."user_id" = "latest"."user_id"
            AND "later_input"."role" = 'candidate'
            AND (
                "later_input"."occurred_at",
                "later_input"."created_at",
                "later_input"."id"
            ) > (
                "latest"."occurred_at",
                "latest"."input_created_at",
                "latest"."input_message_id"
            )
      )
)
UPDATE "public"."candidate_conversations" AS "conversation"
SET
    "stage" = "canonical"."next_stage",
    "status" = CASE
        WHEN "canonical"."next_stage" IN ('contact_exchanged', 'rejected', 'closed')
            THEN 'closed'
        ELSE 'active'
    END,
    "intent_level" = "canonical"."intent_level",
    "message_count" = "canonical"."message_count",
    "last_active_at" = "canonical"."occurred_at",
    "last_candidate_message_at" = "canonical"."occurred_at",
    "last_agent_message_at" = "canonical"."last_agent_message_at",
    "next_follow_up_at" = CASE
        WHEN "canonical"."next_stage" IN ('waiting_resume', 'contact_requested')
            THEN "canonical"."occurred_at" + INTERVAL '24 hours'
        ELSE NULL
    END,
    "outcome_result" = CASE "canonical"."next_stage"
        WHEN 'contact_exchanged' THEN 'contact_exchanged'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'closed' THEN 'no_response'
        ELSE NULL
    END,
    "outcome_reason" = CASE
        WHEN "canonical"."next_stage" IN ('contact_exchanged', 'rejected', 'closed')
            THEN "canonical"."rationale"
        ELSE NULL
    END,
    "updated_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
FROM "canonical_latest" AS "canonical"
WHERE "conversation"."id" = "canonical"."conversation_id"
  AND "conversation"."user_id" = "canonical"."user_id"
  AND "conversation"."job_description_id" = "canonical"."job_description_id"
  AND "conversation"."candidate_id" = "canonical"."candidate_id";

-- Reopen withdrawn screening only with strong chronology evidence. The first branch covers
-- an untouched 151000 backlog whose conversation still records the legacy rejection. The
-- second covers an already-reprocessed newer decision only when withdrawal predates that
-- finalization, so a later genuine user withdrawal is preserved.
WITH "safe_screening_reopen" AS (
    SELECT "screening_result"."id"
    FROM "_candidate_chronology_latest" AS "latest"
    INNER JOIN "public"."candidate_conversation_decisions" AS "decision"
      ON "decision"."id" = "latest"."decision_id"
     AND "decision"."finalized_at" IS NOT NULL
    INNER JOIN "public"."candidate_conversations" AS "conversation"
      ON "conversation"."id" = "latest"."conversation_id"
     AND "conversation"."user_id" = "latest"."user_id"
     AND "conversation"."stage" = "latest"."next_stage"
    INNER JOIN "public"."candidate_screening_results" AS "screening_result"
      ON "screening_result"."user_id" = "latest"."user_id"
     AND "screening_result"."job_description_id" = "latest"."job_description_id"
     AND "screening_result"."candidate_id" = "latest"."candidate_id"
     AND "screening_result"."interview_stage" = 'withdrawn'
    WHERE "latest"."next_stage" <> 'rejected'
      AND "conversation"."last_candidate_message_at" = "latest"."occurred_at"
      AND EXISTS (
          SELECT 1
          FROM "public"."candidate_conversation_decisions" AS "older_decision"
          INNER JOIN "public"."candidate_conversation_messages" AS "older_message"
            ON "older_message"."id" = "older_decision"."input_message_id"
           AND "older_message"."user_id" = "older_decision"."user_id"
          WHERE "older_decision"."user_id" = "latest"."user_id"
            AND "older_decision"."conversation_id" = "latest"."conversation_id"
            AND "older_decision"."next_stage" = 'rejected'
            AND "older_message"."occurred_at" = "latest"."occurred_at"
            AND (
                "older_message"."occurred_at",
                "older_message"."created_at",
                "older_message"."id"
            ) < (
                "latest"."occurred_at",
                "latest"."input_created_at",
                "latest"."input_message_id"
            )
      )
      AND NOT EXISTS (
          SELECT 1
          FROM "public"."candidate_conversation_messages" AS "later_input"
          WHERE "later_input"."conversation_id" = "latest"."conversation_id"
            AND "later_input"."user_id" = "latest"."user_id"
            AND "later_input"."role" = 'candidate'
            AND (
                "later_input"."occurred_at",
                "later_input"."created_at",
                "later_input"."id"
            ) > (
                "latest"."occurred_at",
                "latest"."input_created_at",
                "latest"."input_message_id"
            )
      )
      AND (
          (
              "latest"."original_conversation_stage" = 'rejected'
              AND "latest"."original_conversation_status" = 'closed'
              AND "latest"."original_conversation_outcome" = 'rejected'
          )
          OR (
              "latest"."was_finalized"
              AND "latest"."original_conversation_stage" = "latest"."next_stage"
              AND "latest"."original_finalized_at" IS NOT NULL
              AND "screening_result"."updated_at" < "latest"."original_finalized_at"
          )
      )
)
UPDATE "public"."candidate_screening_results" AS "screening_result"
SET
    "interview_stage" = 'replied',
    "updated_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
FROM "safe_screening_reopen" AS "safe"
WHERE "screening_result"."id" = "safe"."id"
  AND "screening_result"."interview_stage" = 'withdrawn';

COMMIT;
