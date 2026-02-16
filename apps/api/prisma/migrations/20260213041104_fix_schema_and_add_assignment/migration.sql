-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "aiBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "assignedUserId" TEXT;
