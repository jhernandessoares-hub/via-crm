-- CreateTable
CREATE TABLE "kb_teachings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "leadId" TEXT,
    "leadMessage" TEXT,
    "approvedResponse" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "replacedBy" TEXT,
    "replacedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kb_teachings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kb_teachings_tenantId_knowledgeBaseId_idx" ON "kb_teachings"("tenantId", "knowledgeBaseId");

-- AddForeignKey
ALTER TABLE "kb_teachings" ADD CONSTRAINT "kb_teachings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_teachings" ADD CONSTRAINT "kb_teachings_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_teachings" ADD CONSTRAINT "kb_teachings_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
