ALTER TABLE "candidate_screening_runs"
ADD COLUMN "skill_id" TEXT,
ADD COLUMN "current_workflow_step" TEXT;

CREATE INDEX "idx_candidate_screening_runs_skill_id"
ON "candidate_screening_runs"("skill_id");
