CREATE TABLE "public"."publish_skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "input_schema" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publish_skills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."job_publish_tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_description_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "current_step" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_publish_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."job_publish_traces" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_publish_traces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "publish_skills_name_platform_version_key"
ON "public"."publish_skills"("name", "platform", "version");

CREATE INDEX "idx_publish_skills_lookup"
ON "public"."publish_skills"("name", "platform", "is_active", "version");

CREATE INDEX "idx_publish_skills_platform_active"
ON "public"."publish_skills"("platform", "is_active");

CREATE INDEX "idx_job_publish_tasks_user_jd_created"
ON "public"."job_publish_tasks"("user_id", "job_description_id", "created_at" DESC);

CREATE INDEX "idx_job_publish_tasks_status"
ON "public"."job_publish_tasks"("status");

CREATE INDEX "idx_job_publish_tasks_skill_id"
ON "public"."job_publish_tasks"("skill_id");

CREATE UNIQUE INDEX "job_publish_traces_task_id_key"
ON "public"."job_publish_traces"("task_id");

CREATE INDEX "idx_job_publish_traces_skill_id"
ON "public"."job_publish_traces"("skill_id");

CREATE INDEX "idx_job_publish_traces_status"
ON "public"."job_publish_traces"("status");

ALTER TABLE "public"."job_publish_tasks"
ADD CONSTRAINT "job_publish_tasks_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."job_publish_tasks"
ADD CONSTRAINT "job_publish_tasks_job_description_id_fkey"
FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id")
ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."job_publish_tasks"
ADD CONSTRAINT "job_publish_tasks_skill_id_fkey"
FOREIGN KEY ("skill_id") REFERENCES "public"."publish_skills"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "public"."job_publish_traces"
ADD CONSTRAINT "job_publish_traces_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "public"."job_publish_tasks"("id")
ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."job_publish_traces"
ADD CONSTRAINT "job_publish_traces_skill_id_fkey"
FOREIGN KEY ("skill_id") REFERENCES "public"."publish_skills"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
