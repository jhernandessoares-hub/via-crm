import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
      },
      include: {
        images: { orderBy: this.imagesOrderBy() },
        videos: { orderBy: this.videosOrderBy() },
        documents: { orderBy: this.documentsOrderBy() },
      },
    });
  }

  async list(user: any, status?: ProductStatus, origin?: ProductOrigin) {
    return this.prisma.product.findMany({
      where: {
        tenantId: user.tenantId,
        ...(status ? { status } : {}),
        ...(origin ? { origin } : {}),
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

  async update(user: any, id: string, body: any) {
    await this.getById(user, id);

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
    await this.getById(user, id);

    await this.prisma.product.delete({
      where: { id },
    });

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
    await this.getById(user, productId);

    const doc = await this.prisma.productDocument.findFirst({
      where: { id: documentId, tenantId: user.tenantId, productId },
    });

    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (!doc.url) throw new BadRequestException('Documento sem URL');

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

      const base = this.safeFileNameBase(doc.title || `${doc.type || 'DOCUMENTO'}_${doc.id}`);
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
}