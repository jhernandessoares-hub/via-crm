import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';
import { SalesLeadsService } from './sales-leads.service';
import { AdminSalesLeadsController, SalesLeadsController } from './sales-leads.controller';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.PLATFORM_ADMIN_JWT_SECRET || process.env.JWT_SECRET,
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [SalesLeadsController, AdminSalesLeadsController],
  providers: [SalesLeadsService, PlatformAdminGuard],
})
export class SalesLeadsModule {}
