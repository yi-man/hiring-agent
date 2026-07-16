ALTER TABLE "public"."candidate_interview_feedbacks"
ADD COLUMN "dimension_ratings" JSONB NOT NULL DEFAULT '[]'::jsonb;
