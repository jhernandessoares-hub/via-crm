-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "lastInboundAt" TIMESTAMP(3),
ADD COLUMN     "lastReferralHash" TEXT;
