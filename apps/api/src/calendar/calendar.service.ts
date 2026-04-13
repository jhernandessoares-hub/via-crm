import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    tenantId: string,
    userId: string,
    start?: string,
    end?: string,
    eventType?: string,
    status?: string,
  ) {
    const where: any = { tenantId, userId };

    if (start || end) {
      where.startAt = {};
      if (start) where.startAt.gte = new Date(start);
      if (end) where.startAt.lte = new Date(end);
    }
    if (eventType) where.eventType = eventType;
    if (status) where.status = status;

    return this.prisma.calendarEvent.findMany({
      where,
      orderBy: { startAt: 'asc' },
    });
  }

  async findToday(tenantId: string, userId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    return this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        userId,
        startAt: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  async create(
    tenantId: string,
    userId: string,
    body: {
      title: string;
      description?: string;
      startAt: string;
      endAt: string;
      allDay?: boolean;
      color?: string;
      leadId?: string;
      eventType?: string;
      status?: string;
      productId?: string;
      location?: string;
    },
  ) {
    return this.prisma.calendarEvent.create({
      data: {
        tenantId,
        userId,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
        allDay: body.allDay ?? false,
        color: body.color || 'blue',
        leadId: body.leadId || null,
        eventType: (body.eventType as any) || 'TAREFA',
        status: (body.status as any) || 'AGENDADO',
        productId: body.productId || null,
        location: body.location?.trim() || null,
      },
    });
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    body: {
      title?: string;
      description?: string | null;
      startAt?: string;
      endAt?: string;
      allDay?: boolean;
      color?: string;
      leadId?: string | null;
      eventType?: string;
      status?: string;
      productId?: string | null;
      location?: string | null;
    },
  ) {
    const existing = await this.prisma.calendarEvent.findFirst({
      where: { id, tenantId, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Evento não encontrado.');

    const data: any = {};
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.startAt !== undefined) {
      data.startAt = new Date(body.startAt);
      data.reminderSentAt = null; // reseta para nova data ser notificada
    }
    if (body.endAt !== undefined) data.endAt = new Date(body.endAt);
    if (body.allDay !== undefined) data.allDay = body.allDay;
    if (body.color !== undefined) data.color = body.color;
    if (body.leadId !== undefined) data.leadId = body.leadId || null;
    if (body.eventType !== undefined) data.eventType = body.eventType;
    if (body.status !== undefined) data.status = body.status;
    if (body.productId !== undefined) data.productId = body.productId || null;
    if (body.location !== undefined) data.location = body.location?.trim() || null;

    return this.prisma.calendarEvent.update({ where: { id }, data });
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.calendarEvent.findFirst({
      where: { id, tenantId, userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Evento não encontrado.');

    await this.prisma.calendarEvent.delete({ where: { id } });
    return { ok: true, id };
  }
}
