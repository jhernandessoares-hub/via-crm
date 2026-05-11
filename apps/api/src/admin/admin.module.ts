import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PlatformAdminGuard } from './admin-auth.guard';
import { AiProvidersService } from './ai-providers.service';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';

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
  controllers: [AdminController, PlansController],
  providers: [AdminService, PlatformAdminGuard, AiProvidersService, PlansService],
  exports: [AiProvidersService],
})
export class AdminModule {}
