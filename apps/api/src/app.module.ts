import { ConfigModule } from './config/config.module';
import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp/whatsapp.controller';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { AuthModule } from './auth/auth.module';
import { LeadsModule } from './leads/leads.module';
import { UsersModule } from './users/users.module';
import { IngestModule } from './ingest/ingest.module';
import { PrivacyModule } from './privacy/privacy.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    TenantsModule,
    AuthModule,
    LeadsModule,
    UsersModule,
    IngestModule,
    PrivacyModule,
  ],
  controllers: [AppController, WhatsAppController],
  providers: [AppService],
})
export class AppModule {}
