CREATE TABLE "public"."job_descriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "position_description" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'tech',
    "status" TEXT NOT NULL DEFAULT 'created',
    "content" JSONB NOT NULL,
    "evaluation" JSONB,
    "generation_meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_descriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_job_descriptions_user_id" ON "public"."job_descriptions"("user_id");
CREATE INDEX "idx_job_descriptions_status" ON "public"."job_descriptions"("status");
CREATE INDEX "idx_job_descriptions_updated_at" ON "public"."job_descriptions"("updated_at" DESC);
CREATE INDEX "idx_job_descriptions_user_status" ON "public"."job_descriptions"("user_id", "status");

ALTER TABLE "public"."job_descriptions"
ADD CONSTRAINT "job_descriptions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE CASCADE ON UPDATE RESTRICT;
