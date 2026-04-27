import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as path from 'path';

// ── Prevent Puppeteer/WhatsApp context errors from crashing the process ───────
const logger = new Logger('ProcessGuard');

process.on('uncaughtException', (err: Error) => {
  const msg = err?.message || '';
  if (
    msg.includes('Execution context was destroyed') ||
    msg.includes('Protocol error') ||
    msg.includes('Target closed') ||
    msg.includes('Session closed') ||
    msg.includes('Navigation failed')
  ) {
    logger.warn(`[ProcessGuard] Suppressed Puppeteer error: ${msg}`);
    return; // swallow — WhatsApp disconnected event will handle cleanup
  }
  logger.error(`[ProcessGuard] Uncaught exception: ${msg}`);
  logger.error(err.stack ?? '');
  // Don't exit for known non-fatal errors
});

process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  if (
    msg.includes('Execution context was destroyed') ||
    msg.includes('Protocol error') ||
    msg.includes('Target closed') ||
    msg.includes('Session closed')
  ) {
    logger.warn(`[ProcessGuard] Suppressed Puppeteer rejection: ${msg}`);
    return;
  }
  logger.error(`[ProcessGuard] Unhandled rejection: ${msg}`);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: true,
  });

  // Increase body size limit for base64 image uploads (default is 100kb)
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));

  // Serve uploads folder as static files → accessible at /uploads/...
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });
  app.enableCors({
    origin: true, // reflects the request origin — avoids duplicate wildcard with proxy
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'ngrok-skip-browser-warning',
    ],
    credentials: true,
  });
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map((err) => ({
          field: err.property,
          errors: Object.values(err.constraints || {}),
        }));

        return new BadRequestException({
          success: false,
          message: 'Validation failed',
          errors: formattedErrors,
          data: null,
        });
      },
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
