import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiErrors } from './errors';
import { Db } from './db';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000', credentials: true, allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'] });
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new ApiErrors());
  app.use((_req: unknown, res: { setHeader: (key: string, value: string) => void }, next: () => void) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const db = app.get(Db);
  const cleanupStaleAuth = async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      await db.loginAttempt.deleteMany({ where: { windowStart: { lt: oneHourAgo } } });
      await db.loginSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    } catch { /* DB idle or connecting */ }
  };
  void cleanupStaleAuth();
  const cleanupTimer = setInterval(() => void cleanupStaleAuth(), 30 * 60 * 1000);
  cleanupTimer.unref();
  app.getHttpAdapter().get('/health', async (_req: unknown, res: { status: (code: number) => { send: (body: unknown) => void } }) => {
    try { await Promise.race([db.$queryRaw`SELECT 1`, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000).unref())]); res.status(200).send({ status: 'ok' }); }
    catch { res.status(503).send({ status: 'unavailable' }); }
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}

void bootstrap();
