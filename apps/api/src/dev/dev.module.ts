import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DevController],
})
export class DevModule {}
