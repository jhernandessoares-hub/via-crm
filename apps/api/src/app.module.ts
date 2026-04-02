import { ConfigModule } from './config/config.module';
import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './audit/audit.module';
import { EmailModule } from './email/email.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { AuthModule } from './auth/auth.module';
import { LeadsModule } from './leads/leads.module';
import { UsersModule } from './users/users.module';
import { IngestModule } from './ingest/ingest.module';
import { PrivacyModule } from './privacy/privacy.module';
import { ProductsModule } from './products/products.module';
import { QueueModule } from './queue/queue.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { AiModule } from './ai/ai.module';
import { AiAgentsModule } from './ai-agents/ai-agents.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { SecretaryModule } from './secretary/secretary.module';
import { ChannelsModule } from './channels/channels.module';
import { CalendarModule } from './calendar/calendar.module';
import { DevModule } from './dev/dev.module';
import { OwnersModule } from './owners/owners.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    // 🔒 Rate limiting global (LGPD / OWASP)
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },  // 120 req/min por IP (geral)
      { name: 'auth',    ttl: 60_000, limit: 10  },  // 10 req/min em rotas de auth
    ]),
    AuditModule,
    EmailModule,
    WhatsAppModule,
    ConfigModule,
    PrismaModule,
    TenantsModule,
    AuthModule,
    LeadsModule,
    UsersModule,
    IngestModule,
    PrivacyModule,
    ProductsModule,
    QueueModule,
    PipelineModule,
    AiModule,
    AiAgentsModule,
    KnowledgeBaseModule,
    SecretaryModule,
    ChannelsModule,
    CalendarModule,
    DevModule,
    OwnersModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}