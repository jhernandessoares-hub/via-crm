import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import * as path from "path";
import { startSlaWorker } from "./queue/sla.worker";
import { startWhatsappMediaWorker } from "./queue/whatsapp-media.worker";
import { startInboundAiWorker } from "./queue/inbound-ai.worker";
import { startWhatsappInboundWorker } from "./queue/whatsapp-inbound.worker";
import { PrismaService } from "./prisma/prisma.service";
import { AiService } from "./ai/ai.service";
import { QueueService } from "./queue/queue.service";
import { NestLogger, Logger } from "./logger";

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: new NestLogger() });

  // Serve arquivos estáticos de uploads (ex: /uploads/secretary/...)
  app.useStaticAssets(path.join(process.cwd(), 'public'), { prefix: '/' });

  const allowedOrigins: (string | RegExp)[] = [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3010',
    'http://127.0.0.1:3010',
  ];

  const extraOrigins = process.env.CORS_ALLOWED_ORIGINS;
  if (extraOrigins) {
    for (const o of extraOrigins.split(',')) {
      const s = o.trim();
      if (s) allowedOrigins.push(s);
    }
  }

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  await app.listen(3000);

  // 🔍 Verificar Redis antes de iniciar os workers
  const queueService = app.get(QueueService);
  const redisCheck = await queueService.redisHealthCheck();
  if (!redisCheck.ok) {
    logger.error('Redis indisponível no boot — workers iniciados mas aguardando reconexão', { error: redisCheck.error });
  } else {
    logger.log('Redis OK', { latencyMs: redisCheck.latencyMs });
  }

  // 🚀 INICIAR WORKER SLA (reutiliza instâncias do container NestJS)
  startSlaWorker(app.get(PrismaService), app.get(AiService));

  // 🚀 INICIAR WORKER WHATSAPP MEDIA (reutiliza instâncias do container NestJS)
  startWhatsappMediaWorker(app.get(PrismaService));

  // 🚀 INICIAR WORKER INBOUND AI (reutiliza instâncias do container NestJS)
  startInboundAiWorker(app.get(PrismaService), app.get(AiService));

  // 🚀 INICIAR WORKER WHATSAPP INBOUND (reutiliza instâncias do container NestJS)
  startWhatsappInboundWorker(app.get(PrismaService), queueService);
}

bootstrap();