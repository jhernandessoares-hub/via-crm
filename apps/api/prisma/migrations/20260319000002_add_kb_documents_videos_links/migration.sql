-- Remove legacy links array from knowledge_bases
ALTER TABLE "knowledge_bases" DROP COLUMN IF EXISTS "links";

-- Knowledge Base Documents (PDF uploads via Cloudinary)
CREATE TABLE "knowledge_base_documents" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "knowledgeBaseId" TEXT NOT NULL,
  "url"             TEXT NOT NULL,
  "publicId"        TEXT NOT NULL,
  "title"           TEXT,
  "extractedText"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_base_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_base_documents_tenantId_knowledgeBaseId_idx"
  ON "knowledge_base_documents"("tenantId", "knowledgeBaseId");

ALTER TABLE "knowledge_base_documents"
  ADD CONSTRAINT "knowledge_base_documents_knowledgeBaseId_fkey"
  FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_base_documents"
  ADD CONSTRAINT "knowledge_base_documents_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Knowledge Base Videos (URL + title + description)
CREATE TABLE "knowledge_base_videos" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "knowledgeBaseId" TEXT NOT NULL,
  "url"             TEXT NOT NULL,
  "title"           TEXT,
  "description"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_base_videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_base_videos_tenantId_knowledgeBaseId_idx"
  ON "knowledge_base_videos"("tenantId", "knowledgeBaseId");

ALTER TABLE "knowledge_base_videos"
  ADD CONSTRAINT "knowledge_base_videos_knowledgeBaseId_fkey"
  FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_base_videos"
  ADD CONSTRAINT "knowledge_base_videos_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Knowledge Base Links (URL + title + description)
CREATE TABLE "knowledge_base_links" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "knowledgeBaseId" TEXT NOT NULL,
  "url"             TEXT NOT NULL,
  "title"           TEXT,
  "description"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_base_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_base_links_tenantId_knowledgeBaseId_idx"
  ON "knowledge_base_links"("tenantId", "knowledgeBaseId");

ALTER TABLE "knowledge_base_links"
  ADD CONSTRAINT "knowledge_base_links_knowledgeBaseId_fkey"
  FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "knowledge_base_links"
  ADD CONSTRAINT "knowledge_base_links_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
