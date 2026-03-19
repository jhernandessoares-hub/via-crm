-- Deduplicate leads before adding unique constraint.
-- Keeps the oldest lead (lowest criadoEm) for each (tenantId, telefoneKey) pair,
-- deleting any duplicates that may have been created by the race condition.
-- Only applies to rows where telefoneKey IS NOT NULL.
DELETE FROM "leads"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "tenantId", "telefoneKey"
        ORDER BY "criadoEm" ASC
      ) AS rn
    FROM "leads"
    WHERE "telefoneKey" IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Add unique constraint on (tenantId, telefoneKey).
-- PostgreSQL treats each NULL as distinct, so leads without a phone are unaffected.
CREATE UNIQUE INDEX "leads_tenantId_telefoneKey_key"
  ON "leads"("tenantId", "telefoneKey");
