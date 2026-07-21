/** @jest-environment node */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260720140000_dedupe_candidate_external_messages/migration.sql',
  ),
  'utf8',
);

const recoveryMigration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260720150000_add_candidate_message_processing_recovery/migration.sql',
  ),
  'utf8',
);

const chronologyRecoveryMigration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260720151000_recover_ambiguous_candidate_message_chronology/migration.sql',
  ),
  'utf8',
);

const ackAndChronologyRepairMigration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260720152000_repair_candidate_message_ack_and_chronology/migration.sql',
  ),
  'utf8',
);

describe('candidate external message deduplication migration', () => {
  it('removes unsafe rendered row ids before global external-id deduplication', () => {
    const clearLegacyIds = migration.indexOf('SET "external_message_id" = NULL');
    const buildDedupMap = migration.indexOf(
      'CREATE TEMP TABLE "_candidate_conversation_message_dedup"',
    );
    const createUniqueIndex = migration.indexOf(
      'CREATE UNIQUE INDEX "candidate_conversation_messages_user_platform_external_key"',
    );

    expect(clearLegacyIds).toBeGreaterThan(-1);
    expect(buildDedupMap).toBeGreaterThan(clearLegacyIds);
    expect(createUniqueIndex).toBeGreaterThan(buildDedupMap);
    expect(migration).toContain('WHERE "external_message_id" LIKE \'rendered-row:%\'');
    expect(migration).not.toContain('WHERE "platform" = \'boss-like\'');
  });

  it('recounts affected conversations after deleting duplicate message rows', () => {
    const deleteDuplicates = migration.indexOf(
      'DELETE FROM "public"."candidate_conversation_messages"',
    );
    const recountMessages = migration.indexOf(
      'UPDATE "public"."candidate_conversations" AS "conversation"',
    );
    const dropDedupMap = migration.indexOf('DROP TABLE "_candidate_conversation_message_dedup"');

    expect(deleteDuplicates).toBeGreaterThan(-1);
    expect(recountMessages).toBeGreaterThan(deleteDuplicates);
    expect(migration).toContain('SELECT COUNT(*)::INTEGER');
    expect(dropDedupMap).toBeGreaterThan(recountMessages);
  });
});

describe('candidate message processing recovery migration', () => {
  it('locks every communication write table before backfill and uniqueness changes', () => {
    expect(recoveryMigration).toContain(
      'stop and drain every candidate-communication worker before',
    );
    for (const table of [
      'candidate_conversation_messages',
      'candidate_conversation_decisions',
      'candidate_action_logs',
      'candidate_conversations',
    ]) {
      expect(recoveryMigration).toContain(
        `LOCK TABLE "public"."${table}" IN SHARE ROW EXCLUSIVE MODE`,
      );
    }
  });

  it('adds explicit claims, terminal outcomes, and one decision per input message', () => {
    expect(recoveryMigration).toContain('ADD COLUMN "processing_claim_id" TEXT');
    expect(recoveryMigration).toContain('ADD COLUMN "processing_lease_expires_at" TIMESTAMP(3)');
    expect(recoveryMigration).toContain('ADD COLUMN "processing_outcome" TEXT');
    expect(recoveryMigration).toContain('ADD COLUMN "processed_at" TIMESTAMP(3)');
    expect(recoveryMigration).toContain('ADD COLUMN "finalized_at" TIMESTAMP(3)');
    expect(recoveryMigration).toContain(
      'CREATE UNIQUE INDEX "candidate_conversation_decisions_input_message_key"',
    );
    for (const outcome of [
      'in_flight',
      'processed_ackable',
      'delivery_failed',
      'delivery_unknown',
    ]) {
      expect(recoveryMigration).toContain(`'${outcome}'`);
    }
  });

  it('only treats an exact legacy message occurrence as already finalized', () => {
    expect(recoveryMigration).toContain(
      '"conversation"."last_candidate_message_at" = "input_message"."occurred_at"',
    );
    expect(recoveryMigration).not.toContain(
      '"conversation"."last_candidate_message_at" >= "input_message"."occurred_at"',
    );
  });

  it('reopens ambiguous equal-timestamp legacy decisions for tuple-based recovery', () => {
    expect(chronologyRecoveryMigration).toContain(
      'Runtime finalization uses the full stable tuple',
    );
    expect(chronologyRecoveryMigration).toContain(
      '"ambiguous_input"."occurred_at" = "input_message"."occurred_at"',
    );
    expect(chronologyRecoveryMigration).toContain('"processing_outcome" = NULL');
    expect(chronologyRecoveryMigration).toContain('"processed_at" = NULL');
    expect(chronologyRecoveryMigration).toContain('SET "finalized_at" = NULL');
  });
});

