import { Module } from '@nestjs/common';
import { OwnersService } from './owners.service';
import { OwnersController, ProductOwnersController } from './owners.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryService } from '../products/cloudinary.service';

@Module({
  imports: [PrismaModule],
  controllers: [OwnersController, ProductOwnersController],
  providers: [OwnersService, CloudinaryService],
})
export class OwnersModule {}
