import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductOrigin, ProductStatus, ProductType } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from './cloudinary.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AddVideoDto } from './dto/add-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { UpdateImageDto } from './dto/update-image.dto';
import { AddDocumentDto } from './dto/add-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import type { Response } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() body: CreateProductDto) {
    return this.productsService.create(req.user, body);
  }

  @Get()
  async list(
    @Req() req: any,
    @Query('status') status?: ProductStatus,
    @Query('origin') origin?: ProductOrigin,
    @Query('type') type?: ProductType,
  ) {
    return this.productsService.list(req.user, status, origin, type);
  }

  @Get(':id')
  async getById(@Req() req: any, @Param('id') id: string) {
    return this.productsService.getById(req.user, id);
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.productsService.update(req.user, id, body);
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.productsService.remove(req.user, id);
  }

  @Post(':id/ai/extract')
  async extractInfo(@Req() req: any, @Param('id') id: string) {
    return this.productsService.extractInfoWithAI(req.user, id);
  }

  // =========================
  // 📸 IMAGENS
  // =========================

  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file?: any,
    @Body('label') label?: string,
    @Body('title') title?: string,
    @Body('customLabel') customLabel?: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Envie um arquivo no campo "file"');
    }

    const folder = `via-crm/${req.user.tenantId}/products/${id}`;
    const result: any = await this.cloudinary.uploadImage(file.buffer, folder);

    const url = result?.secure_url || result?.url;
    if (!url) throw new BadRequestException('Cloudinary não retornou URL');

    const img = await this.productsService.addImage(req.user, id, url, {
      label: label || undefined,
      title: title || undefined,
      customLabel: customLabel || undefined,
    });

    return { ok: true, image: img, url };
  }

  @Post(':id/images/reorder')
  async reorderImages(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.productsService.reorderImages(req.user, id, body?.ids);
  }

  @Post(':id/images/:imageId/primary')
  async setPrimary(
    @Req() req: any,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productsService.setPrimary(req.user, id, imageId);
  }

  @Delete(':id/images/:imageId')
  async deleteImage(
    @Req() req: any,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productsService.deleteImage(req.user, id, imageId);
  }

  @Patch(':id/images/:imageId')
  async updateImage(
    @Req() req: any,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Body() body: UpdateImageDto,
  ) {
    return this.productsService.updateImage(req.user, id, imageId, body);
  }

  // =========================
  // 🎥 VÍDEOS
  // =========================

  @Post(':id/videos')
  async addVideo(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: AddVideoDto,
  ) {
    const video = await this.productsService.addVideo(req.user, id, body.url, {
      title: body.title,
      publishSite: body.publishSite,
      publishSocial: body.publishSocial,
      sortOrder: body.sortOrder,
    });

    return { ok: true, video };
  }

  @Patch(':id/videos/:videoId')
  async updateVideo(
    @Req() req: any,
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @Body() body: UpdateVideoDto,
  ) {
    return this.productsService.updateVideo(req.user, id, videoId, body);
  }

  @Delete(':id/videos/:videoId')
  async deleteVideo(
    @Req() req: any,
    @Param('id') id: string,
    @Param('videoId') videoId: string,
  ) {
    return this.productsService.deleteVideo(req.user, id, videoId);
  }

  // =========================
  // 🛏️ CÔMODOS
  // =========================

  @Get(':id/rooms')
  async getRooms(@Req() req: any, @Param('id') id: string) {
    const rooms = await this.productsService.getRooms(req.user, id);
    return { ok: true, rooms };
  }

  @Post(':id/rooms')
  async addRoom(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const room = await this.productsService.addRoom(req.user, id, body);
    return { ok: true, room };
  }

  @Patch(':id/rooms/:roomId')
  async updateRoom(
    @Req() req: any,
    @Param('id') _id: string,
    @Param('roomId') roomId: string,
    @Body() body: any,
  ) {
    const room = await this.productsService.updateRoom(req.user, roomId, body);
    return { ok: true, room };
  }

  @Delete(':id/rooms/:roomId')
  async deleteRoom(
    @Req() req: any,
    @Param('id') _id: string,
    @Param('roomId') roomId: string,
  ) {
    return this.productsService.deleteRoom(req.user, roomId);
  }

  @Post(':id/rooms/:roomId/images')
  @UseInterceptors(FileInterceptor('file'))
  async addRoomImage(
    @Req() req: any,
    @Param('id') _id: string,
    @Param('roomId') roomId: string,
    @UploadedFile() file?: any,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Envie um arquivo no campo "file"');
    }
    const image = await this.productsService.addRoomImage(req.user, roomId, file);
    return { ok: true, image };
  }

  @Delete(':id/rooms/:roomId/images/:imageId')
  async deleteRoomImage(
    @Req() req: any,
    @Param('id') _id: string,
    @Param('roomId') _roomId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productsService.deleteRoomImage(req.user, imageId);
  }

  // =========================
  // 📄 DOCUMENTOS (CAPTAÇÃO)
  // =========================

  @Get(':id/documents')
  async listDocuments(@Req() req: any, @Param('id') id: string) {
    const docs = await this.productsService.listDocuments(req.user, id);
    return { ok: true, documents: docs };
  }

  // ✅ Download com filename correto
  @Get(':id/documents/:documentId/download')
  async downloadDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    return this.productsService.downloadDocument(req.user, id, documentId, res);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file?: any,
    @Body() body?: AddDocumentDto,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Envie um arquivo no campo "file"');
    }

    // Aceita PDF + imagens
    const mimetype = String(file?.mimetype || '').toLowerCase();
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (mimetype && !allowed.includes(mimetype)) {
      throw new BadRequestException(
        'Tipo de arquivo inválido. Aceito: PDF, JPG, PNG, WEBP',
      );
    }

    const folder = `via-crm/${req.user.tenantId}/products/${id}/documents`;

    let result: any;
    try {
      const isPdf = mimetype === 'application/pdf';

      if (isPdf) {
        result = await this.cloudinary.uploadFileRaw(file.buffer, folder);
      } else {
        result = await this.cloudinary.uploadImage(file.buffer, folder);
      }
    } catch (e: any) {
      throw new BadRequestException(
        `Falha ao enviar documento para Cloudinary: ${e?.message || 'erro desconhecido'}`,
      );
    }

    const url = result?.secure_url || result?.url;
    const publicId = result?.public_id || result?.publicId;

    if (!url) throw new BadRequestException('Cloudinary não retornou URL');
    if (!publicId) throw new BadRequestException('Cloudinary não retornou publicId');

    const doc = await this.productsService.addDocument(req.user, id, {
      url,
      publicId,
      title: body?.title,
      category: body?.category as any,
      type: body?.type as any,
      notes: body?.notes,
      visibility: body?.visibility as any,
      aiExtractable: body?.aiExtractable,
      versionLabel: body?.versionLabel,
    });

    return { ok: true, document: doc, url };
  }

  @Patch(':id/documents/:documentId')
  async updateDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body() body: UpdateDocumentDto,
  ) {
    const doc = await this.productsService.updateDocument(
      req.user,
      id,
      documentId,
      body as any,
    );
    return { ok: true, document: doc };
  }

  @Delete(':id/documents/:documentId')
  async deleteDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
  ) {
    return this.productsService.deleteDocument(req.user, id, documentId);
  }
}