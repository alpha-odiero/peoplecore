import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { RAW_RESPONSE_KEY } from '../decorators/metadata-keys';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (raw) return next.handle();

    return next.handle().pipe(
      map((body: unknown) => {
        if (body === null || body === undefined) return body;
        if (typeof body === 'object' && !Array.isArray(body)) {
          const keys = Object.keys(body);
          const isEnvelope =
            keys.includes('data') && keys.every((key) => key === 'data' || key === 'meta');
          const isProblem =
            keys.includes('type') && keys.includes('title') && keys.includes('status');
          if (isEnvelope || isProblem) return body;
        }
        return { data: body };
      }),
    );
  }
}
