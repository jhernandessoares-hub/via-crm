-- Renomeia FINANCIAMENTO para CREDITO
ALTER TYPE "KnowledgeBaseType" RENAME VALUE 'FINANCIAMENTO' TO 'CREDITO';

-- Adiciona novos valores ao enum
ALTER TYPE "KnowledgeBaseType" ADD VALUE IF NOT EXISTS 'INFORMACAO_GERAL';
ALTER TYPE "KnowledgeBaseType" ADD VALUE IF NOT EXISTS 'CUSTOM';

-- Adiciona coluna para categorias customizadas
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "customCategory" TEXT;
