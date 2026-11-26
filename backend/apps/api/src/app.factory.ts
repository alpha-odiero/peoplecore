import './runtime-env';
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { collectDefaultMetrics } from 'prom-client';
import { AppModule } from './app.module';

let metricsCollected = false;

export async function createApp(): Promise<INestApplication> {
  if (!metricsCollected) {
    collectDefaultMetrics({ prefix: 'peoplecore_' });
    metricsCollected = true;
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  const configuredOrigins = config
    .get<string>('PC_WEB_ORIGIN')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = Array.from(
    new Set([...(configuredOrigins ?? []), 'https://peoplecore-rho.vercel.app']),
  );
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: ['x-request-id', 'Idempotent-Replay'],
  });
  app.setGlobalPrefix('api/v1', {
    exclude: ['health/live', 'health/ready', 'metrics', 'api/docs'],
  });
  app.enableShutdownHooks();

  if (String(config.get('PC_SWAGGER_ENABLED')) === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PeopleCore API')
      .setDescription('Secure employment management system API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('pc_refresh')
      .addTag('Health')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.init();
  return app;
}
