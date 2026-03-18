-- CreateEnum
CREATE TYPE "ProductDocumentCategory" AS ENUM ('ENTERPRISE', 'PROPERTY', 'SELLER', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductDocumentType" ADD VALUE 'FOTOS';
ALTER TYPE "ProductDocumentType" ADD VALUE 'APRESENTACAO';
ALTER TYPE "ProductDocumentType" ADD VALUE 'CONTRATO_MINUTA';
ALTER TYPE "ProductDocumentType" ADD VALUE 'LAUDO_VISTORIA';
ALTER TYPE "ProductDocumentType" ADD VALUE 'CERTIDAO';
ALTER TYPE "ProductDocumentType" ADD VALUE 'ESCRITURA';
ALTER TYPE "ProductDocumentType" ADD VALUE 'REGISTRO_IMOVEL';
ALTER TYPE "ProductDocumentType" ADD VALUE 'MATRICULA_IMOVEL';
ALTER TYPE "ProductDocumentType" ADD VALUE 'IPTU';
ALTER TYPE "ProductDocumentType" ADD VALUE 'CONDOMINIO';
ALTER TYPE "ProductDocumentType" ADD VALUE 'HABITE_SE';
ALTER TYPE "ProductDocumentType" ADD VALUE 'AVCB';
ALTER TYPE "ProductDocumentType" ADD VALUE 'ART_RRT';
ALTER TYPE "ProductDocumentType" ADD VALUE 'PROCURACAO';
ALTER TYPE "ProductDocumentType" ADD VALUE 'DECLARACAO';
ALTER TYPE "ProductDocumentType" ADD VALUE 'COMPROVANTE_ENDERECO';
ALTER TYPE "ProductDocumentType" ADD VALUE 'COMPROVANTE_RENDA';
ALTER TYPE "ProductDocumentType" ADD VALUE 'SELLER_RG';
ALTER TYPE "ProductDocumentType" ADD VALUE 'SELLER_CPF';
ALTER TYPE "ProductDocumentType" ADD VALUE 'SELLER_CNH';
ALTER TYPE "ProductDocumentType" ADD VALUE 'SELLER_CNPJ';
ALTER TYPE "ProductDocumentType" ADD VALUE 'SELLER_CONTRATO_SOCIAL';
ALTER TYPE "ProductDocumentType" ADD VALUE 'BOLETO';
ALTER TYPE "ProductDocumentType" ADD VALUE 'COMPROVANTE_PAGAMENTO';

-- AlterTable
ALTER TABLE "product_documents" ADD COLUMN     "category" "ProductDocumentCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "notes" TEXT;

-- CreateIndex
CREATE INDEX "product_documents_tenantId_category_idx" ON "product_documents"("tenantId", "category");

-- CreateIndex
CREATE INDEX "product_documents_tenantId_productId_category_idx" ON "product_documents"("tenantId", "productId", "category");
