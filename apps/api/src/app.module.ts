import { ConfigModule } from './config/config.module';
import { Module } from '@nestjs/common';
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

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}