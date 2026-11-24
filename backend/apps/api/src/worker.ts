import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { AppModule } from './app.module';
import { PinoLogger } from './common/pino-logger.service';
import { OutboxDispatcherService } from './platform/outbox/outbox-dispatcher.service';

const DISPATCH_INTERVAL_MS = 5000;

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const config = app.get(ConfigService);
  const logger = app.get(PinoLogger);
  const dispatcher = app.get(OutboxDispatcherService);
  const redisUrl = config.get<string>('PC_REDIS_URL');

  let timer: NodeJS.Timeout;
  if (!redisUrl) {
    logger.warn('Worker started without Redis; outbox dispatch runs in-process');
    timer = setInterval(() => {
      void dispatcher.dispatchPending().catch((error) => logger.error(error, undefined, 'worker'));
    }, DISPATCH_INTERVAL_MS);
  } else {
    const url = new URL(redisUrl);
    const connection = {
      host: url.hostname,
      port: Number(url.port || 6379),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    };
    const queue = new Queue('peoplecore-outbox', { connection });
    const worker = new Worker(
      'peoplecore-outbox',
      async (job) => {
        if (job.name !== 'dispatch') return;
        await dispatcher.dispatchPending();
      },
      { connection },
    );
    worker.on('failed', (job, error) => {
      logger.error(`job ${job?.id ?? 'unknown'} failed: ${error.message}`, undefined, 'worker');
    });
    timer = setInterval(() => {
      void queue
        .add('dispatch', {}, { removeOnComplete: true, removeOnFail: 100 })
        .catch((error) => logger.error(error, undefined, 'worker'));
    }, DISPATCH_INTERVAL_MS);
    void queue.add('dispatch', {}, { removeOnComplete: true, removeOnFail: 100 });
  }

  app.enableShutdownHooks();
  process.once('SIGTERM', () => clearInterval(timer));
  process.once('SIGINT', () => clearInterval(timer));
  logger.info('Worker started');
}

void bootstrapWorker();
