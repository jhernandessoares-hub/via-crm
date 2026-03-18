-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('APARTAMENTO', 'CASA', 'TERRENO', 'COMERCIAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DISPONIVEL', 'RESERVADO', 'VENDIDO', 'INATIVO');

-- CreateEnum
CREATE TYPE "ProductOrigin" AS ENUM ('OWN', 'THIRD_PARTY', 'DEVELOPMENT');

-- CreateEnum
CREATE TYPE "ProductImageLabel" AS ENUM ('SALA', 'QUARTO', 'COZINHA', 'LAVANDERIA', 'LAVABO', 'VARANDA', 'AREA_GOURMET', 'ACADEMIA', 'BRINQUEDOTECA', 'PISCINA', 'OUTROS');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('ENTERPRISE', 'PROPERTY');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('SALE', 'RENT', 'BOTH');

-- CreateEnum
CREATE TYPE "ProductRegistrationStatus" AS ENUM ('CADASTRAR', 'PRONTO');

-- CreateEnum
CREATE TYPE "ProductDocumentType" AS ENUM ('PLANTA', 'MEMORIAL', 'BOOK', 'TABELA', 'REGULAMENTO', 'OUTROS');

-- CreateEnum
CREATE TYPE "ProductDocVisibility" AS ENUM ('INTERNAL', 'SHAREABLE');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "title" TEXT NOT NULL,
    "type" "ProductType" NOT NULL DEFAULT 'OUTRO',
    "status" "ProductStatus" NOT NULL DEFAULT 'DISPONIVEL',
    "registrationStatus" "ProductRegistrationStatus" NOT NULL DEFAULT 'CADASTRAR',
    "kind" "ProductKind" NOT NULL DEFAULT 'PROPERTY',
    "dealType" "DealType" NOT NULL DEFAULT 'SALE',
    "price" DECIMAL(18,2),
    "city" TEXT,
    "neighborhood" TEXT,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "areaM2" INTEGER,
    "description" TEXT,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "origin" "ProductOrigin" NOT NULL DEFAULT 'OWN',
    "capturedByUserId" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customLabel" TEXT,
    "label" "ProductImageLabel" NOT NULL DEFAULT 'OUTROS',
    "publishSite" BOOLEAN NOT NULL DEFAULT true,
    "publishSocial" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_videos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "publishSite" BOOLEAN NOT NULL DEFAULT true,
    "publishSocial" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "title" TEXT,
    "type" "ProductDocumentType" NOT NULL DEFAULT 'OUTROS',
    "visibility" "ProductDocVisibility" NOT NULL DEFAULT 'INTERNAL',
    "aiExtractable" BOOLEAN NOT NULL DEFAULT true,
    "versionLabel" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_tenantId_status_idx" ON "products"("tenantId", "status");

-- CreateIndex
CREATE INDEX "products_tenantId_type_idx" ON "products"("tenantId", "type");

-- CreateIndex
CREATE INDEX "products_tenantId_origin_idx" ON "products"("tenantId", "origin");

-- CreateIndex
CREATE INDEX "products_tenantId_origin_status_idx" ON "products"("tenantId", "origin", "status");

-- CreateIndex
CREATE INDEX "products_tenantId_city_neighborhood_idx" ON "products"("tenantId", "city", "neighborhood");

-- CreateIndex
CREATE INDEX "products_tenantId_branchId_idx" ON "products"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "products_tenantId_kind_idx" ON "products"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "products_tenantId_dealType_idx" ON "products"("tenantId", "dealType");

-- CreateIndex
CREATE INDEX "products_tenantId_registrationStatus_idx" ON "products"("tenantId", "registrationStatus");

-- CreateIndex
CREATE INDEX "products_tenantId_capturedByUserId_idx" ON "products"("tenantId", "capturedByUserId");

-- CreateIndex
CREATE INDEX "product_images_tenantId_productId_idx" ON "product_images"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "product_videos_tenantId_productId_idx" ON "product_videos"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "product_documents_tenantId_productId_idx" ON "product_documents"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "product_documents_tenantId_type_idx" ON "product_documents"("tenantId", "type");

-- CreateIndex
CREATE INDEX "product_documents_tenantId_visibility_idx" ON "product_documents"("tenantId", "visibility");

-- CreateIndex
CREATE INDEX "product_documents_tenantId_productId_type_idx" ON "product_documents"("tenantId", "productId", "type");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_videos" ADD CONSTRAINT "product_videos_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_videos" ADD CONSTRAINT "product_videos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
