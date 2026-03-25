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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CalendarService } from './calendar.service';

@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get('today')
  getToday(@Req() req: any) {
    return this.service.findToday(req.user.tenantId, req.user.sub || req.user.id);
  }

  @Get('events')
  findMany(
    @Req() req: any,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.service.findMany(
      req.user.tenantId,
      req.user.sub || req.user.id,
      start,
      end,
    );
  }

  @Post('events')
  create(
    @Req() req: any,
    @Body()
    body: {
      title: string;
      description?: string;
      startAt: string;
      endAt: string;
      allDay?: boolean;
      color?: string;
      leadId?: string;
    },
  ) {
    if (!body?.title?.trim()) throw new BadRequestException('"title" é obrigatório.');
    if (!body?.startAt) throw new BadRequestException('"startAt" é obrigatório.');
    if (!body?.endAt) throw new BadRequestException('"endAt" é obrigatório.');

    return this.service.create(
      req.user.tenantId,
      req.user.sub || req.user.id,
      body,
    );
  }

  @Patch('events/:id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      description?: string | null;
      startAt?: string;
      endAt?: string;
      allDay?: boolean;
      color?: string;
      leadId?: string | null;
    },
  ) {
    return this.service.update(
      req.user.tenantId,
      req.user.sub || req.user.id,
      id,
      body,
    );
  }

  @Delete('events/:id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(
      req.user.tenantId,
      req.user.sub || req.user.id,
      id,
    );
  }
}
