DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'emailVerified'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE "public"."users" RENAME COLUMN "emailVerified" TO "email_verified";
  END IF;
END $$;
