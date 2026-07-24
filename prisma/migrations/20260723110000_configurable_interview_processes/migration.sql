ALTER TABLE "company_profiles"
ADD COLUMN "interview_processes" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "job_descriptions"
ADD COLUMN "interview_process" JSONB;

ALTER TABLE "job_description_create_runs"
ADD COLUMN "interview_process" JSONB;

ALTER TABLE "candidate_screening_results"
ADD COLUMN "interview_assignments" JSONB NOT NULL DEFAULT '[]';
