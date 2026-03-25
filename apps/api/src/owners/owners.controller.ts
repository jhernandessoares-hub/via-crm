import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OwnersService } from './owners.service';

// ─── /owners ─────────────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller('owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get()
  async findAll(@Req() req: any, @Query('search') search?: string) {
    const owners = await this.ownersService.findAll(req.user.tenantId, search);
    return { ok: true, owners };
  }

  @Post()
  async create(@Req() req: any, @Body() body: any) {
    const owner = await this.ownersService.create(req.user.tenantId, body);
    return { ok: true, owner };
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const owner = await this.ownersService.findOne(id, req.user.tenantId);
    return { ok: true, owner };
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const owner = await this.ownersService.update(id, req.user.tenantId, body);
    return { ok: true, owner };
  }

  @Delete(':id')
  async delete(@Req() req: any, @Param('id') id: string) {
    return this.ownersService.delete(id, req.user.tenantId);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  async addDocument(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file?: any,
    @Body() body?: any,
  ) {
    if (!file?.buffer) throw new BadRequestException('Envie um arquivo no campo "file"');
    const doc = await this.ownersService.addDocument(
      id,
      req.user.tenantId,
      file,
      body?.type || 'OUTRO',
      body?.label,
    );
    return { ok: true, document: doc };
  }

  @Delete(':id/documents/:docId')
  async deleteDocument(
    @Req() req: any,
    @Param('id') _id: string,
    @Param('docId') docId: string,
  ) {
    return this.ownersService.deleteDocument(docId, req.user.tenantId);
  }
}

// ─── /products/:productId/owners ─────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller('products/:productId/owners')
export class ProductOwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get()
  async getProductOwners(@Req() req: any, @Param('productId') productId: string) {
    const owners = await this.ownersService.getProductOwners(productId, req.user.tenantId);
    return { ok: true, owners };
  }

  @Post()
  async linkOwner(
    @Req() req: any,
    @Param('productId') productId: string,
    @Body() body: { ownerId: string },
  ) {
    if (!body?.ownerId) throw new BadRequestException('Campo "ownerId" obrigatório');
    const link = await this.ownersService.linkToProduct(
      productId,
      body.ownerId,
      req.user.tenantId,
    );
    return { ok: true, link };
  }

  @Delete(':ownerId')
  async unlinkOwner(
    @Req() req: any,
    @Param('productId') productId: string,
    @Param('ownerId') ownerId: string,
  ) {
    return this.ownersService.unlinkFromProduct(productId, ownerId, req.user.tenantId);
  }
}
