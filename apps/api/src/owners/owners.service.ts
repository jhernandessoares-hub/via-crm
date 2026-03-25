import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../products/cloudinary.service';
import { MaritalStatus, OwnerDocumentType } from '@prisma/client';

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private ownerInclude() {
    return {
      documents: { orderBy: { createdAt: 'asc' as const } },
    };
  }

  private async assertOwner(id: string, tenantId: string) {
    const owner = await this.prisma.owner.findFirst({
      where: { id, tenantId },
    });
    if (!owner) throw new NotFoundException('Proprietário não encontrado');
    return owner;
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(tenantId: string, body: any) {
    if (!body?.name?.trim()) throw new BadRequestException('Campo "name" obrigatório');

    return this.prisma.owner.create({
      data: {
        tenantId,
        name: String(body.name).trim(),
        cpf: body.cpf?.trim() || null,
        rg: body.rg?.trim() || null,
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        maritalStatus: body.maritalStatus ? (body.maritalStatus as MaritalStatus) : null,
        spouseName: body.spouseName?.trim() || null,
        spouseCpf: body.spouseCpf?.trim() || null,
        spouseEmail: body.spouseEmail?.trim() || null,
        zipCode: body.zipCode?.trim() || null,
        street: body.street?.trim() || null,
        streetNumber: body.streetNumber?.trim() || null,
        complement: body.complement?.trim() || null,
        neighborhood: body.neighborhood?.trim() || null,
        city: body.city?.trim() || null,
        state: body.state?.trim() || null,
      },
      include: this.ownerInclude(),
    });
  }

  async findAll(tenantId: string, search?: string) {
    return this.prisma.owner.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { cpf: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: this.ownerInclude(),
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const owner = await this.prisma.owner.findFirst({
      where: { id, tenantId },
      include: this.ownerInclude(),
    });
    if (!owner) throw new NotFoundException('Proprietário não encontrado');
    return owner;
  }

  async update(id: string, tenantId: string, body: any) {
    await this.assertOwner(id, tenantId);

    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.cpf !== undefined) data.cpf = body.cpf?.trim() || null;
    if (body.rg !== undefined) data.rg = body.rg?.trim() || null;
    if (body.email !== undefined) data.email = body.email?.trim() || null;
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
    if (body.maritalStatus !== undefined) data.maritalStatus = body.maritalStatus || null;
    if (body.spouseName !== undefined) data.spouseName = body.spouseName?.trim() || null;
    if (body.spouseCpf !== undefined) data.spouseCpf = body.spouseCpf?.trim() || null;
    if (body.spouseEmail !== undefined) data.spouseEmail = body.spouseEmail?.trim() || null;
    if (body.zipCode !== undefined) data.zipCode = body.zipCode?.trim() || null;
    if (body.street !== undefined) data.street = body.street?.trim() || null;
    if (body.streetNumber !== undefined) data.streetNumber = body.streetNumber?.trim() || null;
    if (body.complement !== undefined) data.complement = body.complement?.trim() || null;
    if (body.neighborhood !== undefined) data.neighborhood = body.neighborhood?.trim() || null;
    if (body.city !== undefined) data.city = body.city?.trim() || null;
    if (body.state !== undefined) data.state = body.state?.trim() || null;

    return this.prisma.owner.update({
      where: { id },
      data,
      include: this.ownerInclude(),
    });
  }

  async delete(id: string, tenantId: string) {
    await this.assertOwner(id, tenantId);

    // delete Cloudinary documents best-effort
    const docs = await this.prisma.ownerDocument.findMany({ where: { ownerId: id } });
    for (const doc of docs) {
      if (doc.publicId) await this.cloudinary.deleteByPublicId(doc.publicId).catch(() => null);
    }

    await this.prisma.owner.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Documents ───────────────────────────────────────────────────────────────

  async addDocument(
    ownerId: string,
    tenantId: string,
    file: any,
    type: string,
    label?: string,
  ) {
    await this.assertOwner(ownerId, tenantId);

    if (!file?.buffer) throw new BadRequestException('Envie um arquivo no campo "file"');

    const folder = `via-crm/${tenantId}/owners/${ownerId}`;
    const mimetype = String(file.mimetype || '').toLowerCase();
    const isPdf = mimetype === 'application/pdf';

    let result: any;
    try {
      result = isPdf
        ? await this.cloudinary.uploadFileRaw(file.buffer, folder)
        : await this.cloudinary.uploadImage(file.buffer, folder);
    } catch (e: any) {
      throw new BadRequestException(
        `Falha no upload: ${e?.message || 'erro desconhecido'}`,
      );
    }

    const url = result?.secure_url || result?.url;
    if (!url) throw new BadRequestException('Cloudinary não retornou URL');

    const docType = this.normalizeDocType(type);

    return this.prisma.ownerDocument.create({
      data: {
        ownerId,
        type: docType,
        label: label?.trim() || null,
        url,
        publicId: result?.public_id || result?.publicId || null,
      },
    });
  }

  async deleteDocument(documentId: string, tenantId: string) {
    const doc = await this.prisma.ownerDocument.findFirst({
      where: { id: documentId, owner: { tenantId } },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    if (doc.publicId) await this.cloudinary.deleteByPublicId(doc.publicId).catch(() => null);

    await this.prisma.ownerDocument.delete({ where: { id: documentId } });
    return { ok: true };
  }

  private normalizeDocType(input: any): OwnerDocumentType {
    const raw = String(input || '').toUpperCase().trim();
    const allowed = Object.values(OwnerDocumentType) as string[];
    if (allowed.includes(raw)) return raw as OwnerDocumentType;
    return OwnerDocumentType.OUTRO;
  }

  // ─── Product links ────────────────────────────────────────────────────────────

  async getProductOwners(productId: string, tenantId: string) {
    // verify product belongs to tenant
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const links = await this.prisma.productOwner.findMany({
      where: { productId },
      include: {
        owner: { include: this.ownerInclude() },
      },
      orderBy: { order: 'asc' },
    });

    return links.map((l) => l.owner);
  }

  async linkToProduct(productId: string, ownerId: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Produto não encontrado');

    await this.assertOwner(ownerId, tenantId);

    const existing = await this.prisma.productOwner.findUnique({
      where: { productId_ownerId: { productId, ownerId } },
    });
    if (existing) return existing; // idempotente

    const count = await this.prisma.productOwner.count({ where: { productId } });

    return this.prisma.productOwner.create({
      data: { productId, ownerId, order: count },
    });
  }

  async unlinkFromProduct(productId: string, ownerId: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Produto não encontrado');

    await this.prisma.productOwner.deleteMany({ where: { productId, ownerId } });
    return { ok: true };
  }
}
