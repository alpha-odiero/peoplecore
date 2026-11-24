import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PinoLogger } from '../pino-logger.service';
import { getRequestContext } from '../request-context.storage';
import { RAW_RESPONSE_KEY } from '../decorators/metadata-keys';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: PinoLogger,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method: string; originalUrl: string }>();
    const response = http.getResponse<{ statusCode: number }>();
    const started = Date.now();
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      tap({
        next: () => {
          if (raw) return;
          const ctx = getRequestContext();
          this.logger
            .child({
              method: request.method,
              path: request.originalUrl,
              statusCode: response.statusCode,
              durationMs: Date.now() - started,
              requestId: ctx.requestId,
              tenantId: ctx.tenantId,
              userId: ctx.userId,
            })
            .info('request completed');
        },
      }),
    );
  }
}
