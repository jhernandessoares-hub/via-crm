import { ConfigModule } from './config/config.module';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { SitesModule } from './sites/sites.module';
import { CorrespondentsModule } from './correspondents/correspondents.module';
import { CreditRequestsModule } from './credit-requests/credit-requests.module';
import { WhatsappUnofficialModule } from './whatsapp-unofficial/whatsapp-unofficial.module';
import { CampanhasModule } from './campanhas/campanhas.module';
import { InboxModule } from './inbox/inbox.module';
import { DevelopmentsModule } from './developments/developments.module';

@Module({
  imports: [
    // Rate limiting — aplicado apenas nas rotas de auth via @Throttle() no AuthController
    ThrottlerModule.forRoot([
      { name: 'auth', ttl: 900_000, limit: 10 },
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
    ...(process.env.NODE_ENV !== 'production' ? [DevModule] : []),
    OwnersModule,
    AdminModule,
    SitesModule,
    CorrespondentsModule,
    CreditRequestsModule,
    WhatsappUnofficialModule,
    CampanhasModule,
    InboxModule,
    DevelopmentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
  ],
})
export class AppModule {}