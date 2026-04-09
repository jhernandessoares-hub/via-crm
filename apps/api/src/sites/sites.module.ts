import { Module } from '@nestjs/common';
import { SitesService } from './sites.service';
import { AdminSitesController } from './admin-sites.controller';
import { TenantSitesController } from './tenant-sites.controller';
import { PublicSitesController } from './public-sites.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminSitesController, TenantSitesController, PublicSitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
