import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveAiModel } from '../ai/resolve-ai-model';
import { Logger } from '../logger';

const logger = new Logger('ProductsService');
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import {
  ProductDocVisibility,
  ProductDocumentCategory,
  ProductDocumentType,
  ProductImageLabel,
  ProductOrigin,
  ProductStatus,
  ProductType,
} from '@prisma/client';
import { CloudinaryService } from './cloudinary.service';
import { Response } from 'express';
import { Readable } from 'stream';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  private imagesOrderBy() {
    return [
      { isPrimary: 'desc' as const },
      { sortOrder: 'asc' as const },
      { createdAt: 'asc' as const },
    ];
  }

  private videosOrderBy() {
    return [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];
  }

  private documentsOrderBy() {
    return [{ createdAt: 'desc' as const }];
  }

  private normalizeOrigin(input: any): ProductOrigin {
    if (input === undefined || input === null || input === '') return ProductOrigin.OWN;
    const raw = String(input).toUpperCase().trim();
    const allowed = Object.values(ProductOrigin) as string[];
    if (allowed.includes(raw)) return raw as ProductOrigin;
    throw new BadRequestException(`origin inválido. Use: ${allowed.join(', ')}`);
  }

  private normalizeType(input: any): ProductType | undefined {
    if (input === undefined) return undefined;
    if (input === null || input === '') return ProductType.OUTRO;
    const raw = String(input).toUpperCase().trim();
    const allowed = Object.values(ProductType) as string[];
    if (allowed.includes(raw)) return raw as ProductType;
    throw new BadRequestException(`type inválido. Use: ${allowed.join(', ')}`);
  }

  private normalizeStatus(input: any): ProductStatus | undefined {
    if (input === undefined) return undefined;
    if (input === null || input === '') return ProductStatus.ACTIVE;
    const raw = String(input).toUpperCase().trim();
    const allowed = Object.values(ProductStatus) as string[];
    if (allowed.includes(raw)) return raw as ProductStatus;
    throw new BadRequestException(`status inválido. Use: ${allowed.join(', ')}`);
  }

  private normalizeDocumentType(input: any): ProductDocumentType | undefined {
    if (input === undefined) return undefined;
    if (input === null || input === '') return ProductDocumentType.OUTROS;
    const raw = String(input).toUpperCase().trim();
    const allowed = Object.values(ProductDocumentType) as string[];
    if (allowed.includes(raw)) return raw as ProductDocumentType;
    throw new BadRequestException(`type inválido. Use: ${allowed.join(', ')}`);
  }

  private normalizeDocumentCategory(input: any): ProductDocumentCategory | undefined {
    if (input === undefined) return undefined;
    if (input === null || input === '') return ProductDocumentCategory.OTHER;
    const raw = String(input).toUpperCase().trim();
    const allowed = Object.values(ProductDocumentCategory) as string[];
    if (allowed.includes(raw)) return raw as ProductDocumentCategory;
    throw new BadRequestException(`category inválida. Use: ${allowed.join(', ')}`);
  }

  private normalizeDocumentVisibility(input: any): ProductDocVisibility | undefined {
    if (input === undefined) return undefined;
    if (input === null || input === '') return ProductDocVisibility.INTERNAL;
    const raw = String(input).toUpperCase().trim();
    const allowed = Object.values(ProductDocVisibility) as string[];
    if (allowed.includes(raw)) return raw as ProductDocVisibility;
    throw new BadRequestException(`visibility inválida. Use: ${allowed.join(', ')}`);
  }

  async create(user: any, body: any) {
    const origin = this.normalizeOrigin(body?.origin);

    return this.prisma.product.create({
      data: {
        tenantId: user.tenantId,
        branchId: body.branchId || null,
        capturedByUserId: user.id || user.sub || null,

        title: body.title,
        type: body.type || ProductType.OUTRO,
        status: body.status || ProductStatus.ACTIVE,
        origin,

        price: body.price ?? null,
        city: body.city || null,
        neighborhood: body.neighborhood || null,
        bedrooms: body.bedrooms ?? null,
        bathrooms: body.bathrooms ?? null,
        areaM2: body.areaM2 ?? null,
        description: body.description || null,
        tags: body.tags || null,

        referenceCode: body.referenceCode || null,
        registrationNumber: body.registrationNumber || null,

        state: body.state || null,
        zipCode: body.zipCode || null,
        street: body.street || null,
        streetNumber: body.streetNumber || null,
        complement: body.complement || null,
        condominiumName: body.condominiumName || null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        hideAddress: body.hideAddress ?? false,

        rentPrice: body.rentPrice ?? null,
        iptu: body.iptu ?? null,
        condominiumFee: body.condominiumFee ?? null,
        acceptsFinancing: body.acceptsFinancing ?? false,
        acceptsExchange: body.acceptsExchange ?? false,

        suites: body.suites ?? null,
        parkingSpaces: body.parkingSpaces ?? null,
        builtAreaM2: body.builtAreaM2 ?? null,
        privateAreaM2: body.privateAreaM2 ?? null,
        landAreaM2: body.landAreaM2 ?? null,
        floor: body.floor ?? null,
        totalFloors: body.totalFloors ?? null,
        yearBuilt: body.yearBuilt ?? null,
        sunPosition: body.sunPosition || null,

        propertySituation: body.propertySituation || null,
        hasExclusivity: body.hasExclusivity ?? false,
        exclusivityUntil: body.exclusivityUntil ? new Date(body.exclusivityUntil) : null,
        virtualTourUrl: body.virtualTourUrl || null,

        internalFeatures: body.internalFeatures ?? [],
        condoFeatures: body.condoFeatures ?? [],
        standard: body.standard ?? null,
        furnished: body.furnished ?? null,
        condition: body.condition ?? null,

        developer: body.developer || null,
        totalUnits: body.totalUnits ?? null,
        totalTowers: body.totalTowers ?? null,
        floorsPerTower: body.floorsPerTower ?? null,
        privateAreaMinM2: body.privateAreaMinM2 ?? null,
        privateAreaMaxM2: body.privateAreaMaxM2 ?? null,
        parkingMin: body.parkingMin ?? null,
        parkingMax: body.parkingMax ?? null,
        deliveryForecast: body.deliveryForecast || null,
        buyerIncomeLimit: body.buyerIncomeLimit ?? null,
        socialPrograms: body.socialPrograms ?? [],
        unitTypes: body.unitTypes ?? [],
        technicalDescription: body.technicalDescription || null,
        commercialDescription: body.commercialDescription || null,
        aiGeneratedFields: body.aiGeneratedFields ?? null,
      },
      include: {
        images: { orderBy: this.imagesOrderBy() },
        videos: { orderBy: this.videosOrderBy() },
        documents: { orderBy: this.documentsOrderBy() },
      },
    });
  }

  async list(user: any, status?: ProductStatus, origin?: ProductOrigin, type?: ProductType) {
    return this.prisma.product.findMany({
      where: {
        tenantId: user.tenantId,
        ...(status ? { status } : {}),
        ...(origin ? { origin } : {}),
        ...(type ? { type } : {}),
      },
      include: {
        images: { orderBy: this.imagesOrderBy() },
        videos: { orderBy: this.videosOrderBy() },
        documents: { orderBy: this.documentsOrderBy() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(user: any, id: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
      include: {
        images: { orderBy: this.imagesOrderBy() },
        videos: { orderBy: this.videosOrderBy() },
        documents: { orderBy: this.documentsOrderBy() },
      },
    });

    if (!product) throw new NotFoundException('Produto não encontrado');

    return product;
  }

  private assertCanEditProduct(user: any, product: any) {
    if (user.role === 'OWNER') return;
    const userId = user.id || user.sub;
    if (user.role === 'MANAGER') return; // MANAGER edita qualquer produto do tenant
    // AGENT só edita o próprio
    if (product.capturedByUserId && product.capturedByUserId !== userId) {
      throw new ForbiddenException('Você só pode editar produtos que você mesmo cadastrou.');
    }
  }

  private assertCanDeleteProduct(user: any, product: any) {
    if (user.role === 'OWNER') return;
    if (user.role === 'AGENT') {
      throw new ForbiddenException(
        'Corretores não podem excluir produtos. Solicite ao gerente ou proprietário.',
      );
    }
    // MANAGER pode excluir apenas produtos de AGENTs, não de outros MANAGERs ou do OWNER
    if (user.role === 'MANAGER' && product.capturedByUserId) {
      // Precisamos checar o role do dono do produto
      return; // verificação assíncrona feita no remove()
    }
  }

  async update(user: any, id: string, body: any) {
    const product = await this.getById(user, id);
    this.assertCanEditProduct(user, product);

    const data: any = {};

    if (body.branchId !== undefined) data.branchId = body.branchId || null;
    if (body.title !== undefined) data.title = body.title;

    if (body.type !== undefined) data.type = this.normalizeType(body.type);
    if (body.status !== undefined) data.status = this.normalizeStatus(body.status);
    if (body.origin !== undefined) data.origin = this.normalizeOrigin(body.origin);

    if (body.price !== undefined) data.price = body.price ?? null;

    if (body.city !== undefined) data.city = body.city || null;
    if (body.neighborhood !== undefined) data.neighborhood = body.neighborhood || null;

    if (body.bedrooms !== undefined) data.bedrooms = body.bedrooms ?? null;
    if (body.bathrooms !== undefined) data.bathrooms = body.bathrooms ?? null;
    if (body.areaM2 !== undefined) data.areaM2 = body.areaM2 ?? null;

    if (body.description !== undefined) data.description = body.description || null;
    if (body.tags !== undefined) data.tags = body.tags || null;

    if (body.referenceCode !== undefined) data.referenceCode = body.referenceCode || null;
    if (body.registrationNumber !== undefined) data.registrationNumber = body.registrationNumber || null;

    if (body.state !== undefined) data.state = body.state || null;
    if (body.zipCode !== undefined) data.zipCode = body.zipCode || null;
    if (body.street !== undefined) data.street = body.street || null;
    if (body.streetNumber !== undefined) data.streetNumber = body.streetNumber || null;
    if (body.complement !== undefined) data.complement = body.complement || null;
    if (body.referencePoint !== undefined) data.referencePoint = body.referencePoint || null;
    if (body.condominiumName !== undefined) data.condominiumName = body.condominiumName || null;
    if (body.latitude !== undefined) data.latitude = body.latitude ?? null;
    if (body.longitude !== undefined) data.longitude = body.longitude ?? null;
    if (body.hideAddress !== undefined) data.hideAddress = body.hideAddress;

    if (body.rentPrice !== undefined) data.rentPrice = body.rentPrice ?? null;
    if (body.iptu !== undefined) data.iptu = body.iptu ?? null;
    if (body.condominiumFee !== undefined) data.condominiumFee = body.condominiumFee ?? null;
    if (body.acceptsFinancing !== undefined) data.acceptsFinancing = body.acceptsFinancing;
    if (body.acceptsExchange !== undefined) data.acceptsExchange = body.acceptsExchange;

    if (body.suites !== undefined) data.suites = body.suites ?? null;
    if (body.parkingSpaces !== undefined) data.parkingSpaces = body.parkingSpaces ?? null;
    if (body.builtAreaM2 !== undefined) data.builtAreaM2 = body.builtAreaM2 ?? null;
    if (body.privateAreaM2 !== undefined) data.privateAreaM2 = body.privateAreaM2 ?? null;
    if (body.landAreaM2 !== undefined) data.landAreaM2 = body.landAreaM2 ?? null;
    if (body.floor !== undefined) data.floor = body.floor ?? null;
    if (body.totalFloors !== undefined) data.totalFloors = body.totalFloors ?? null;
    if (body.yearBuilt !== undefined) data.yearBuilt = body.yearBuilt ?? null;
    if (body.sunPosition !== undefined) data.sunPosition = body.sunPosition || null;

    if (body.propertySituation !== undefined) data.propertySituation = body.propertySituation || null;
    if (body.hasExclusivity !== undefined) data.hasExclusivity = body.hasExclusivity;
    if (body.exclusivityUntil !== undefined) data.exclusivityUntil = body.exclusivityUntil ? new Date(body.exclusivityUntil) : null;
    if (body.virtualTourUrl !== undefined) data.virtualTourUrl = body.virtualTourUrl || null;
    if (body.visitLocations !== undefined) data.visitLocations = body.visitLocations;

    if (body.internalFeatures !== undefined) data.internalFeatures = body.internalFeatures;
    if (body.condoFeatures !== undefined) data.condoFeatures = body.condoFeatures;
    if (body.standard !== undefined) data.standard = body.standard ?? null;
    if (body.furnished !== undefined) data.furnished = body.furnished ?? null;
    if (body.condition !== undefined) data.condition = body.condition ?? null;

    if (body.developer !== undefined) data.developer = body.developer || null;
    if (body.totalUnits !== undefined) data.totalUnits = body.totalUnits ?? null;
    if (body.totalTowers !== undefined) data.totalTowers = body.totalTowers ?? null;
    if (body.floorsPerTower !== undefined) data.floorsPerTower = body.floorsPerTower ?? null;
    if (body.privateAreaMinM2 !== undefined) data.privateAreaMinM2 = body.privateAreaMinM2 ?? null;
    if (body.privateAreaMaxM2 !== undefined) data.privateAreaMaxM2 = body.privateAreaMaxM2 ?? null;
    if (body.parkingMin !== undefined) data.parkingMin = body.parkingMin ?? null;
    if (body.parkingMax !== undefined) data.parkingMax = body.parkingMax ?? null;
    if (body.deliveryForecast !== undefined) data.deliveryForecast = body.deliveryForecast || null;
    if (body.buyerIncomeLimit !== undefined) data.buyerIncomeLimit = body.buyerIncomeLimit ?? null;
    if (body.socialPrograms !== undefined) data.socialPrograms = body.socialPrograms;
    if (body.unitTypes !== undefined) data.unitTypes = body.unitTypes;
    if (body.technicalDescription !== undefined) data.technicalDescription = body.technicalDescription || null;
    if (body.commercialDescription !== undefined) data.commercialDescription = body.commercialDescription || null;
    if (body.aiGeneratedFields !== undefined) data.aiGeneratedFields = body.aiGeneratedFields;
    if (body.minBuyerIncome !== undefined) data.minBuyerIncome = body.minBuyerIncome;
    if (body.priceReviewDays !== undefined) data.priceReviewDays = body.priceReviewDays;
    if (body.acceptsFGTS !== undefined) data.acceptsFGTS = body.acceptsFGTS;
    if (body.acceptsDirectFinancing !== undefined) data.acceptsDirectFinancing = body.acceptsDirectFinancing;
    if (body.acceptsFinancing !== undefined) data.acceptsFinancing = body.acceptsFinancing;
    if (body.acceptsTradeIn !== undefined) data.acceptsTradeIn = body.acceptsTradeIn;
    if (body.tradeInTypes !== undefined) data.tradeInTypes = body.tradeInTypes;
    if (body.minEntryValue !== undefined) data.minEntryValue = body.minEntryValue ?? null;
    if (body.installmentEntryMonths !== undefined) data.installmentEntryMonths = body.installmentEntryMonths;
    if (body.paymentConditions !== undefined) data.paymentConditions = body.paymentConditions || null;
    if (body.unitSpecs !== undefined) data.unitSpecs = body.unitSpecs;

    if (body.dealType !== undefined) data.dealType = body.dealType;
    if (body.kind !== undefined) data.kind = body.kind;
    if (body.publicationStatus !== undefined) data.publicationStatus = body.publicationStatus;
    if (body.registrationStatus !== undefined) data.registrationStatus = body.registrationStatus;

    return this.prisma.product.update({
      where: { id },
      data,
      include: {
        images: { orderBy: this.imagesOrderBy() },
        videos: { orderBy: this.videosOrderBy() },
        documents: { orderBy: this.documentsOrderBy() },
      },
    });
  }

  async remove(user: any, id: string) {
    const product = await this.getById(user, id);

    if (user.role === 'AGENT') {
      throw new ForbiddenException(
        'Corretores não podem excluir produtos. Solicite ao gerente ou proprietário.',
      );
    }

    if (user.role === 'MANAGER' && product.capturedByUserId) {
      // MANAGER não pode excluir produto de outro MANAGER ou do OWNER
      const owner = await this.prisma.user.findFirst({
        where: { id: product.capturedByUserId, tenantId: user.tenantId },
        select: { role: true },
      });
      if (owner && owner.role !== 'AGENT') {
        throw new ForbiddenException(
          'Gerentes só podem excluir produtos cadastrados por corretores.',
        );
      }
    }

    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }

  async addImage(
    user: any,
    productId: string,
    url: string,
    opts?: {
      isPrimary?: boolean;
      sortOrder?: number;
      title?: string;
      label?: ProductImageLabel | string;
      customLabel?: string;
      publishSite?: boolean;
      publishSocial?: boolean;
    },
  ) {
    const product = await this.getById(user, productId);

    const currentCount = product.images?.length ?? 0;
    if (currentCount >= 10) throw new BadRequestException('Limite de 10 imagens por produto atingido');

    const isPrimary = !!opts?.isPrimary;

    if (isPrimary) {
      await this.prisma.productImage.updateMany({
        where: { tenantId: user.tenantId, productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    let label: ProductImageLabel = ProductImageLabel.OUTROS;
    if (opts?.label) {
      const raw = String(opts.label).toUpperCase().trim();
      const allowed = Object.values(ProductImageLabel) as string[];
      if (allowed.includes(raw)) label = raw as ProductImageLabel;
    }

    return this.prisma.productImage.create({
      data: {
        tenantId: user.tenantId,
        productId,
        url,
        isPrimary,
        sortOrder: opts?.sortOrder ?? 0,

        title: opts?.title ? String(opts.title) : null,
        label,
        customLabel: opts?.customLabel ? String(opts.customLabel) : null,
        publishSite: opts?.publishSite ?? true,
        publishSocial: opts?.publishSocial ?? false,
      },
    });
  }

  async addVideo(
    user: any,
    productId: string,
    url: string,
    opts?: { title?: string; publishSite?: boolean; publishSocial?: boolean; sortOrder?: number },
  ) {
    const product = await this.getById(user, productId);

    const currentCount = product.videos?.length ?? 0;
    if (currentCount >= 3) throw new BadRequestException('Limite de 3 vídeos por produto atingido');

    const cleanUrl = String(url || '').trim();
    if (!cleanUrl) throw new BadRequestException('Envie a URL do vídeo');

    return this.prisma.productVideo.create({
      data: {
        tenantId: user.tenantId,
        productId,
        url: cleanUrl,
        title: opts?.title ? String(opts.title) : null,
        publishSite: opts?.publishSite ?? true,
        publishSocial: opts?.publishSocial ?? false,
        sortOrder: opts?.sortOrder ?? 0,
      },
    });
  }

  async setPrimary(user: any, productId: string, imageId: string) {
    await this.getById(user, productId);

    const img = await this.prisma.productImage.findFirst({
      where: { id: imageId, tenantId: user.tenantId, productId },
    });

    if (!img) throw new NotFoundException('Imagem não encontrada');

    await this.prisma.productImage.updateMany({
      where: { tenantId: user.tenantId, productId, isPrimary: true },
      data: { isPrimary: false },
    });

    await this.prisma.productImage.update({
      where: { id: imageId },
      data: { isPrimary: true },
    });

    return { ok: true };
  }

  // =========================
  // IMAGES - DELETE + PATCH
  // =========================

  async deleteImage(user: any, productId: string, imageId: string) {
    await this.getById(user, productId);

    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, tenantId: user.tenantId, productId },
    });

    if (!image) throw new NotFoundException('Imagem não encontrada');

    await this.prisma.productImage.delete({ where: { id: imageId } });

    if (image.isPrimary) {
      const next = await this.prisma.productImage.findFirst({
        where: { tenantId: user.tenantId, productId },
        orderBy: this.imagesOrderBy(),
      });

      if (next) {
        await this.prisma.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    return { ok: true };
  }

  async updateImage(
    user: any,
    productId: string,
    imageId: string,
    body: {
      title?: string | null;
      label?: ProductImageLabel | string | null;
      customLabel?: string | null;
      publishSite?: boolean;
      publishSocial?: boolean;
      sortOrder?: number;
      isPrimary?: boolean;
    },
  ) {
    await this.getById(user, productId);

    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, tenantId: user.tenantId, productId },
    });

    if (!image) throw new NotFoundException('Imagem não encontrada');

    let labelToSave: ProductImageLabel | undefined = undefined;
    if (body.label !== undefined && body.label !== null) {
      const raw = String(body.label).toUpperCase().trim();
      const allowed = Object.values(ProductImageLabel) as string[];
      labelToSave = allowed.includes(raw) ? (raw as ProductImageLabel) : ProductImageLabel.OUTROS;
    }

    if (body.isPrimary === true) {
      await this.prisma.productImage.updateMany({
        where: { tenantId: user.tenantId, productId, NOT: { id: imageId } },
        data: { isPrimary: false },
      });
    }

    return this.prisma.productImage.update({
      where: { id: imageId },
      data: {
        title: body.title === undefined ? undefined : body.title ? String(body.title) : null,
        label: labelToSave,
        customLabel:
          body.customLabel === undefined ? undefined : body.customLabel ? String(body.customLabel) : null,
        publishSite: body.publishSite ?? undefined,
        publishSocial: body.publishSocial ?? undefined,
        sortOrder: body.sortOrder ?? undefined,
        isPrimary: body.isPrimary ?? undefined,
      },
    });
  }

  // =========================
  // IMAGES - REORDER
  // =========================

  async reorderImages(user: any, productId: string, ids: string[]) {
    await this.getById(user, productId);

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Envie "ids" com pelo menos 1 item');
    }

    const cleanIds = ids.map((x) => String(x).trim()).filter(Boolean);

    const unique = new Set(cleanIds);
    if (unique.size !== cleanIds.length) throw new BadRequestException('IDs duplicados em "ids"');

    const existing = await this.prisma.productImage.findMany({
      where: { tenantId: user.tenantId, productId },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((x) => x.id));
    for (const id of cleanIds) {
      if (!existingIds.has(id)) throw new BadRequestException(`Imagem inválida para este produto: ${id}`);
    }

    await this.prisma.$transaction(
      cleanIds.map((id, index) =>
        this.prisma.productImage.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.prisma.product.findFirst({
      where: { id: productId, tenantId: user.tenantId },
      include: {
        images: { orderBy: this.imagesOrderBy() },
        videos: { orderBy: this.videosOrderBy() },
        documents: { orderBy: this.documentsOrderBy() },
      },
    });
  }

  // =========================
  // VIDEOS - DELETE + PATCH
  // =========================

  async deleteVideo(user: any, productId: string, videoId: string) {
    await this.getById(user, productId);

    const video = await this.prisma.productVideo.findFirst({
      where: { id: videoId, tenantId: user.tenantId, productId },
    });

    if (!video) throw new NotFoundException('Vídeo não encontrado');

    await this.prisma.productVideo.delete({ where: { id: videoId } });

    return { ok: true };
  }

  async updateVideo(
    user: any,
    productId: string,
    videoId: string,
    body: {
      url?: string;
      title?: string | null;
      publishSite?: boolean;
      publishSocial?: boolean;
      sortOrder?: number;
    },
  ) {
    await this.getById(user, productId);

    const video = await this.prisma.productVideo.findFirst({
      where: { id: videoId, tenantId: user.tenantId, productId },
    });

    if (!video) throw new NotFoundException('Vídeo não encontrado');

    let urlToSave: string | undefined = undefined;
    if (body.url !== undefined) {
      const cleanUrl = String(body.url || '').trim();
      if (!cleanUrl) throw new BadRequestException('Envie a URL do vídeo');
      urlToSave = cleanUrl;
    }

    return this.prisma.productVideo.update({
      where: { id: videoId },
      data: {
        url: urlToSave,
        title: body.title === undefined ? undefined : body.title ? String(body.title) : null,
        publishSite: body.publishSite ?? undefined,
        publishSocial: body.publishSocial ?? undefined,
        sortOrder: body.sortOrder ?? undefined,
      },
    });
  }

  // =========================
  // DOCUMENTS
  // =========================

  async listDocuments(user: any, productId: string) {
    await this.getById(user, productId);

    return this.prisma.productDocument.findMany({
      where: { tenantId: user.tenantId, productId },
      orderBy: this.documentsOrderBy(),
    });
  }

  async addDocument(
    user: any,
    productId: string,
    input: {
      url: string;
      publicId: string;
      title?: string | null;
      category?: ProductDocumentCategory | string | null;
      type?: ProductDocumentType | string | null;
      notes?: string | null;
      visibility?: ProductDocVisibility | string | null;
      aiExtractable?: boolean;
      versionLabel?: string | null;
    },
  ) {
    const product = await this.getById(user, productId);

    const currentCount = product.documents?.length ?? 0;
    if (currentCount >= 10) throw new BadRequestException('Limite de 10 documentos por produto atingido');

    const cleanUrl = String(input?.url || '').trim();
    const cleanPublicId = String(input?.publicId || '').trim();

    if (!cleanUrl) throw new BadRequestException('Envie a URL do documento');
    if (!cleanPublicId) throw new BadRequestException('Envie o publicId do documento');

    const categoryToSave =
      input.category === undefined ? undefined : this.normalizeDocumentCategory(input.category);
    const typeToSave = input.type === undefined ? undefined : this.normalizeDocumentType(input.type);
    const visibilityToSave =
      input.visibility === undefined ? undefined : this.normalizeDocumentVisibility(input.visibility);

    return this.prisma.productDocument.create({
      data: {
        tenantId: user.tenantId,
        productId,
        url: cleanUrl,
        publicId: cleanPublicId,

        title: input.title === undefined ? undefined : input.title ? String(input.title) : null,
        category: categoryToSave,
        type: typeToSave,
        notes: input.notes === undefined ? undefined : input.notes ? String(input.notes) : null,

        visibility: visibilityToSave,
        aiExtractable: input.aiExtractable ?? undefined,
        versionLabel:
          input.versionLabel === undefined
            ? undefined
            : input.versionLabel
              ? String(input.versionLabel)
              : null,

        uploadedByUserId: user?.id ? String(user.id) : null,
      },
    });
  }

  async updateDocument(
    user: any,
    productId: string,
    documentId: string,
    body: {
      title?: string | null;
      category?: ProductDocumentCategory | string | null;
      type?: ProductDocumentType | string | null;
      notes?: string | null;
      visibility?: ProductDocVisibility | string | null;
      aiExtractable?: boolean;
      versionLabel?: string | null;
    },
  ) {
    await this.getById(user, productId);

    const doc = await this.prisma.productDocument.findFirst({
      where: { id: documentId, tenantId: user.tenantId, productId },
    });

    if (!doc) throw new NotFoundException('Documento não encontrado');

    const categoryToSave =
      body.category === undefined
        ? undefined
        : body.category === null
          ? null
          : this.normalizeDocumentCategory(body.category);

    const typeToSave =
      body.type === undefined ? undefined : body.type === null ? null : this.normalizeDocumentType(body.type);

    const visibilityToSave =
      body.visibility === undefined
        ? undefined
        : body.visibility === null
          ? null
          : this.normalizeDocumentVisibility(body.visibility);

    return this.prisma.productDocument.update({
      where: { id: documentId },
      data: {
        title: body.title === undefined ? undefined : body.title ? String(body.title) : null,
        category: categoryToSave ?? undefined,
        type: typeToSave ?? undefined,
        notes: body.notes === undefined ? undefined : body.notes ? String(body.notes) : null,
        visibility: visibilityToSave ?? undefined,
        aiExtractable: body.aiExtractable ?? undefined,
        versionLabel:
          body.versionLabel === undefined ? undefined : body.versionLabel ? String(body.versionLabel) : null,
      },
    });
  }

  async deleteDocument(user: any, productId: string, documentId: string) {
    await this.getById(user, productId);

    const doc = await this.prisma.productDocument.findFirst({
      where: { id: documentId, tenantId: user.tenantId, productId },
    });

    if (!doc) throw new NotFoundException('Documento não encontrado');

    // 1) tenta deletar no Cloudinary (idempotente)
    await this.cloudinary.deleteByPublicId(doc.publicId);

    // 2) deleta do banco
    await this.prisma.productDocument.delete({
      where: { id: documentId },
    });

    return { ok: true };
  }

  // =========================
  // ROOMS
  // =========================

  async getRooms(user: any, productId: string) {
    await this.getById(user, productId);

    return this.prisma.productRoom.findMany({
      where: { productId, tenantId: user.tenantId },
      include: {
        images: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async addRoom(
    user: any,
    productId: string,
    body: { type: string; label: string; sizeM2?: string; notes?: string; order?: number },
  ) {
    await this.getById(user, productId);

    if (!body.type) throw new BadRequestException('Envie o campo "type"');
    if (!body.label) throw new BadRequestException('Envie o campo "label"');

    return this.prisma.productRoom.create({
      data: {
        productId,
        tenantId: user.tenantId,
        type: String(body.type).trim(),
        label: String(body.label).trim(),
        sizeM2: body.sizeM2 ? String(body.sizeM2).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        order: body.order ?? 0,
      },
      include: {
        images: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
      },
    });
  }

  async updateRoom(
    user: any,
    roomId: string,
    body: { label?: string; sizeM2?: string | null; notes?: string | null; order?: number },
  ) {
    const room = await this.prisma.productRoom.findFirst({
      where: { id: roomId, tenantId: user.tenantId },
    });

    if (!room) throw new NotFoundException('Cômodo não encontrado');

    const data: any = {};
    if (body.label !== undefined) data.label = String(body.label).trim();
    if (body.sizeM2 !== undefined) data.sizeM2 = body.sizeM2 ? String(body.sizeM2).trim() : null;
    if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;
    if (body.order !== undefined) data.order = body.order;

    return this.prisma.productRoom.update({
      where: { id: roomId },
      data,
      include: {
        images: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
      },
    });
  }

  async deleteRoom(user: any, roomId: string) {
    const room = await this.prisma.productRoom.findFirst({
      where: { id: roomId, tenantId: user.tenantId },
      include: { images: true },
    });

    if (!room) throw new NotFoundException('Cômodo não encontrado');

    // delete Cloudinary images (best-effort)
    for (const img of room.images) {
      if (img.publicId) {
        await this.cloudinary.deleteByPublicId(img.publicId).catch(() => null);
      }
    }

    // cascade deletes ProductRoomImage via DB
    await this.prisma.productRoom.delete({ where: { id: roomId } });

    return { ok: true };
  }

  async addRoomImage(user: any, roomId: string, file: any) {
    const room = await this.prisma.productRoom.findFirst({
      where: { id: roomId, tenantId: user.tenantId },
      include: { images: { select: { id: true } } },
    });

    if (!room) throw new NotFoundException('Cômodo não encontrado');

    const folder = `via-crm/${user.tenantId}/products/${room.productId}/rooms/${roomId}`;
    const result: any = await this.cloudinary.uploadImage(file.buffer, folder);

    const url = result?.secure_url || result?.url;
    if (!url) throw new BadRequestException('Cloudinary não retornou URL');

    const publicId = result?.public_id || result?.publicId || null;
    const nextOrder = room.images.length;

    return this.prisma.productRoomImage.create({
      data: {
        roomId,
        url,
        publicId,
        order: nextOrder,
      },
    });
  }

  async deleteRoomImage(user: any, imageId: string) {
    const image = await this.prisma.productRoomImage.findFirst({
      where: { id: imageId, room: { tenantId: user.tenantId } },
    });

    if (!image) throw new NotFoundException('Imagem não encontrada');

    if (image.publicId) {
      await this.cloudinary.deleteByPublicId(image.publicId).catch(() => null);
    }

    await this.prisma.productRoomImage.delete({ where: { id: imageId } });

    return { ok: true };
  }

  // =========================
  // AI IMAGE ANALYSIS
  // =========================

  async analyzeImage(user: any, productId: string, imageId: string) {
    const img = await this.prisma.productImage.findFirst({
      where: { id: imageId, tenantId: user.tenantId, productId },
    });
    if (!img) throw new NotFoundException('Imagem não encontrada');

    const modelName = await resolveAiModel(this.prisma, 'DOC_CLASSIFICATION', { allowDefaultFallback: false })
      .catch(() => 'claude-haiku-4-5-20251001');

    const client = new Anthropic();

    const prompt = `Você é um assistente especializado em análise de fotos de imóveis residenciais brasileiros.
Analise esta foto e retorne SOMENTE um JSON válido, sem texto adicional, com este formato exato:
{
  "roomType": "um dos valores: QUARTO, SUITE, BANHEIRO, LAVABO, CLOSET, SALA_ESTAR, SALA_JANTAR, COZINHA, VARANDA, AREA_GOURMET, AREA_SERVICO, ESCRITORIO, GARAGEM, PISCINA, QUINTAL, FACHADA, CORREDOR, LAVANDERIA, DEPOSITO, OUTRO",
  "roomLabel": "nome descritivo em português, ex: Suíte Master, Sala de Estar, Varanda Gourmet, Fachada",
  "features": ["lista de características visíveis, escolha entre: ARMARIO_EMBUTIDO, CLOSET, BANHEIRA, CHURRASQUEIRA, PISCINA, SACADA, VISTA_MAR, VISTA_CIDADE, VISTA_CAMPO, JANELA_AMPLA, PIA_DUPLA, LAVABO_EMBUTIDO, PORCELANATO, PISO_MADEIRA, TETO_ALTO, ILUMINACAO_NATURAL, AREA_GOURMET"]
}`;

    try {
      const response = await client.messages.create({
        model: modelName,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: img.url } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      });

      const raw = (response.content[0] as any)?.text ?? '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Resposta inválida da IA');

      const parsed = JSON.parse(jsonMatch[0]);
      const roomType = String(parsed.roomType ?? 'OUTRO').toUpperCase();
      const roomLabel = String(parsed.roomLabel ?? '').trim() || roomType;
      const features: string[] = Array.isArray(parsed.features) ? parsed.features.map(String) : [];

      await this.prisma.productImage.update({
        where: { id: imageId },
        data: { aiRoomType: roomType, aiRoomLabel: roomLabel, aiFeatures: features, aiAnalyzed: true, aiConfirmed: false },
      });

      return { ok: true, roomType, roomLabel, features };
    } catch (err) {
      logger.error('analyzeImage error', err);
      await this.prisma.productImage.update({
        where: { id: imageId },
        data: { aiAnalyzed: true, aiRoomType: 'OUTRO', aiRoomLabel: 'Não identificado', aiFeatures: [] },
      });
      return { ok: false, roomType: 'OUTRO', roomLabel: 'Não identificado', features: [] };
    }
  }

  async confirmImageRoom(
    user: any,
    productId: string,
    imageId: string,
    body: { roomType: string; roomLabel: string; features: string[] },
  ) {
    const img = await this.prisma.productImage.findFirst({
      where: { id: imageId, tenantId: user.tenantId, productId },
    });
    if (!img) throw new NotFoundException('Imagem não encontrada');

    await this.prisma.productImage.update({
      where: { id: imageId },
      data: {
        aiRoomType: body.roomType,
        aiRoomLabel: body.roomLabel,
        aiFeatures: body.features,
        aiConfirmed: true,
        title: img.title || body.roomLabel,
      },
    });

    return { ok: true };
  }

  // =========================
  // DOCUMENTS - DOWNLOAD
  // =========================

  private safeFileNameBase(input: string) {
    const s = String(input || '').trim();
    const cleaned = s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-zA-Z0-9-_ ]/g, '') // remove símbolos estranhos
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 80);

    return cleaned || 'documento';
  }

  private extFromContentType(ct?: string | null) {
    const c = String(ct || '').toLowerCase();
    if (c.includes('application/pdf')) return 'pdf';
    if (c.includes('image/jpeg')) return 'jpg';
    if (c.includes('image/png')) return 'png';
    if (c.includes('image/webp')) return 'webp';
    return 'bin';
  }

  /**
   * Resolve content-type olhando os primeiros bytes do arquivo (magic number).
   * Só usado quando o upstream vem como octet-stream/bin.
   */
  private sniffContentTypeFromHead(head: Buffer): string | null {
    if (!head || head.length < 4) return null;

    // PDF: 25 50 44 46 => "%PDF"
    if (head.length >= 4 && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) {
      return 'application/pdf';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      head.length >= 8 &&
      head[0] === 0x89 &&
      head[1] === 0x50 &&
      head[2] === 0x4e &&
      head[3] === 0x47 &&
      head[4] === 0x0d &&
      head[5] === 0x0a &&
      head[6] === 0x1a &&
      head[7] === 0x0a
    ) {
      return 'image/png';
    }

    // JPEG: FF D8 FF
    if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
      return 'image/jpeg';
    }

    // WEBP: "RIFF....WEBP"
    if (
      head.length >= 12 &&
      head[0] === 0x52 && // R
      head[1] === 0x49 && // I
      head[2] === 0x46 && // F
      head[3] === 0x46 && // F
      head[8] === 0x57 && // W
      head[9] === 0x45 && // E
      head[10] === 0x42 && // B
      head[11] === 0x50 // P
    ) {
      return 'image/webp';
    }

    return null;
  }

  async downloadDocument(user: any, productId: string, documentId: string, res: Response) {
    const product = await this.getById(user, productId);

    const doc = await this.prisma.productDocument.findFirst({
      where: { id: documentId, tenantId: user.tenantId, productId },
    });

    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (!doc.url) throw new BadRequestException('Documento sem URL');

    const productName = (product as any).title || productId;
    const docTypeLabel = { BOOK: 'Book_de_Vendas', MEMORIAL: 'Memorial_Descritivo', TABELA: 'Tabela_de_Precos', PLANTA: 'Planta', OUTROS: 'Documento' }[doc.type as string] ?? doc.type ?? 'Documento';
    const docTitle = doc.title ? `_${doc.title}` : '';
    const baseFilename = `${productName}_${docTypeLabel}${docTitle}`;

    const upstream = await fetch(doc.url);
    if (!upstream.ok) {
      throw new BadRequestException(`Falha ao baixar arquivo (status ${upstream.status})`);
    }

    // 1) Content-Type vindo do Cloudinary (às vezes vem octet-stream)
    let contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');

    // 2) Precisamos do body para stream + sniff
    if (!upstream.body) {
      // fallback: sem stream (raríssimo)
      const buf = Buffer.from(await upstream.arrayBuffer());

      // se vier octet-stream, tenta sniff pelo buffer
      if (contentType === 'application/octet-stream') {
        const sniffed = this.sniffContentTypeFromHead(buf.subarray(0, 32));
        if (sniffed) contentType = sniffed;
      }

      const base = this.safeFileNameBase(baseFilename);
      const ext = this.extFromContentType(contentType);
      const filename = `${base}.${ext}`;

      res.setHeader('Content-Type', contentType);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');

      return res.status(200).send(buf);
    }

    // 3) Stream com sniff do primeiro chunk (sem estourar memória)
    const reader = upstream.body.getReader();
    const first = await reader.read(); // pega o primeiro pedaço
    const firstChunk = first?.value ? Buffer.from(first.value) : Buffer.alloc(0);

    // se veio octet-stream, tenta detectar pelo começo do arquivo
    if (contentType === 'application/octet-stream') {
      const sniffed = this.sniffContentTypeFromHead(firstChunk.subarray(0, 32));
      if (sniffed) contentType = sniffed;
    }

    const base = this.safeFileNameBase(doc.title || `${doc.type || 'DOCUMENTO'}_${doc.id}`);
    const ext = this.extFromContentType(contentType);
    const filename = `${base}.${ext}`;

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    // reconstroi o stream: primeiro chunk + resto do reader
    async function* gen() {
      if (firstChunk.length) yield firstChunk;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) yield Buffer.from(value);
      }
    }

    Readable.from(gen()).pipe(res);
  }

  // ── AI: extract empreendimento fields from BOOK/MEMORIAL documents ──────────
  async extractInfoWithAI(user: any, productId: string) {
    logger.log(`[AI Extract] Iniciando extração para produto: ${productId}`);
    const product = await this.getById(user, productId);

    const docs = ((product as any).documents ?? []).filter(
      (d: any) => ['BOOK', 'MEMORIAL', 'TABELA', 'OUTROS'].includes(d.type),
    );

    if (!docs.length) {
      throw new BadRequestException(
        'Nenhum documento do tipo Book ou Memorial Descritivo encontrado. Faça o upload antes de usar a IA.',
      );
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) throw new BadRequestException('ANTHROPIC_API_KEY não configurada.');
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const conditionLabel: Record<string, string> = {
      NA_PLANTA: 'Na planta',
      EM_CONSTRUCAO: 'Em construção',
      PRONTO: 'Pronto',
    };
    const standardLabel: Record<string, string> = {
      ECONOMICO: 'Econômico/Popular',
      MEDIO: 'Médio padrão',
      ALTO: 'Alto padrão',
      LUXO: 'Luxo',
    };
    const pa = product as any;
    const contextInfo = [
      pa.condition ? `Estado do imóvel: ${conditionLabel[pa.condition] ?? pa.condition}` : null,
      pa.standard ? `Padrão: ${standardLabel[pa.standard] ?? pa.standard}` : null,
      pa.socialPrograms?.length ? `Programas sociais: ${pa.socialPrograms.join(', ')}` : null,
    ].filter(Boolean).join('\n');

    const prompt = `Você é um assistente especialista em empreendimentos imobiliários.
Analise os documentos anexados (Book de Vendas e/ou Memorial Descritivo) e extraia as informações abaixo em JSON.
Leia todo o conteúdo com atenção, incluindo imagens, tabelas e textos visuais.
Se uma informação não estiver disponível, use null.
${contextInfo ? `\nCONTEXTO DO PRODUTO (já informado pelo usuário — use para calibrar os textos gerados):\n${contextInfo}\n\nIMPORTANTE: A descrição comercial DEVE ser compatível com o padrão e programas informados. Se o padrão é Econômico/Popular ou há MCMV, NÃO use termos como "alto padrão", "luxuoso" ou "exclusivo".\n` : ''}
Campos esperados:
- developer: string (construtora ou incorporadora)
- totalUnits: number (total de unidades/apartamentos/lotes)
- totalTowers: number (número de torres ou blocos)
- floorsPerTower: number (andares por torre)
- privateAreaMinM2: number (área privativa mínima em m²)
- privateAreaMaxM2: number (área privativa máxima em m²)
- parkingMin: number (vagas mínimas por unidade)
- parkingMax: number (vagas máximas por unidade)
- deliveryForecast: string (previsão de entrega, ex: "12/2025")
- unitTypes: array de strings com os tipos de unidades (ex: ["Apartamento", "Studio", "Cobertura", "Casa em condomínio"]) — somente o tipo, sem detalhar quartos
- condoFeatures: array de strings (amenidades e itens de lazer, ex: ["Piscina", "Academia", "Salão de Festas"])
- technicalDescription: string (descrição técnica em 3-5 parágrafos com base nos acabamentos e especificações — mencione número de quartos, suítes, varandas, piso, lavabo, copa e pontos de ar-condicionado se disponíveis)
- commercialDescription: string (descrição comercial em 2-3 parágrafos, compatível com o padrão do empreendimento — destaque diferenciais como suíte, varanda, acabamentos)
- landAreaM2: number (área total do terreno em m²)
- price: number (preço a partir de, em reais, sem formatação — extraia da tabela de preços se disponível)
- city: string (cidade onde o empreendimento está localizado)
- state: string (estado/UF, ex: "SP", "RJ")
- neighborhood: string (bairro ou região)
- minBuyerIncome: number (renda mínima exigida, em reais)
- buyerIncomeLimit: number (renda máxima permitida, em reais — comum em MCMV)
- acceptsFGTS: boolean (aceita FGTS?)
- acceptsFinancing: boolean (aceita financiamento bancário / banco?)
- acceptsDirectFinancing: boolean (aceita financiamento direto com a incorporadora?)
- paymentConditions: string (condições de pagamento, entrada, parcelas — resumo em 1-2 frases)
- unitSpecs: array de objetos, um por tipologia de unidade encontrada no documento. Cada objeto:
  {
    bedrooms: number — quantidade de quartos,
    suites: number — quantidade de suítes (quarto com banheiro privativo),
    livingRooms: number — salas de estar/jantar,
    areaM2: number — área privativa desta tipologia em m² (se informada no documento),
    acPoints: number — pontos de ar-condicionado previstos,
    features: array de strings — LISTE TUDO que o documento menciona para esta tipologia:
      varanda (tipo: simples, gourmet, sacada), piso (tipo e material se informado),
      lavabo, copa, área de serviço, dependência de serviço, closet, banheira,
      churrasqueira, cozinha americana, ponto de gás, armários planejados,
      depósito, automação, e qualquer outro detalhe construtivo mencionado.
      Use termos claros em português, ex: ["Varanda gourmet", "Piso porcelanato", "Lavabo",
      "Área de serviço", "Closet na suíte master", "2 pontos de gás na cozinha"]
  }
  IMPORTANTE: se o documento descrever múltiplas tipologias (ex: Tipo A 2q, Tipo B 3q), crie um objeto por tipologia.

Responda SOMENTE com o JSON válido, sem markdown, sem explicações adicionais.`;

    // Download PDFs e monta content com documentos para Claude
    const contentBlocks: Anthropic.MessageParam['content'] = [];
    let docsLoaded = 0;

    for (const doc of docs) {
      try {
        logger.log(`[AI Extract] Baixando ${doc.type}...`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const resp = await fetch(doc.url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) { logger.warn(`[AI Extract] HTTP ${resp.status} para ${doc.type}`); continue; }
        const buf = Buffer.from(await resp.arrayBuffer());
        logger.log(`[AI Extract] ${doc.type} baixado: ${(buf.length / 1024).toFixed(0)}KB`);
        contentBlocks.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: buf.toString('base64'),
          },
          title: doc.title ?? doc.type,
        } as any);
        docsLoaded++;
      } catch (err) {
        logger.warn(`[AI Extract] Falha ao baixar ${doc.type} (${doc.id}): ${(err as any)?.message}`);
      }
    }

    logger.log(`[AI Extract] ${docsLoaded} docs carregados. Enviando para Claude...`);

    if (docsLoaded === 0) {
      throw new BadRequestException('Não foi possível baixar os documentos. Verifique os uploads.');
    }

    contentBlocks.push({ type: 'text', text: prompt });

    const response = await anthropic.messages.create({
      model: await resolveAiModel(this.prisma, 'PDF_EXTRACTION'),
      max_tokens: 2048,
      messages: [{ role: 'user', content: contentBlocks }],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    // Remove markdown code blocks se presentes
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    // Extrai o objeto JSON caso haja texto antes/depois
    const match = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : cleaned;

    let extracted: Record<string, any> = {};
    try {
      extracted = JSON.parse(jsonStr);
    } catch {
      console.error('Claude retornou:', raw.slice(0, 500));
      throw new BadRequestException('A IA retornou um formato inválido. Tente novamente.');
    }

    return { extracted };
  }
}