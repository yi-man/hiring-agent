ALTER TABLE "company_profiles"
ADD COLUMN "supported_platforms" TEXT[] NOT NULL DEFAULT ARRAY['boss-like']::TEXT[];
