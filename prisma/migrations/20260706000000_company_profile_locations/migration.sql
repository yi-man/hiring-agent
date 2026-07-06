CREATE TABLE "public"."company_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."company_work_locations" (
    "id" TEXT NOT NULL,
    "company_profile_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_work_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_profiles_user_id_key" ON "public"."company_profiles"("user_id");

CREATE INDEX "idx_company_profiles_user_id" ON "public"."company_profiles"("user_id");

CREATE INDEX "idx_company_work_locations_profile_sort" ON "public"."company_work_locations"("company_profile_id", "sort_order");

ALTER TABLE "public"."company_profiles" ADD CONSTRAINT "company_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "public"."company_work_locations" ADD CONSTRAINT "company_work_locations_company_profile_id_fkey" FOREIGN KEY ("company_profile_id") REFERENCES "public"."company_profiles"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
