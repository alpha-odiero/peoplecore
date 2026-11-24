import { Injectable, type LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import { getRequestContext } from './request-context.storage';

@Injectable()
export class PinoLogger implements LoggerService {
  private readonly logger: Logger;

  constructor() {
    this.logger = pino({
      level: process.env.PC_LOG_LEVEL ?? 'info',
      redact: {
        paths: [
          'password',
          'newPassword',
          'passwordHash',
          'accessToken',
          'refreshToken',
          'authorization',
          'cookie',
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.newPassword',
          '*.accessToken',
          '*.refreshToken',
        ],
        remove: true,
      },
      base: { service: 'peoplecore-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  private withContext(): Logger {
    const context = getRequestContext();
    return this.logger.child({
      requestId: context.requestId || undefined,
      correlationId: context.correlationId || undefined,
      tenantId: context.tenantId || undefined,
      userId: context.userId || undefined,
    });
  }

  log(message: unknown, context?: string): void {
    this.withContext().info({ context }, stringifyMessage(message));
  }

  info(message: unknown, context?: string): void {
    this.log(message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.withContext().error({ trace, context }, stringifyMessage(message));
  }

  warn(message: unknown, context?: string): void {
    this.withContext().warn({ context }, stringifyMessage(message));
  }

  debug(message: unknown, context?: string): void {
    this.withContext().debug({ context }, stringifyMessage(message));
  }

  verbose(message: unknown, context?: string): void {
    this.debug(message, context);
  }

  child(bindings: Record<string, unknown>): Logger {
    return this.withContext().child(bindings);
  }
}

function stringifyMessage(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}
