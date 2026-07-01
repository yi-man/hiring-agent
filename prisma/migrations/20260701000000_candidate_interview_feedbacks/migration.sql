CREATE TABLE "public"."candidate_interview_feedbacks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_description_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "interviewer" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "pros" JSONB NOT NULL,
    "cons" JSONB NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_interview_feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "candidate_interview_feedbacks_user_jd_candidate_stage_key" ON "public"."candidate_interview_feedbacks"("user_id", "job_description_id", "candidate_id", "stage");

CREATE INDEX "idx_candidate_interview_feedbacks_user_jd_candidate" ON "public"."candidate_interview_feedbacks"("user_id", "job_description_id", "candidate_id");

CREATE INDEX "idx_candidate_interview_feedbacks_user_stage_updated" ON "public"."candidate_interview_feedbacks"("user_id", "stage", "updated_at" DESC);

ALTER TABLE "public"."candidate_interview_feedbacks" ADD CONSTRAINT "candidate_interview_feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."candidate_interview_feedbacks" ADD CONSTRAINT "candidate_interview_feedbacks_job_description_id_user_id_fkey" FOREIGN KEY ("job_description_id", "user_id") REFERENCES "public"."job_descriptions"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."candidate_interview_feedbacks" ADD CONSTRAINT "candidate_interview_feedbacks_candidate_id_user_id_fkey" FOREIGN KEY ("candidate_id", "user_id") REFERENCES "public"."candidates"("id", "user_id") ON DELETE CASCADE ON UPDATE RESTRICT;