describe('candidate acknowledgement and chronology repair migration', () => {
  it('recovers persisted checkpoints directly while every communication table is locked', () => {
    expect(ackAndChronologyRepairMigration).toContain(
      'Recover directly from the\n-- persisted decision and delivery checkpoints',
    );
    for (const table of [
      'candidate_conversation_messages',
      'candidate_conversation_decisions',
      'candidate_action_logs',
      'candidate_conversations',
      'candidate_screening_results',
    ]) {
      expect(ackAndChronologyRepairMigration).toContain(
        `LOCK TABLE "public"."${table}" IN SHARE ROW EXCLUSIVE MODE`,
      );
    }
  });

  it('classifies every ambiguous finalized delivery checkpoint as non-ackable', () => {
    expect(ackAndChronologyRepairMigration).toContain('"decision_output_missing"');
    expect(ackAndChronologyRepairMigration).toContain(
      "\"action_status\" IN ('planned', 'running')",
    );
    expect(ackAndChronologyRepairMigration).toContain('"outgoing_status" = \'planned\'');
    expect(ackAndChronologyRepairMigration).toContain("THEN 'delivery_unknown'");
    expect(ackAndChronologyRepairMigration).toContain(
      '"finalized_at" IS NOT NULL\n    AND "processing_outcome" = \'processed_ackable\'',
    );
    expect(ackAndChronologyRepairMigration).toContain(
      'SET "finalized_at" = COALESCE(\n    "decision"."finalized_at",\n    (CURRENT_TIMESTAMP AT TIME ZONE \'UTC\')',
    );
  });

  it('writes every repaired timestamp in UTC for timestamp-without-time-zone columns', () => {
    const utcTimestamps = ackAndChronologyRepairMigration.match(
      /\(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'\)/g,
    );

    expect(utcTimestamps).toHaveLength(4);
    expect(ackAndChronologyRepairMigration).not.toMatch(
      /= (?:COALESCE\([^;]*, )?CURRENT_TIMESTAMP(?:[,;)\n])/,
    );
  });

  it('fails ambiguous planned writes closed without replaying side effects', () => {
    expect(ackAndChronologyRepairMigration).toContain(
      'AND "action_log"."status" IN (\'planned\', \'running\')',
    );
    expect(ackAndChronologyRepairMigration).toContain(
      'AND "outgoing"."delivery_status" = \'planned\'',
    );
    expect(ackAndChronologyRepairMigration).toContain(
      '"processing_outcome" = "recovery"."recovered_outcome"',
    );
    expect(ackAndChronologyRepairMigration).not.toContain(
      'INSERT INTO "public"."candidate_conversation_memories"',
    );
    expect(ackAndChronologyRepairMigration).not.toMatch(
      /"message_count"\s*=\s*"message_count"\s*\+/,
    );
  });

  it('recounts messages and rebuilds chronology from the full stable tuple', () => {
    expect(ackAndChronologyRepairMigration).toContain('SELECT COUNT(*)::INTEGER');
    expect(ackAndChronologyRepairMigration).toContain(
      '"message_count" = "canonical"."message_count"',
    );
    expect(ackAndChronologyRepairMigration).toContain(
      '"input_message"."occurred_at" DESC,\n                "input_message"."created_at" DESC,\n                "input_message"."id" DESC',
    );
    expect(ackAndChronologyRepairMigration).toContain(
      '(\n                "later_input"."occurred_at",\n                "later_input"."created_at",\n                "later_input"."id"\n            ) >',
    );
  });

  it('reopens withdrawn screening only with older rejection evidence and no later message', () => {
    expect(ackAndChronologyRepairMigration).toContain('WITH "safe_screening_reopen" AS');
    expect(ackAndChronologyRepairMigration).toContain(
      '"older_decision"."next_stage" = \'rejected\'',
    );
    expect(ackAndChronologyRepairMigration).toContain(
      '"older_message"."occurred_at" = "latest"."occurred_at"',
    );
    expect(ackAndChronologyRepairMigration).toContain(
      '"latest"."original_conversation_stage" = \'rejected\'',
    );
    expect(ackAndChronologyRepairMigration).toContain(
      '"screening_result"."updated_at" < "latest"."original_finalized_at"',
    );
    expect(ackAndChronologyRepairMigration).toContain('SET\n    "interview_stage" = \'replied\'');
  });
});
