import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SitesService } from './sites.service';
import { AdminSitesController } from './admin-sites.controller';
import { TenantSitesController } from './tenant-sites.controller';
import { PublicSitesController } from './public-sites.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformAdminGuard } from '../admin/admin-auth.guard';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [AdminSitesController, TenantSitesController, PublicSitesController],
  providers: [SitesService, PlatformAdminGuard],
  exports: [SitesService],
})
export class SitesModule {}
