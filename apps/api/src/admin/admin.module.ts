import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PlatformAdminGuard } from './admin-auth.guard';
import { AiProvidersService } from './ai-providers.service';

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
  controllers: [AdminController],
  providers: [AdminService, PlatformAdminGuard, AiProvidersService],
  exports: [AiProvidersService],
})
export class AdminModule {}
