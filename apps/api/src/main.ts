import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { startSlaWorker } from "./queue/sla.worker";
import { startWhatsappMediaWorker } from "./queue/whatsapp-media.worker";
import { startInboundAiWorker } from "./queue/inbound-ai.worker";
import { PrismaService } from "./prisma/prisma.service";
import { AiService } from "./ai/ai.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "http://localhost:3010",
      "http://127.0.0.1:3010",
    ],
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

  // 🚀 INICIAR WORKER SLA (reutiliza instâncias do container NestJS)
  startSlaWorker(app.get(PrismaService), app.get(AiService));

  // 🚀 INICIAR WORKER WHATSAPP MEDIA (reutiliza instâncias do container NestJS)
  startWhatsappMediaWorker(app.get(PrismaService));

  // 🚀 INICIAR WORKER INBOUND AI (reutiliza instâncias do container NestJS)
  startInboundAiWorker(app.get(PrismaService), app.get(AiService));
}

bootstrap();