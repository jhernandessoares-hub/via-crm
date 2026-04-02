import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'TOKEN_REFRESH'
  | 'CREATE_LEAD'
  | 'VIEW_LEAD'
  | 'DELETE_LEAD'
  | 'EXPORT_DATA'
  | 'UPDATE_QUALIFICATION'
  | 'MOVE_PIPELINE'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'PLATFORM_ADMIN_LOGIN'
  | 'PLATFORM_CREATE_TENANT'
  | 'PLATFORM_SUSPEND_TENANT'
  | 'PLATFORM_ACTIVATE_TENANT'
  | 'PLATFORM_CHANGE_PLAN'
  | 'PLATFORM_IMPERSONATE'
  | 'PLATFORM_EXPORT_TENANT_DATA';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: {
    tenantId?: string;
    userId?: string;
    action: AuditAction;
    resourceType?: string;
    resourceId?: string;
    ipAddress?: string;
    metadata?: Record<string, any>;
  }) {
    try {
      await this.prisma.auditLog.create({ data: entry });
    } catch {
      // Audit log nunca pode quebrar o fluxo principal
    }
  }
}
