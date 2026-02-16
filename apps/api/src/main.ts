import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

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

  await app.listen(3000);
}

bootstrap();
