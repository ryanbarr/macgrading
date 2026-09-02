import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  if (process.env.NODE_ENV === 'production') {
    // Railway terminates TLS at its proxy; without this the throttler
    // keys every visitor on the proxy's IP (one shared rate bucket).
    app.set('trust proxy', 1);
  }
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
