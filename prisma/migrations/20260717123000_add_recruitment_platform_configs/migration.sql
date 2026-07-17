CREATE TABLE "recruitment_platforms" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "short_label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "default_base_url" TEXT NOT NULL,
    "default_variables" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recruitment_platforms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_recruitment_platforms" (
    "id" TEXT NOT NULL,
    "company_profile_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "username" TEXT,
    "password_encrypted" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_recruitment_platforms_pkey" PRIMARY KEY ("id")
);

INSERT INTO "recruitment_platforms" (
    "id", "label", "short_label", "description", "kind", "default_base_url", "default_variables", "updated_at"
) VALUES
    ('boss', 'BOSS 直聘', 'BOSS', 'BOSS 直聘企业端职位、牛人和沟通工作流', 'production', 'https://www.zhipin.com', '{"loginPath":"/web/user/","newJobPath":"/web/boss/job","jobsListPath":"/web/boss/job","loginSuccessPath":"/web/boss","resumeListPath":"/web/boss/resume/recommend","messagePath":"/web/boss/chat"}', CURRENT_TIMESTAMP),
    ('liepin', '猎聘', '猎聘', '猎聘企业端职位、人才和私信工作流', 'production', 'https://lpt.liepin.com', '{"loginPath":"/login","newJobPath":"/job/publish","jobsListPath":"/job/getJobList","loginSuccessPath":"/","resumeListPath":"/resume/search","messagePath":"/message"}', CURRENT_TIMESTAMP),
    ('zhilian', '智联招聘', '智联', '智联招聘企业端职位、人才和沟通工作流', 'production', 'https://rd6.zhaopin.com', '{"loginPath":"/login","newJobPath":"/app/job/publish","jobsListPath":"/app/job/list","loginSuccessPath":"/app","resumeListPath":"/app/talent/search","messagePath":"/app/message"}', CURRENT_TIMESTAMP),
    ('boss-like', 'BOSS-like（本地）', 'BOSS-like', '用于本地开发和真实链路测试的招聘站模拟器', 'local', 'http://localhost:6183', '{"loginPath":"/employer/login","newJobPath":"/employer/jobs/new","jobsListPath":"/employer/jobs","loginSuccessPath":"/employer/resumes","resumeListPath":"/employer/resumes","messagePath":"/employer/messages"}', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "company_recruitment_platforms" (
    "id", "company_profile_id", "platform_id", "base_url", "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text,
    profile."id",
    platform."id",
    platform."default_base_url",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "company_profiles" AS profile
CROSS JOIN LATERAL unnest(profile."supported_platforms") AS selected("platform_id")
JOIN "recruitment_platforms" AS platform ON platform."id" = selected."platform_id"
ON CONFLICT DO NOTHING;

ALTER TABLE "publish_skills"
ADD COLUMN "site_fingerprint" TEXT NOT NULL DEFAULT 'default';

DROP INDEX "publish_skills_name_platform_version_key";

CREATE UNIQUE INDEX "publish_skills_name_platform_site_version_key"
ON "publish_skills"("name", "platform", "site_fingerprint", "version");

DROP INDEX "idx_publish_skills_lookup";

CREATE INDEX "idx_publish_skills_lookup"
ON "publish_skills"("name", "platform", "site_fingerprint", "is_active", "version");

CREATE INDEX "idx_recruitment_platforms_active_kind"
ON "recruitment_platforms"("is_active", "kind");

CREATE UNIQUE INDEX "company_recruitment_platforms_profile_platform_key"
ON "company_recruitment_platforms"("company_profile_id", "platform_id");

CREATE INDEX "idx_company_recruitment_platforms_platform"
ON "company_recruitment_platforms"("platform_id");

ALTER TABLE "company_recruitment_platforms"
ADD CONSTRAINT "company_recruitment_platforms_company_profile_id_fkey"
FOREIGN KEY ("company_profile_id") REFERENCES "company_profiles"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "company_recruitment_platforms"
ADD CONSTRAINT "company_recruitment_platforms_platform_id_fkey"
FOREIGN KEY ("platform_id") REFERENCES "recruitment_platforms"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
