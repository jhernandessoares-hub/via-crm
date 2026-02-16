import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConfigService {
  constructor(private prisma: PrismaService) {}

  async listManagerReasons(tenantId: string) {
    return this.prisma.managerDecisionReason.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createManagerReason(tenantId: string, label: string, sortOrder = 0) {
    return this.prisma.managerDecisionReason.create({
      data: {
        tenantId,
        label,
        sortOrder,
      },
    });
  }

  async updateManagerReason(
    tenantId: string,
    id: string,
    data: {
      label?: string;
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.prisma.managerDecisionReason.update({
      where: { id },
      data,
    });
  }
}
