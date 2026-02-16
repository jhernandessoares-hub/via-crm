/*
  Warnings:

  - You are about to drop the column `leadEventId` on the `manager_reviews` table. All the data in the column will be lost.
  - Changed the type of `decision` on the `manager_reviews` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ManagerDecisionType" AS ENUM ('KEEP_AGENT_REENTRY', 'AI_ROUTE_OTHER_IF_AVAILABLE_AFTER_QUALIFICATION', 'KEEP_CLOSED', 'AI_ROUTE_ANY_AFTER_QUALIFICATION');

-- CreateEnum
CREATE TYPE "PendingRoutingScope" AS ENUM ('OTHER_IF_AVAILABLE', 'ANY');

-- DropForeignKey
ALTER TABLE "manager_reviews" DROP CONSTRAINT "manager_reviews_leadEventId_fkey";

-- DropIndex
DROP INDEX "manager_reviews_tenantId_leadEventId_idx";

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "pendingRouting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pendingRoutingScope" "PendingRoutingScope";

-- AlterTable
ALTER TABLE "manager_reviews" DROP COLUMN "leadEventId",
ADD COLUMN     "reasonId" TEXT,
DROP COLUMN "decision",
ADD COLUMN     "decision" "ManagerDecisionType" NOT NULL,
ALTER COLUMN "justification" DROP NOT NULL;

-- DropEnum
DROP TYPE "ManagerDecision";

-- CreateTable
CREATE TABLE "manager_decision_reasons" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manager_decision_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manager_decision_reasons_tenantId_active_sortOrder_idx" ON "manager_decision_reasons"("tenantId", "active", "sortOrder");

-- AddForeignKey
ALTER TABLE "manager_decision_reasons" ADD CONSTRAINT "manager_decision_reasons_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_reviews" ADD CONSTRAINT "manager_reviews_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "manager_decision_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
