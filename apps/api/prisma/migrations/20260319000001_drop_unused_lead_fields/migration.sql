-- Drop unused columns from leads table.
-- aiBlocked: never queried or set in application code.
-- lastReferralHash: never queried or set in application code.
ALTER TABLE "leads" DROP COLUMN IF EXISTS "aiBlocked";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "lastReferralHash";
