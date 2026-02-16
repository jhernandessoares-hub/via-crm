-- CreateEnum
CREATE TYPE "ManagerDecision" AS ENUM ('KEEP_OWNER', 'CHANGE_OWNER', 'BLOCK_AI', 'ALLOW_AI');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "needsManagerReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "queuePriority" INTEGER NOT NULL DEFAULT 9999,
ADD COLUMN     "telefoneKey" TEXT;

-- CreateTable
CREATE TABLE "lead_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "isReentry" BOOLEAN NOT NULL DEFAULT false,
    "sourceRef" TEXT,
    "payloadRaw" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "leadEventId" TEXT NOT NULL,
    "decision" "ManagerDecision" NOT NULL,
    "justification" TEXT NOT NULL,
    "managerUserId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_events_tenantId_leadId_idx" ON "lead_events"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "lead_events_tenantId_channel_idx" ON "lead_events"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "manager_reviews_tenantId_leadId_idx" ON "manager_reviews"("tenantId", "leadId");

-- CreateIndex
CREATE INDEX "manager_reviews_tenantId_leadEventId_idx" ON "manager_reviews"("tenantId", "leadEventId");

-- CreateIndex
CREATE INDEX "leads_tenantId_telefoneKey_idx" ON "leads"("tenantId", "telefoneKey");

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_reviews" ADD CONSTRAINT "manager_reviews_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_reviews" ADD CONSTRAINT "manager_reviews_leadEventId_fkey" FOREIGN KEY ("leadEventId") REFERENCES "lead_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_reviews" ADD CONSTRAINT "manager_reviews_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
