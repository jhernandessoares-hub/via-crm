import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessageTemplatesService } from './message-templates.service';

@UseGuards(JwtAuthGuard)
@Controller('message-templates')
export class MessageTemplatesController {
  constructor(private readonly service: MessageTemplatesService) {}

  @Get()
  list(@Req() req: any) {
    return this.service.list(req.user.tenantId, req.user.sub || req.user.id);
  }

  @Post()
  create(@Req() req: any, @Body() body: { title?: string; content?: string }) {
    return this.service.create(
      req.user.tenantId,
      req.user.sub || req.user.id,
      body,
    );
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { title?: string; content?: string },
  ) {
    return this.service.update(
      req.user.tenantId,
      req.user.sub || req.user.id,
      id,
      body,
    );
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(
      req.user.tenantId,
      req.user.sub || req.user.id,
      id,
    );
  }
}
